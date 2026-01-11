from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import get_settings
from app.api.v1.endpoints import alerts, auth, indicators, portfolio, stocks, watchlist, technical_analysis


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

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=settings.CORS_ORIGINS,
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# Configure CORS
origins = settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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
