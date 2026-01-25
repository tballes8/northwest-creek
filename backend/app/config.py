"""
Application configuration using Pydantic Settings
"""
from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # App Settings
    APP_NAME: str = Field(default="Northwest Creek API", env="APP_NAME")
    DEBUG: bool = Field(default=False, env="DEBUG")
    VERSION: str = Field(default="1.0.0", env="VERSION")
    API_VERSION: str = Field(default="v1", env="API_VERSION")

    # Database
    DATABASE_URL: str = Field(..., env="DATABASE_URL")
    
    # Redis
    REDIS_URL: str = Field(default="redis://localhost:6379/0", env="REDIS_URL")
    
    # JWT Settings
    SECRET_KEY: str = Field(..., env="SECRET_KEY")
    ALGORITHM: str = Field(default="HS256", env="ALGORITHM")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=90, env="ACCESS_TOKEN_EXPIRE_MINUTES")
    
    # Alpha Vantage API
    MASSIVE_API_KEY: str = Field(..., env="MASSIVE_API_KEY")
    
    # CORS
    CORS_ORIGINS: List[str] = Field(default=["http://localhost:3000"], env="CORS_ORIGINS")

    # SendGrid Email Settings
    SENDGRID_API_KEY: str = Field(default="", env="SENDGRID_API_KEY")
    FROM_EMAIL: str = Field(default="", env="FROM_EMAIL")
    FROM_NAME: str = Field(default="Northwest Creek", env="FROM_NAME")
    FRONTEND_URL: str = "http://localhost:3000"

    # Stripe Settings
    STRIPE_SECRET_KEY: str = Field(default="", env="STRIPE_SECRET_KEY")
    STRIPE_PUBLISHABLE_KEY: str = Field(default="", env="STRIPE_PUBLISHABLE_KEY")
    STRIPE_WEBHOOK_SECRET: str = Field(default="", env="STRIPE_WEBHOOK_SECRET")
    STRIPE_CASUAL_PRICE_ID: str = Field(default="", env="STRIPE_CASUAL_PRICE_ID")
    STRIPE_ACTIVE_PRICE_ID: str = Field(default="", env="STRIPE_ACTIVE_PRICE_ID")
    STRIPE_UNLIMITED_PRICE_ID: str = Field(default="", env="STRIPE_UNLIMITED_PRICE_ID")
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"  # Ignore extra fields in .env


# Singleton pattern
settings = None

def get_settings() -> Settings:
    """Get settings instance (singleton)"""
    global settings
    if settings is None:
        settings = Settings()
    return settings