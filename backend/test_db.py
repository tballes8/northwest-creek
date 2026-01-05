import asyncio
from sqlalchemy import select
from app.models.database import User
from app.db.session import async_session

async def check_users():
    async with async_session() as db:
        result = await db.execute(select(User))
        users = result.scalars().all()
        
        print("\n🎉 Users in Database:")
        print("=" * 80)
        for user in users:
            print(f"ID: {user.id}")
            print(f"Email: {user.email}")
            print(f"Name: {user.full_name}")
            print(f"Tier: {user.subscription_tier}")
            print(f"Created: {user.created_at}")
            print("-" * 80)

if __name__ == "__main__":
    asyncio.run(check_users())