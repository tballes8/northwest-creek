"""
Live Price WebSocket Service
Connects to Polygon.io and streams real-time stock prices

Sprint 9 addition: on_price_update callback for alert_checker integration.
When a price updates, the callback is invoked (if set) so the alert checker
can evaluate active alerts without blocking the price stream.
"""
import asyncio
import json
import websockets
import os
from typing import Set, Dict, Optional, Callable, Awaitable
from datetime import datetime, time as dt_time
import pytz
from app.config import get_settings

settings = get_settings()


class LivePriceService:
    """Service to manage live price streaming from Polygon.io"""
    
    def __init__(self):
        self.polygon_ws_url = "wss://socket.massive.com/stocks"
        self.polygon_api_key = settings.MASSIVE_API_KEY
        self.polygon_ws: Optional[websockets.WebSocketClientProtocol] = None
        self.subscribed_tickers: Set[str] = set()
        self.clients: Set[websockets.WebSocketServerProtocol] = set()
        self.price_cache: Dict[str, Dict] = {}  # Cache latest prices
        self.running = False

        # Sprint 9: alert checker callback
        # Signature: async def callback(ticker: str, price: float)
        self.on_price_update: Optional[Callable[[str, float], Awaitable[None]]] = None
        
    async def connect_to_polygon(self):
        """Connect to Polygon.io WebSocket"""
        try:
            print("🔌 Connecting to Polygon.io WebSocket...")
            self.polygon_ws = await websockets.connect(
                self.polygon_ws_url,
                ping_interval=20,
                ping_timeout=10
            )
            
            # Authenticate
            auth_message = {
                "action": "auth",
                "params": self.polygon_api_key
            }
            await self.polygon_ws.send(json.dumps(auth_message))
            
            # Wait for auth response
            response = await self.polygon_ws.recv()
            auth_data = json.loads(response)
            
            if auth_data[0].get("status") == "auth_success":
                print("✅ Successfully authenticated with Polygon.io")
                return True
            else:
                print(f"❌ Authentication failed: {auth_data}")
                return False
                
        except Exception as e:
            print(f"❌ Failed to connect to Polygon.io: {e}")
            return False
    
    async def subscribe_to_tickers(self, tickers: Set[str]):
        """Subscribe to ticker updates"""
        if not self.polygon_ws or self.polygon_ws.closed:
            if not await self.connect_to_polygon():
                return
        
        new_tickers = tickers - self.subscribed_tickers
        if not new_tickers:
            return
        
        try:
            # Subscribe to trades (T.*)
            subscribe_message = {
                "action": "subscribe",
                "params": ",".join([f"T.{ticker}" for ticker in new_tickers])
            }
            await self.polygon_ws.send(json.dumps(subscribe_message))
            self.subscribed_tickers.update(new_tickers)
            print(f"📊 Subscribed to: {', '.join(new_tickers)}")
            
        except Exception as e:
            print(f"❌ Failed to subscribe to tickers: {e}")
    
    async def unsubscribe_from_tickers(self, tickers: Set[str]):
        """Unsubscribe from ticker updates"""
        if not self.polygon_ws or self.polygon_ws.closed:
            return
        
        tickers_to_remove = tickers & self.subscribed_tickers
        if not tickers_to_remove:
            return
        
        try:
            unsubscribe_message = {
                "action": "unsubscribe",
                "params": ",".join([f"T.{ticker}" for ticker in tickers_to_remove])
            }
            await self.polygon_ws.send(json.dumps(unsubscribe_message))
            self.subscribed_tickers -= tickers_to_remove
            print(f"📊 Unsubscribed from: {', '.join(tickers_to_remove)}")
            
        except Exception as e:
            print(f"❌ Failed to unsubscribe from tickers: {e}")
    
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
    
    async def listen_to_polygon(self):
        """Listen to Polygon.io WebSocket and broadcast to clients"""
        while self.running:
            try:
                if not self.polygon_ws or self.polygon_ws.closed:
                    print("🔄 Reconnecting to Polygon.io...")
                    if not await self.connect_to_polygon():
                        await asyncio.sleep(5)
                        continue
                    
                    # Resubscribe to all tickers
                    if self.subscribed_tickers:
                        temp_tickers = self.subscribed_tickers.copy()
                        self.subscribed_tickers.clear()
                        await self.subscribe_to_tickers(temp_tickers)
                
                # Receive message from Polygon
                message = await asyncio.wait_for(
                    self.polygon_ws.recv(),
                    timeout=30.0
                )
                
                data = json.loads(message)
                
                # Process trade messages
                for msg in data:
                    if msg.get("ev") == "T":  # Trade event
                        ticker = msg.get("sym")
                        price = msg.get("p")
                        size = msg.get("s")
                        timestamp = msg.get("t")
                        
                        if ticker and price:
                            # Update cache
                            self.price_cache[ticker] = {
                                "ticker": ticker,
                                "price": price,
                                "size": size,
                                "timestamp": timestamp,
                                "updated_at": datetime.now().isoformat()
                            }
                            
                            # Broadcast to all connected clients
                            await self.broadcast_to_clients({
                                "type": "price_update",
                                "data": self.price_cache[ticker]
                            })

                            # ── Sprint 9: Alert checker hook ─────
                            if self.on_price_update:
                                try:
                                    await self.on_price_update(ticker, price)
                                except Exception as e:
                                    # Never let alert checking crash the price stream
                                    print(f"⚠️ Alert check error for {ticker}: {e}")
            
            except asyncio.TimeoutError:
                # No message received in 30 seconds, send ping
                if self.polygon_ws and not self.polygon_ws.closed:
                    try:
                        await self.polygon_ws.ping()
                    except:
                        pass
                        
            except Exception as e:
                print(f"❌ Error in Polygon listener: {e}")
                await asyncio.sleep(5)
    
    async def broadcast_to_clients(self, message: dict):
        """Broadcast message to all connected clients"""
        if not self.clients:
            return
        
        message_str = json.dumps(message)
        disconnected_clients = set()
        
        for client in self.clients:
            try:
                await client.send(message_str)
            except Exception:
                disconnected_clients.add(client)
        
        # Remove disconnected clients
        self.clients -= disconnected_clients
    
    async def add_client(self, websocket: websockets.WebSocketServerProtocol):
        """Add a new client connection"""
        self.clients.add(websocket)
        print(f"👤 Client connected. Total clients: {len(self.clients)}")
        
        # Send cached prices to new client
        if self.price_cache:
            await websocket.send(json.dumps({
                "type": "price_cache",
                "data": list(self.price_cache.values())
            }))
    
    async def remove_client(self, websocket: websockets.WebSocketServerProtocol):
        """Remove a client connection"""
        self.clients.discard(websocket)
        print(f"👤 Client disconnected. Total clients: {len(self.clients)}")
    
    async def handle_client_message(self, websocket: websockets.WebSocketServerProtocol, message: str):
        """Handle messages from clients"""
        try:
            data = json.loads(message)
            action = data.get("action")
            
            if action == "subscribe":
                tickers = set(data.get("tickers", []))
                if tickers:
                    await self.subscribe_to_tickers(tickers)
                    
            elif action == "unsubscribe":
                tickers = set(data.get("tickers", []))
                if tickers:
                    await self.unsubscribe_from_tickers(tickers)
                    
            elif action == "ping":
                await websocket.send(json.dumps({"type": "pong"}))
                
        except Exception as e:
            print(f"❌ Error handling client message: {e}")
    
    async def start(self):
        """Start the live price service"""
        if self.running:
            return
        
        self.running = True
        print("🚀 Starting Live Price Service...")
        
        # Check if market is open
        if not self.is_market_hours():
            print("⏰ Market is closed. Live prices will not stream.")
            # You can still run the service, it just won't stream until market opens
        
        # Start polygon listener task
        asyncio.create_task(self.listen_to_polygon())
    
    async def stop(self):
        """Stop the live price service"""
        self.running = False
        
        if self.polygon_ws and not self.polygon_ws.closed:
            await self.polygon_ws.close()
        
        print("🛑 Stopped Live Price Service")


# Global instance
live_price_service = LivePriceService()