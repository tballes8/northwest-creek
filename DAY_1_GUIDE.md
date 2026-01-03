<!-- # Northwest Creek - DAY 1 BUILD GUIDE 🚀

**STATUS:** ✅ Company registered | ✅ Domain owned | ✅ Logo ready | ⚡ BUILDING NOW

---

## TODAY'S MISSION: Get Your Development Environment Ready

### Step 1: Create Project Structure (15 minutes)

```bash
# Create main project directory
mkdir northwest-creek
cd northwest-creek

# Initialize git
git init
echo "# Northwest Creek Stock Analyzer" > README.md

# Create directory structure
mkdir -p backend/app/{api,core,models,services,utils,tests}
mkdir -p backend/app/api/v1/endpoints
mkdir -p backend/app/core/{technical,valuation}
mkdir -p frontend/{src,public}
mkdir -p frontend/src/{components,hooks,services,store,utils}
mkdir -p infrastructure/terraform
mkdir -p docs

# Create .gitignore
cat > .gitignore << 'EOF'
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
ENV/
.venv
*.egg
*.egg-info/
dist/
build/

# Environment
.env
.env.local
.env.production

# IDEs
.vscode/
.idea/
*.swp
*.swo

# Logs
*.log

# OS
.DS_Store
Thumbs.db

# Node
node_modules/
npm-debug.log
yarn-error.log

# Build
frontend/build/
frontend/dist/

# Terraform
*.tfstate
*.tfstate.backup
.terraform/
EOF

echo "✅ Project structure created!"
```
-->
### Step 2: Set Up Backend (20 minutes)

```bash
cd backend
 
# Create Python virtual environment
python3.11 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# # Create requirements.txt
# cat > requirements.txt << 'EOF'
# # Core Framework
# fastapi==0.104.1
# uvicorn[standard]==0.24.0
# python-multipart==0.0.6

# # Database
# sqlalchemy==2.0.23
# asyncpg==0.29.0
# alembic==1.12.1
# psycopg2-binary==2.9.9

# # Authentication
# python-jose[cryptography]==3.3.0
# passlib[bcrypt]==1.7.4
# python-multipart==0.0.6

# # API & Data
# massive==2.0.0
# httpx==0.25.1
# aiohttp==3.9.1
# redis==5.0.1
# hiredis==2.2.3

# # Data Processing
# pandas==2.1.3
# numpy==1.26.2

# # Payments
# stripe==7.6.0

# # Email
# sendgrid==6.11.0

# # Environment
# python-dotenv==1.0.0
# pydantic==2.5.2
# pydantic-settings==2.1.0

# # Monitoring
# prometheus-client==0.19.0

# # Development
# pytest==7.4.3
# pytest-asyncio==0.21.1
# pytest-cov==4.1.0
# black==23.11.0
# ruff==0.1.6
# EOF

# # Install dependencies
# pip install -r requirements.txt

# echo "✅ Backend dependencies installed!"
# ```

### Step 3: Create Environment Configuration (5 minutes)

```bash
# # Create .env file
# cat > .env << 'EOF'
# # Application
# APP_NAME="Northwest Creek Stock Analyzer"
# DEBUG=True
# SECRET_KEY=your-secret-key-change-this-in-production-use-openssl-rand-hex-32
# API_VERSION=v1

# # Database
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/northwest_creek

# # Redis
# REDIS_URL=redis://localhost:6379

# # Massive API
# MASSIVE_API_KEY=Vu377TX0oKEohsfLJjFXRXJjeA6yj7sA

# # Stripe (get from stripe.com)
# STRIPE_SECRET_KEY=sk_test_your_key_here
# STRIPE_PUBLISHABLE_KEY=pk_live_51SlLiwJ7exDXzzCXpcB69usQ0FHrzEhtn7n3bdkqhPKsxU8Ji8tPrhIhJdxMVEZgs5XKK7m2sEnjn7i5L7R4lwQ200dtzTWKQs
# STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
# STRIPE_PRO_PRICE_ID=price_your_pro_price_id
# STRIPE_ENTERPRISE_PRICE_ID=price_your_enterprise_price_id

# # SendGrid (get from sendgrid.com)
# SENDGRID_API_KEY=SG.your_key_here

# # Frontend URL
# FRONTEND_URL=http://localhost:3000
# BACKEND_URL=http://localhost:8000

# # CORS
# CORS_ORIGINS=["http://localhost:3000","http://localhost:8000"]

# # JWT
# ACCESS_TOKEN_EXPIRE_MINUTES=30
# REFRESH_TOKEN_EXPIRE_DAYS=7
# EOF

# echo "✅ Environment file created!"
# echo "⚠️  IMPORTANT: Update these values before production!"
```

