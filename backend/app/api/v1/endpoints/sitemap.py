from datetime import datetime
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import BlogPost

router = APIRouter()

BASE_URL = "https://nwc-analytics.com"

# Static pages worth indexing. Deliberately excludes /login and /register —
# auth pages have no search value and robots.txt blocks them.
STATIC_PATHS = ["/", "/pricing", "/blogs"]


def _url_entry(loc: str, lastmod: datetime | None = None) -> str:
    lastmod_tag = (
        f"<lastmod>{lastmod.strftime('%Y-%m-%d')}</lastmod>" if lastmod else ""
    )
    return f"<url><loc>{escape(loc)}</loc>{lastmod_tag}</url>"


@router.get("/sitemap.xml", include_in_schema=False)
async def sitemap(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BlogPost.slug, BlogPost.updated_at, BlogPost.created_at)
        .where(BlogPost.is_published == True)
        .order_by(BlogPost.updated_at.desc())
    )
    posts = result.all()

    newest = (posts[0].updated_at or posts[0].created_at) if posts else None
    entries = [
        _url_entry(f"{BASE_URL}{path}", newest if path == "/blogs" else None)
        for path in STATIC_PATHS
    ]
    entries += [
        _url_entry(f"{BASE_URL}/blogs/{slug}", updated_at or created_at)
        for slug, updated_at, created_at in posts
    ]

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        + "".join(entries)
        + "</urlset>"
    )
    return Response(content=xml, media_type="application/xml")
