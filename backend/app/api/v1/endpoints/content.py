"""
Content API Endpoints — Tutorials and Blog Posts
Save as: backend/app/api/v1/content.py

Register in your router (e.g., in api/v1/__init__.py or main.py):
    from app.api.v1.content import router as content_router
    app.include_router(content_router, prefix="/api/v1/content", tags=["content"])
"""
import re
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func
from typing import List, Optional

from app.db.session import get_db
from app.db.models import Tutorial, BlogPost, User
from app.schemas.content import (
    TutorialCreate, TutorialUpdate, TutorialResponse,
    BlogPostCreate, BlogPostUpdate, BlogPostResponse, BlogPostListItem,
)

# ── Auth dependencies ──────────────────────────────────────
# Adjust these imports to match your existing auth setup
from app.api.dependencies import get_current_user  # Your existing dependency


async def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Require admin privileges."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


router = APIRouter()


# ── Helper ─────────────────────────────────────────────────

def generate_slug(title: str) -> str:
    """Generate a URL-friendly slug from a title."""
    slug = title.lower().strip()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[-\s]+', '-', slug)
    slug = slug.strip('-')
    return slug[:300]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  TUTORIALS — Public endpoints
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/tutorials", response_model=List[TutorialResponse])
async def list_tutorials(
    category: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all published tutorials (requires login)."""
    query = select(Tutorial).where(Tutorial.is_published == True)
    if category:
        query = query.where(Tutorial.category == category)
    query = query.order_by(Tutorial.display_order.asc(), Tutorial.created_at.desc())

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/tutorials/categories", response_model=List[str])
async def list_tutorial_categories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get distinct tutorial categories."""
    result = await db.execute(
        select(Tutorial.category)
        .where(Tutorial.is_published == True)
        .distinct()
        .order_by(Tutorial.category)
    )
    return [row[0] for row in result.all() if row[0]]


@router.get("/tutorials/{tutorial_id}", response_model=TutorialResponse)
async def get_tutorial(
    tutorial_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single tutorial."""
    result = await db.execute(
        select(Tutorial).where(Tutorial.id == tutorial_id, Tutorial.is_published == True)
    )
    tutorial = result.scalar_one_or_none()
    if not tutorial:
        raise HTTPException(status_code=404, detail="Tutorial not found")
    return tutorial


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  TUTORIALS — Admin endpoints
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/admin/tutorials", response_model=List[TutorialResponse])
async def admin_list_tutorials(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List ALL tutorials (including unpublished) for admin."""
    result = await db.execute(
        select(Tutorial).order_by(Tutorial.display_order.asc(), Tutorial.created_at.desc())
    )
    return result.scalars().all()


@router.post("/admin/tutorials", response_model=TutorialResponse, status_code=201)
async def create_tutorial(
    data: TutorialCreate,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new tutorial (admin only)."""
    tutorial = Tutorial(**data.model_dump())
    db.add(tutorial)
    await db.commit()
    await db.refresh(tutorial)
    return tutorial


@router.put("/admin/tutorials/{tutorial_id}", response_model=TutorialResponse)
async def update_tutorial(
    tutorial_id: int,
    data: TutorialUpdate,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a tutorial (admin only)."""
    result = await db.execute(select(Tutorial).where(Tutorial.id == tutorial_id))
    tutorial = result.scalar_one_or_none()
    if not tutorial:
        raise HTTPException(status_code=404, detail="Tutorial not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(tutorial, key, value)

    await db.commit()
    await db.refresh(tutorial)
    return tutorial


@router.delete("/admin/tutorials/{tutorial_id}", status_code=204)
async def delete_tutorial(
    tutorial_id: int,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a tutorial (admin only)."""
    result = await db.execute(select(Tutorial).where(Tutorial.id == tutorial_id))
    tutorial = result.scalar_one_or_none()
    if not tutorial:
        raise HTTPException(status_code=404, detail="Tutorial not found")

    await db.delete(tutorial)
    await db.commit()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  BLOG POSTS — Public endpoints
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/blogs", response_model=List[BlogPostListItem])
async def list_blog_posts(
    category: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List published blog posts (without full content)."""
    query = select(BlogPost).where(BlogPost.is_published == True)
    if category:
        query = query.where(BlogPost.category == category)
    query = query.order_by(BlogPost.created_at.desc())

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/blogs/categories", response_model=List[str])
async def list_blog_categories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get distinct blog categories."""
    result = await db.execute(
        select(BlogPost.category)
        .where(BlogPost.is_published == True)
        .distinct()
        .order_by(BlogPost.category)
    )
    return [row[0] for row in result.all() if row[0]]


@router.get("/blogs/{slug}", response_model=BlogPostResponse)
async def get_blog_post(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single blog post by slug (with full content)."""
    result = await db.execute(
        select(BlogPost).where(BlogPost.slug == slug, BlogPost.is_published == True)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")
    return post


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  BLOG POSTS — Admin endpoints
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/admin/blogs", response_model=List[BlogPostListItem])
async def admin_list_blog_posts(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List ALL blog posts (including unpublished) for admin."""
    result = await db.execute(
        select(BlogPost).order_by(BlogPost.created_at.desc())
    )
    return result.scalars().all()


@router.post("/admin/blogs", response_model=BlogPostResponse, status_code=201)
async def create_blog_post(
    data: BlogPostCreate,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new blog post (admin only)."""
    post_data = data.model_dump()

    # Auto-generate slug if not provided
    if not post_data.get("slug"):
        post_data["slug"] = generate_slug(post_data["title"])

    # Ensure slug is unique
    existing = await db.execute(
        select(BlogPost).where(BlogPost.slug == post_data["slug"])
    )
    if existing.scalar_one_or_none():
        # Append a number to make unique
        base_slug = post_data["slug"]
        counter = 2
        while True:
            candidate = f"{base_slug}-{counter}"
            check = await db.execute(select(BlogPost).where(BlogPost.slug == candidate))
            if not check.scalar_one_or_none():
                post_data["slug"] = candidate
                break
            counter += 1

    post_data["author_id"] = admin.id
    post = BlogPost(**post_data)
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return post


@router.put("/admin/blogs/{blog_id}", response_model=BlogPostResponse)
async def update_blog_post(
    blog_id: int,
    data: BlogPostUpdate,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a blog post (admin only)."""
    result = await db.execute(select(BlogPost).where(BlogPost.id == blog_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")

    update_data = data.model_dump(exclude_unset=True)

    # Re-generate slug if title changed and slug not explicitly provided
    if "title" in update_data and "slug" not in update_data:
        update_data["slug"] = generate_slug(update_data["title"])

    for key, value in update_data.items():
        setattr(post, key, value)

    await db.commit()
    await db.refresh(post)
    return post


@router.delete("/admin/blogs/{blog_id}", status_code=204)
async def delete_blog_post(
    blog_id: int,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a blog post (admin only)."""
    result = await db.execute(select(BlogPost).where(BlogPost.id == blog_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Blog post not found")

    await db.delete(post)
    await db.commit()