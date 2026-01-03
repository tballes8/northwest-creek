from pydantic_settings import BaseSettings
from typing import List
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Northwest Creek"
    DEBUG: bool = True
    SECRET_KEY: str
    API_VERSION: str = "v1"
    
    # Database
    DATABASE_URL: str
    
    # Redis
    REDIS_URL: str
    
    # APIs
    MASSIVE_API_KEY: str
    
    # Stripe
    STRIPE_SECRET_KEY: str
    STRIPE_PUBLISHABLE_KEY: str
    STRIPE_WEBHOOK_SECRET: str
    STRIPE_PRO_PRICE_ID: str = ""
    STRIPE_ENTERPRISE_PRICE_ID: str = ""
    
    # SendGrid
    SENDGRID_API_KEY: str = ""
    
    # URLs
    FRONTEND_URL: str
    BACKEND_URL: str
    
    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]
    
    # JWT
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    class Config:
        env_file = "../.env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