### Step 4: Create Basic Backend Structure (10 minutes)

```bash
cd app

# # Create __init__.py files
# touch __init__.py
# touch api/__init__.py
# touch api/v1/__init__.py
# touch api/v1/endpoints/__init__.py
# touch core/__init__.py
# touch models/__init__.py
# touch services/__init__.py
# touch utils/__init__.py

# Create config.py
# cat > config.py << 'EOF'
# from pydantic_settings import BaseSettings
# from typing import List
# from functools import lru_cache


# class Settings(BaseSettings):
#     # App
#     APP_NAME: str = "Northwest Creek"
#     DEBUG: bool = True
#     SECRET_KEY: str
#     API_VERSION: str = "v1"
    
#     # Database
#     DATABASE_URL: str
    
#     # Redis
#     REDIS_URL: str
    
#     # APIs
#     MASSIVE_API_KEY: str
    
#     # Stripe
#     STRIPE_SECRET_KEY: str
#     STRIPE_PUBLISHABLE_KEY: str
#     STRIPE_WEBHOOK_SECRET: str
#     STRIPE_PRO_PRICE_ID: str = ""
#     STRIPE_ENTERPRISE_PRICE_ID: str = ""
    
#     # SendGrid
#     SENDGRID_API_KEY: str = ""
    
#     # URLs
#     FRONTEND_URL: str
#     BACKEND_URL: str
    
#     # CORS
#     CORS_ORIGINS: List[str] = ["http://localhost:3000"]
    
#     # JWT
#     ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
#     REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
#     class Config:
#         env_file = "../.env"
#         case_sensitive = True


# @lru_cache()
# def get_settings() -> Settings:
#     return Settings()
# EOF

# Create main.py
# cat > main.py << 'EOF'
# from fastapi import FastAPI
# from fastapi.middleware.cors import CORSMiddleware
# from contextlib import asynccontextmanager

# from app.config import get_settings

# settings = get_settings()


# @asynccontextmanager
# async def lifespan(app: FastAPI):
#     # Startup
#     print("🚀 Northwest Creek API starting...")
#     yield
#     # Shutdown
#     print("👋 Northwest Creek API shutting down...")


# app = FastAPI(
#     title=settings.APP_NAME,
#     version=settings.API_VERSION,
#     lifespan=lifespan,
#     docs_url=f"/api/{settings.API_VERSION}/docs",
#     redoc_url=f"/api/{settings.API_VERSION}/redoc"
# )

# # CORS
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=settings.CORS_ORIGINS,
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )


# @app.get("/")
# async def root():
#     return {
#         "message": "Welcome to Northwest Creek Stock Analyzer API",
#         "version": settings.API_VERSION,
#         "status": "operational"
#     }


# @app.get("/health")
# async def health_check():
#     return {"status": "healthy"}


# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run(
#         "app.main:app",
#         host="0.0.0.0",
#         port=8000,
#         reload=True
#     )
# EOF

# echo "✅ Backend structure created!"
```

### Step 5: Test Your Backend (2 minutes)

```bash
# From backend/ directory
python -m app.main
```

