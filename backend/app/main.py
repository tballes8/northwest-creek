import os  # ← ADD THIS IMPORT
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import get_settings
from app.api.v1.endpoints import (
    alerts, auth, dcf_valuation, indicators, portfolio, 
    stocks, watchlist, technical_analysis, stripe_payments
)

settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Northwest Creek API starting...")
    yield
    print("👋 Northwest Creek API shutting down...")

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.API_VERSION,
    lifespan=lifespan,
    docs_url=f"/api/{settings.API_VERSION}/docs",
    redoc_url=f"/api/{settings.API_VERSION}/redoc"
)

# Get frontend URL from environment (Railway will provide this)
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

# Configure CORS - Allow frontend to make requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        frontend_url,  # Production frontend from environment
        "http://localhost:3000",  # Local React dev
        "http://localhost:5173",  # Local Vite dev
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "Welcome to Northwest Creek Stock Analyzer API",
        "version": settings.API_VERSION,
        "status": "operational"
    }

# Health check endpoint
@app.get("/api/v1/health")
async def health_check():
    """Simple health check endpoint"""
    return {
        "status": "healthy",
        "service": "Northwest Creek API",
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
