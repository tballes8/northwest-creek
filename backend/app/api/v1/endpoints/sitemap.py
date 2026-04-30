from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import BlogPost

router = APIRouter()

STATIC_URLS = [
    ("https://nwc-analytics.com/", "weekly", "1.0"),
    ("https://nwc-analytics.com/pricing", "monthly", "0.9"),
    ("https://nwc-analytics.com/blogs", "weekly", "0.8"),
    ("https://nwc-analytics.com/login", "monthly", "0.3"),
    ("https://nwc-analytics.com/register", "monthly", "0.4"),
]


@router.get("/sitemap.xml", include_in_schema=False)
async def sitemap(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BlogPost.slug, BlogPost.updated_at)
        .where(BlogPost.is_published == True)
        .order_by(BlogPost.updated_at.desc())
    )
    blog_posts = result.all()

    urls = []
    for loc, changefreq, priority in STATIC_URLS:
        urls.append(
            f"  <url>\n"
            f"    <loc>{loc}</loc>\n"
            f"    <changefreq>{changefreq}</changefreq>\n"
            f"    <priority>{priority}</priority>\n"
            f"  </url>"
        )

    for slug, updated_at in blog_posts:
        lastmod = updated_at.strftime("%Y-%m-%d") if updated_at else ""
        lastmod_tag = f"\n    <lastmod>{lastmod}</lastmod>" if lastmod else ""
        urls.append(
            f"  <url>\n"
            f"    <loc>https://nwc-analytics.com/blogs/{slug}</loc>{lastmod_tag}\n"
            f"    <changefreq>monthly</changefreq>\n"
            f"    <priority>0.7</priority>\n"
            f"  </url>"
        )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>"
    )
    return Response(content=xml, media_type="application/xml")
