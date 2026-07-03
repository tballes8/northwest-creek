"""
Live Price WebSocket Service
Polls FMP /stable/batch-quote for subscribed tickers and streams updates
to connected frontend clients via WebSocket.

Sprint 9 addition: on_price_update callback for alert_checker integration.
When a price updates, the callback is invoked (if set) so the alert checker
can evaluate active alerts without blocking the price stream.
"""
import asyncio
import json
from typing import Set, Dict, Optional, Callable, Awaitable
from datetime import datetime, time as dt_time
import pytz
from app.services.fmp_client import get_fmp_client, API_KEY

# How often to poll FMP for price updates (seconds)
POLL_INTERVAL = 20
# Slower cadence when no browser clients are connected — alert checking
# doesn't need sub-minute granularity, and this is what keeps the poller
# from burning FMP calls all day for nobody.
IDLE_POLL_INTERVAL = 60


class LivePriceService:
    """Service to manage live price streaming via FMP REST polling"""

    def __init__(self):
        # Alert tickers — subscribed at startup / on alert creation, never
        # removed when clients disconnect.
        self.persistent_tickers: Set[str] = set()
        # Per-client ticker subscriptions; dropped when the client disconnects.
        self.client_subscriptions: Dict = {}  # websocket → Set[str]
        self.clients: Set = set()
        self.price_cache: Dict[str, Dict] = {}  # Cache latest prices
        self.running = False

    @property
    def subscribed_tickers(self) -> Set[str]:
        """Union of persistent (alert) tickers and all live client subscriptions."""
        tickers = set(self.persistent_tickers)
        for subs in self.client_subscriptions.values():
            tickers |= subs
        return tickers

        # Sprint 9: alert checker callback
        # Signature: async def callback(ticker: str, price: float)
        self.on_price_update: Optional[Callable[[str, float], Awaitable[None]]] = None

    def is_market_hours(self) -> bool:
        """Check if current time is within market hours (9:30 AM - 4:00 PM ET)"""
        et_tz = pytz.timezone('US/Eastern')
        now_et = datetime.now(et_tz)

        # Check if weekend
        if now_et.weekday() >= 5:  # Saturday=5, Sunday=6
            return False

        # Market hours: 9:30 AM - 4:00 PM ET
        market_open = dt_time(9, 30)
        market_close = dt_time(16, 0)
        current_time = now_et.time()

        return market_open <= current_time <= market_close

    async def subscribe_to_tickers(self, tickers: Set[str], client=None):
        """Subscribe to ticker updates.

        With a client, the subscription is tied to that connection and cleaned
        up on disconnect. Without one (alert checker), it's persistent.
        """
        new_tickers = tickers - self.subscribed_tickers
        if client is not None:
            self.client_subscriptions.setdefault(client, set()).update(tickers)
        else:
            self.persistent_tickers.update(tickers)

        if new_tickers:
            print(f"📊 Subscribed to: {', '.join(new_tickers)}")

    async def unsubscribe_from_tickers(self, tickers: Set[str], client=None):
        """Unsubscribe from ticker updates (per-client unless persistent)."""
        if client is not None:
            subs = self.client_subscriptions.get(client)
            if not subs:
                return
            subs -= tickers
        else:
            self.persistent_tickers -= tickers

        # Clean up price cache for tickers nobody watches anymore
        dropped = tickers - self.subscribed_tickers
        for t in dropped:
            self.price_cache.pop(t, None)
        if dropped:
            print(f"📊 Unsubscribed from: {', '.join(dropped)}")

    async def _poll_prices(self):
        """Poll FMP batch-quote endpoint for all subscribed tickers and broadcast changes."""
        while self.running:
            # No clients connected → only alert tickers matter; poll slowly.
            interval = POLL_INTERVAL if self.clients else IDLE_POLL_INTERVAL
            try:
                tickers = self.subscribed_tickers
                if not tickers:
                    await asyncio.sleep(interval)
                    continue

                # Only poll during market hours (with a small buffer for pre/post)
                if not self.is_market_hours():
                    await asyncio.sleep(30)  # Check less frequently outside hours
                    continue

                symbols = ",".join(tickers)

                client = get_fmp_client()
                response = await client.get(
                    "batch-quote",
                    params={"symbols": symbols, "apikey": API_KEY},
                )
                response.raise_for_status()
                data = response.json()

                if not data or not isinstance(data, list):
                    await asyncio.sleep(interval)
                    continue

                for item in data:
                    ticker = item.get("symbol")
                    price = item.get("price")

                    if not ticker or price is None:
                        continue

                    # Check if price actually changed
                    cached = self.price_cache.get(ticker, {})
                    if cached.get("price") == price:
                        continue

                    # Update cache
                    self.price_cache[ticker] = {
                        "ticker": ticker,
                        "price": price,
                        "size": item.get("volume"),
                        "timestamp": item.get("timestamp"),
                        "updated_at": datetime.now().isoformat(),
                    }

                    # Broadcast to all connected clients
                    await self.broadcast_to_clients({
                        "type": "price_update",
                        "data": self.price_cache[ticker],
                    })

                    # Sprint 9: Alert checker hook
                    if self.on_price_update:
                        try:
                            await self.on_price_update(ticker, price)
                        except Exception as e:
                            # Never let alert checking crash the price stream
                            print(f"⚠️ Alert check error for {ticker}: {e}")

            except Exception as e:
                print(f"❌ Error in FMP price poller: {e}")

            await asyncio.sleep(interval)

    async def broadcast_to_clients(self, message: dict):
        """Broadcast message to all connected clients"""
        if not self.clients:
            return

        message_str = json.dumps(message)
        disconnected_clients = set()

        for client in self.clients:
            try:
                await client.send_text(message_str)
            except Exception:
                disconnected_clients.add(client)

        # Remove disconnected clients
        self.clients -= disconnected_clients

    async def add_client(self, websocket):
        """Add a new client connection"""
        self.clients.add(websocket)
        print(f"👤 Client connected. Total clients: {len(self.clients)}")

        # Send cached prices to new client
        if self.price_cache:
            await websocket.send_text(json.dumps({
                "type": "price_cache",
                "data": list(self.price_cache.values()),
            }))

    async def remove_client(self, websocket):
        """Remove a client connection and drop its ticker subscriptions."""
        self.clients.discard(websocket)
        subs = self.client_subscriptions.pop(websocket, set())
        # Prune cache for tickers no longer watched by anyone
        for t in subs - self.subscribed_tickers:
            self.price_cache.pop(t, None)
        print(f"👤 Client disconnected. Total clients: {len(self.clients)}")

    async def handle_client_message(self, websocket, message: str):
        """Handle messages from clients"""
        try:
            data = json.loads(message)

            # Guard: client messages must be dicts; ignore lists/strings
            if not isinstance(data, dict):
                return

            action = data.get("action")

            if action == "subscribe":
                tickers = set(data.get("tickers", []))
                if tickers:
                    await self.subscribe_to_tickers(tickers, client=websocket)

            elif action == "unsubscribe":
                tickers = set(data.get("tickers", []))
                if tickers:
                    await self.unsubscribe_from_tickers(tickers, client=websocket)

            elif action == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

        except Exception as e:
            print(f"❌ Error handling client message: {e}")

    async def start(self):
        """Start the live price service"""
        if self.running:
            return

        self.running = True
        print("🚀 Starting Live Price Service (FMP polling)...")

        # Check if market is open
        if not self.is_market_hours():
            print("⏰ Market is closed. Live prices will start streaming when market opens.")

        # Start polling task
        asyncio.create_task(self._poll_prices())

    async def stop(self):
        """Stop the live price service"""
        self.running = False
        print("🛑 Stopped Live Price Service")


# Global instance
live_price_service = LivePriceService()