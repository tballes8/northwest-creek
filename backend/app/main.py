import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import get_settings
from app.api.v1.endpoints import (
    alerts, auth, dcf_valuation, indicators, portfolio,
    stocks, watchlist, technical_analysis, stripe_payments,
    intraday, live_prices, financials, phone, technical_alerts,
    portfolio_analysis, stock_analysis, screener
)
from app.api.v1.endpoints.content import router as content_router
from app.api.v1.endpoints.waitlist import router as waitlist_router
from app.api.v1.endpoints.sitemap import router as sitemap_router
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.services.alert_checker import alert_checker
from app.services.websocket_service import live_price_service
from app.services.fmp_client import init_fmp_client, close_fmp_client
from datetime import datetime, timezone
from app.tasks.refresh_stock_snapshots import refresh_stock_snapshots_job


settings = get_settings()
_scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 NWC-Analytics API starting...")

    # Persistent HTTP client for FMP API calls
    await init_fmp_client()

    # Wire alert checker into price stream
    alert_checker.set_broadcast_fn(live_price_service.broadcast_to_clients)
    live_price_service.on_price_update = alert_checker.on_price_update
    await alert_checker.load_alert_tickers(live_price_service)
    await live_price_service.start()

    # Stock screener: refresh snapshots every 15 min (job self-throttles off-hours)
    _scheduler.add_job(
        refresh_stock_snapshots_job,
        "interval",
        minutes=15,
        kwargs={"api_key": settings.MASSIVE_API_KEY},
        id="refresh_stock_snapshots",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(timezone.utc),
    )
    _scheduler.start()

    yield

    _scheduler.shutdown(wait=False)
    await live_price_service.stop()
    await close_fmp_client()
    print("👋 NWC-Analytics API shutting down...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.API_VERSION,
    lifespan=lifespan,
    docs_url=f"/api/{settings.API_VERSION}/docs",
    redoc_url=f"/api/{settings.API_VERSION}/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://nwc-analytics.com",
        "https://www.nwc-analytics.com",
        "https://northwestcreekllc.com",
        "https://www.northwestcreekllc.com",
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "message": "Welcome to NWC-Analytics Stock Analyzer API",
        "version": settings.API_VERSION,
        "status": "operational"
    }

# Health check endpoint
@app.get("/api/v1/health")
async def health_check():
    """Simple health check endpoint"""
    return {
        "status": "healthy",
        "service": "NWC-Analytics API",
        "version": "1.0.0"
    }

# Include routers
app.include_router(auth.router, prefix=f"/api/{settings.API_VERSION}/auth", tags=["auth"])
app.include_router(stocks.router, prefix=f"/api/{settings.API_VERSION}/stocks", tags=["stocks"])
app.include_router(watchlist.router, prefix=f"/api/{settings.API_VERSION}/watchlist", tags=["watchlist"])
app.include_router(indicators.router, prefix=f"/api/{settings.API_VERSION}/indicators", tags=["indicators"])
app.include_router(portfolio.router, prefix=f"/api/{settings.API_VERSION}/portfolio", tags=["portfolio"])
app.include_router(alerts.router, prefix=f"/api/{settings.API_VERSION}/alerts", tags=["alerts"])
app.include_router(technical_analysis.router, prefix="/api/v1/technical-analysis", tags=["Technical Analysis"])
app.include_router(dcf_valuation.router, prefix="/api/v1/dcf", tags=["DCF Valuation"])
app.include_router(stripe_payments.router, prefix="/api/v1/stripe", tags=["Stripe"])
app.include_router(intraday.router, prefix="/api/v1/intraday", tags=["Intraday"])
app.include_router(live_prices.router, prefix="/api/v1/live-prices", tags=["Live Prices"])
app.include_router(content_router, prefix="/api/v1/content", tags=["content"])
app.include_router(financials.router, prefix="/api/v1/financials", tags=["financials"])
app.include_router(phone.router, prefix=f"/api/{settings.API_VERSION}/phone", tags=["Phone"])
app.include_router(waitlist_router, prefix="/api/v1/waitlist", tags=["waitlist"])
app.include_router(technical_alerts.router, prefix="/api/v1/technical-alerts", tags=["Technical Alerts"])
app.include_router(portfolio_analysis.router, prefix="/api/v1/portfolio", tags=["Portfolio Analysis"])
app.include_router(stock_analysis.router, prefix="/api/v1", tags=["Stock Analysis"])
app.include_router(screener.router, prefix="/api/v1/screener", tags=["Screener"])
app.include_router(sitemap_router, tags=["sitemap"])