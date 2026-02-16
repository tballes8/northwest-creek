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
    SALES_EMAIL: str = Field(default="", env="SALES_EMAIL")
    FROM_NAME: str = Field(default="Northwest Creek", env="FROM_NAME")
    FRONTEND_URL: str = Field(default="http://localhost:3000", env="FRONTEND_URL")

    # Stripe Settings
    STRIPE_SECRET_KEY: str = Field(default="", env="STRIPE_SECRET_KEY")
    STRIPE_PUBLISHABLE_KEY: str = Field(default="", env="STRIPE_PUBLISHABLE_KEY")
    STRIPE_WEBHOOK_SECRET: str = Field(default="", env="STRIPE_WEBHOOK_SECRET")
    STRIPE_CASUAL_PRICE_ID: str = Field(default="", env="STRIPE_CASUAL_PRICE_ID")
    STRIPE_ACTIVE_PRICE_ID: str = Field(default="", env="STRIPE_ACTIVE_PRICE_ID")
    STRIPE_PROFESSIONAL_PRICE_ID: str = Field(default="", env="STRIPE_PROFESSIONAL_PRICE_ID")
    
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
        # Diagnostic logging (masked) to help debug config issues
        print(f"✅ Config loaded:")
        print(f"   FRONTEND_URL = {settings.FRONTEND_URL}")
        print(f"   FROM_EMAIL = {settings.FROM_EMAIL}")
        print(f"   SALES_EMAIL = {settings.SALES_EMAIL}")
        print(f"   SENDGRID_API_KEY = {'✅ SET (' + settings.SENDGRID_API_KEY[:8] + '...)' if settings.SENDGRID_API_KEY else '❌ NOT SET'}")
        print(f"   STRIPE_SECRET_KEY = {'✅ SET' if settings.STRIPE_SECRET_KEY else '❌ NOT SET'}")
        print(f"   STRIPE_PUBLISHABLE_KEY = {'✅ SET' if settings.STRIPE_PUBLISHABLE_KEY else '❌ NOT SET'}")
        print(f"   STRIPE_CASUAL_PRICE_ID = {settings.STRIPE_CASUAL_PRICE_ID or '❌ NOT SET'}")
        print(f"   STRIPE_ACTIVE_PRICE_ID = {settings.STRIPE_ACTIVE_PRICE_ID or '❌ NOT SET'}")
        print(f"   STRIPE_PROFESSIONAL_PRICE_ID = {settings.STRIPE_PROFESSIONAL_PRICE_ID or '❌ NOT SET'}")
        print(f"   DATABASE_URL = {'✅ SET' if settings.DATABASE_URL else '❌ NOT SET'}")
        print(f"   MASSIVE_API_KEY = {'✅ SET' if settings.MASSIVE_API_KEY else '❌ NOT SET'}")
    return settings