"""
Live Prices WebSocket Endpoint
Real-time stock price streaming via WebSocket
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.services.websocket_service import live_price_service
from app.api.dependencies import get_current_user
from app.db.models import User
import json

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for live price streaming
    
    Client sends:
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
        "polygon_connected": live_price_service.polygon_ws is not None and not live_price_service.polygon_ws.closed
    }
