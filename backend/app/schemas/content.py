"""
Content Schemas — Pydantic models for Tutorial and BlogPost endpoints
Save as: backend/app/schemas/content.py
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ── Tutorials ──────────────────────────────────────────────

class TutorialBase(BaseModel):
    title: str = Field(..., max_length=255)
    description: Optional[str] = None
    youtube_url: Optional[str] = None
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    category: str = "General"
    display_order: int = 0
    is_published: bool = False


class TutorialCreate(TutorialBase):
    pass


class TutorialUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    youtube_url: Optional[str] = None
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    category: Optional[str] = None
    display_order: Optional[int] = None
    is_published: Optional[bool] = None


class TutorialResponse(TutorialBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Blog Posts ─────────────────────────────────────────────

class BlogPostBase(BaseModel):
    title: str = Field(..., max_length=255)
    content: str
    excerpt: Optional[str] = None
    cover_image_url: Optional[str] = None
    category: str = "General"
    tags: Optional[str] = None
    is_published: bool = False


class BlogPostCreate(BlogPostBase):
    slug: Optional[str] = None  # Auto-generated from title if not provided


class BlogPostUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    slug: Optional[str] = None
    content: Optional[str] = None
    excerpt: Optional[str] = None
    cover_image_url: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None
    is_published: Optional[bool] = None


class BlogPostResponse(BlogPostBase):
    id: int
    slug: str
    author_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BlogPostListItem(BaseModel):
    """Lighter model for blog listing (no full content)"""
    id: int
    title: str
    slug: str
    excerpt: Optional[str] = None
    cover_image_url: Optional[str] = None
    category: str = "General"
    tags: Optional[str] = None
    is_published: bool = False
    author_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True