"""
Live Prices WebSocket Endpoint
Real-time stock price streaming via WebSocket
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.services.websocket_service import live_price_service
from app.api.dependencies import get_current_user
from app.core.security import decode_token
from app.db.models import User
import asyncio
import json

router = APIRouter()

AUTH_TIMEOUT_SECONDS = 10
WS_POLICY_VIOLATION = 1008  # close code: not authenticated


async def _authenticate_socket(websocket: WebSocket) -> bool:
    """The first message must be {"action": "auth", "token": <JWT>}.

    Sent as a message, not a query parameter: uvicorn logs WebSocket URLs,
    which would write every user's token into the logs.
    """
    try:
        first = await asyncio.wait_for(websocket.receive_text(), timeout=AUTH_TIMEOUT_SECONDS)
        msg = json.loads(first)
        if not isinstance(msg, dict) or msg.get("action") != "auth" or not isinstance(msg.get("token"), str):
            return False
        payload = decode_token(msg["token"])
        return bool(payload and payload.get("sub"))
    except Exception:
        return False


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for live price streaming (logged-in users only)

    Client sends first:
    {
        "action": "auth",
        "token": "<access token>"
    }
    then:
    {
        "action": "subscribe",
        "tickers": ["AAPL", "MSFT", "GOOGL"]
    }
    
    Server sends:
    {
        "type": "price_update",
        "data": {
            "ticker": "AAPL",
            "price": 185.43,
            "size": 100,
            "timestamp": 1234567890000,
            "updated_at": "2026-02-06T14:30:15"
        }
    }
    """
    await websocket.accept()

    if not await _authenticate_socket(websocket):
        try:
            await websocket.close(code=WS_POLICY_VIOLATION)
        except Exception:
            pass
        return

    # Add client to service
    await live_price_service.add_client(websocket)
    
    # Start service if not already running
    if not live_price_service.running:
        await live_price_service.start()
    
    try:
        while True:
            # Receive message from client
            message = await websocket.receive_text()
            
            # Handle client message (subscribe/unsubscribe)
            await live_price_service.handle_client_message(websocket, message)
            
    except WebSocketDisconnect:
        # Client disconnected
        await live_price_service.remove_client(websocket)
        
    except Exception as e:
        print(f"WebSocket error: {e}")
        await live_price_service.remove_client(websocket)
        try:
            await websocket.close()
        except:
            pass


@router.get("/snapshot/{ticker}")
async def get_price_snapshot(
    ticker: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get current cached price for a ticker (REST endpoint fallback)
    """
    ticker = ticker.upper()
    
    if ticker in live_price_service.price_cache:
        return {
            "ticker": ticker,
            "price": live_price_service.price_cache[ticker]["price"],
            "timestamp": live_price_service.price_cache[ticker]["timestamp"],
            "updated_at": live_price_service.price_cache[ticker]["updated_at"],
            "source": "live_cache"
        }
    else:
        return {
            "ticker": ticker,
            "price": None,
            "error": "Price not available. Subscribe to ticker for live updates.",
            "source": "cache_miss"
        }


@router.get("/status")
async def get_service_status(current_user: User = Depends(get_current_user)):
    """Get live price service status"""
    return {
        "running": live_price_service.running,
        "connected_clients": len(live_price_service.clients),
        "subscribed_tickers": list(live_price_service.subscribed_tickers),
        "cached_tickers": list(live_price_service.price_cache.keys()),
        "market_hours": live_price_service.is_market_hours(),
        "polling_active": live_price_service.running
    }