**Expected output:**
```
🚀 Northwest Creek API starting...
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

**Test it:**
1. Open browser: http://localhost:8000
2. You should see: `{"message": "Welcome to Northwest Creek Stock Analyzer API"...}`
3. Try docs: http://localhost:8000/api/v1/docs (interactive API docs!)

Press `Ctrl+C` to stop.

---

## TONIGHT'S HOMEWORK (2-3 hours)

### Task 1: Set Up GitHub Repository

```bash
# From northwest-creek/ directory
git add .
git commit -m "Initial project setup"

# Create repo on GitHub (github.com/new)
# Then:
git remote add origin https://github.com/YOUR_USERNAME/northwest-creek.git
git branch -M main
git push -u origin main
```

### Task 2: Install PostgreSQL & Redis (Local Development)

**Option A: Docker (Recommended)**
```bash
# Create docker-compose.yml in project root
cat > docker-compose.dev.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: timescale/timescaledb:latest-pg15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: northwest_creek
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
EOF

# Start services
docker-compose -f docker-compose.dev.yml up -d

# Check they're running
docker ps
```

**Option B: Install Locally**
- PostgreSQL: https://www.postgresql.org/download/
- Redis: https://redis.io/download

### Task 3: Create Database Schema

```bash
cd backend

# Install Alembic (already in requirements.txt)
alembic init alembic

# Edit alembic.ini
# Change: sqlalchemy.url = driver://user:pass@localhost/dbname
# To: sqlalchemy.url = postgresql://postgres:postgres@localhost:5432/northwest_creek
```

Create first migration:
```bash
# Create migration file
cat > alembic/versions/001_initial_schema.py << 'EOF'
"""Initial schema

Revision ID: 001
Create Date: 2025-01-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Enable UUID extension
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    
    # Users table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, 
                  server_default=sa.text('uuid_generate_v4()')),
        sa.Column('email', sa.String(255), unique=True, nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255)),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('is_verified', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    
    op.create_index('idx_users_email', 'users', ['email'])


def downgrade():
    op.drop_table('users')
EOF

# Run migration
alembic upgrade head
```

---

## END OF DAY 1 CHECKLIST

- [ ] Project structure created
- [ ] Backend environment set up
- [ ] FastAPI running locally
- [ ] GitHub repository created
- [ ] PostgreSQL & Redis running
- [ ] Database migration run
- [ ] Can access http://localhost:8000/api/v1/docs

**If you checked all boxes: YOU'RE READY FOR DAY 2! 🎉**

---

## TOMORROW (Day 2): Build Authentication

We'll create:
1. User registration endpoint
2. Login endpoint
3. JWT token system
4. Password hashing
5. Email verification (optional for MVP)

**Time needed:** 3-4 hours

---

## Questions? Stuck?

Common issues:

**"Python not found"**
- Install Python 3.11+: https://www.python.org/downloads/

**"Docker not running"**
- Install Docker Desktop: https://www.docker.com/products/docker-desktop/

**"Port 8000 already in use"**
```bash
# Find what's using it
lsof -i :8000  # Mac/Linux
netstat -ano | findstr :8000  # Windows

# Kill it or change port in main.py
```

**"Can't connect to database"**
- Make sure docker-compose is running: `docker ps`
- Check DATABASE_URL in .env matches your setup

---

## MOTIVATION 💪

You just completed 10% of your MVP in ONE DAY!

**Progress:**
- ✅ Project structure
- ✅ Backend framework
- ✅ Database setup
- ⏳ Authentication (tomorrow)
- ⏳ Stock data integration
- ⏳ Frontend
- ⏳ Deployment

**You're on track to launch in 90 days!** 🚀

Take a screenshot of http://localhost:8000/api/v1/docs working and celebrate! 🎉

Tomorrow we build the auth system. See you then! 💪
EOF

chmod +x DAY_1_GUIDE.md
echo "✅ Day 1 guide created!"
```
