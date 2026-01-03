from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import get_settings
from app.api.v1.endpoints import auth  # ADD THIS

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ADD THESE ROUTES
app.include_router(auth.router, prefix=f"/api/{settings.API_VERSION}/auth", tags=["auth"])

@app.get("/api/v1/status")
async def api_status():
    return {
        "status": "operational",
        "version": "1.0.0",
        "message": "Northwest Creek Stock Analyzer API",
        "founder": "Tyrone Ballesteros",  # Your name!
        "progress": "Day 1 Complete! 🚀"
    }

@app.get("/")
async def root():
    return {
        "message": "Welcome to Northwest Creek Stock Analyzer API",
        "version": settings.API_VERSION,
        "status": "operational"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
