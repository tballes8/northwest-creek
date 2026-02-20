import os
import time
import sys
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

def wait_for_db(database_url, max_retries=30, delay=2):
    """Wait for database to be ready"""
    # Convert async URL to sync for connection test
    sync_url = database_url.replace('+asyncpg', '').replace('+psycopg', '')
    
    # Railway fix: postgres:// → postgresql://
    if sync_url.startswith('postgres://'):
        sync_url = sync_url.replace('postgres://', 'postgresql://', 1)
    
    print(f"🔍 Testing database connection...")
    engine = create_engine(sync_url, pool_pre_ping=True)
    
    for attempt in range(max_retries):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            print(f"✅ Database is ready after {attempt + 1} attempt(s)!")
            engine.dispose()
            return True
        except OperationalError as e:
            if attempt < max_retries - 1:
                print(f"⏳ Database not ready (attempt {attempt + 1}/{max_retries}), retrying in {delay}s...")
                time.sleep(delay)
            else:
                print(f"❌ Database connection failed: {e}")
                engine.dispose()
                raise
    return False

def run_migrations():
    """Run Alembic migrations"""
    database_url = os.getenv("DATABASE_URL")
    
    if not database_url:
        print("❌ DATABASE_URL environment variable not set!")
        sys.exit(1)
    
    print(f"📊 DATABASE_URL found")
    
    # Wait for database
    wait_for_db(database_url)
    
    # Ensure we're in the right directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    print(f"📂 Working directory: {os.getcwd()}")
    
    # Check if alembic.ini exists
    if not os.path.exists("alembic.ini"):
        print("❌ alembic.ini not found!")
        print(f"Current directory contents: {os.listdir('.')}")
        sys.exit(1)
    
    print("🔄 Running Alembic migrations...")
    
    # Create Alembic config
    alembic_cfg = Config("alembic.ini")
    
    # Override database URL from environment
    # Fix Railway's postgres:// to postgresql://
    db_url = database_url
    if db_url.startswith('postgres://'):
        db_url = db_url.replace('postgres://', 'postgresql://', 1)
    
    alembic_cfg.set_main_option("sqlalchemy.url", db_url)
    
    try:
        # Upgrade to head (creates all tables)
        command.upgrade(alembic_cfg, "head")
        print("✅ Migrations completed successfully!")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    run_migrations()
