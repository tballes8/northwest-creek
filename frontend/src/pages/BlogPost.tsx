import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import NavBar from '../components/NavBar';
import BackToTop from '../components/BackToTop';
import { User } from '../types';
import { authAPI } from '../services/api';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface BlogPostFull {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  cover_image_url: string | null;
  category: string;
  tags: string | null;
  author_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * IframeContent — renders full HTML (including <style> blocks) in a sandboxed
 * iframe that auto-resizes to its content height.  Injects a small base
 * stylesheet so bare HTML still looks presentable, and listens for dark-mode
 * changes on the parent document.
 * iframe that auto-resizes to its content height.
 */
const IframeContent: React.FC<{ html: string }> = ({ html }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

    // Preserve any <style> blocks from <head> or anywhere in the doc
  const extractBody = (raw: string): string => {
    const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : raw;
    const styles: string[] = [];
    raw.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, (match) => {
      styles.push(match);
      return '';
    });

    // Dedupe: if a <style> block already exists inside bodyContent, don't re-add
    const uniqueStyles = styles.filter(s => !bodyContent.includes(s));
    return uniqueStyles.join('\n') + '\n' + bodyContent;
  };

  const isDark = document.documentElement.classList.contains('dark');

  // Base stylesheet: sensible defaults so unstyled HTML isn't raw white/black
  const baseCSS = `
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
        "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 1.05rem; line-height: 1.7;
      color: ${isDark ? '#d1d5db' : '#374151'};
      background: transparent;
      overflow-x: hidden;
    }
    img { max-width: 100%; height: auto; border-radius: 0.5rem; }
    a { color: ${isDark ? '#5eead4' : '#0d9488'}; }
    pre, code { overflow-x: auto; }
  `;

  const srcDoc = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${baseCSS}</style>
</head>
<body>${extractBody(html)}
<script>
  // Notify parent of content height so it can resize the iframe
  function postHeight() {
    const h = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: 'iframe-height', height: h }, '*');
  }
  window.addEventListener('load', () => { postHeight(); setTimeout(postHeight, 300); });
  new MutationObserver(postHeight).observe(document.body, { childList: true, subtree: true, attributes: true });
  new ResizeObserver(postHeight).observe(document.body);
</script>
</body></html>`;

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'iframe-height' && iframeRef.current) {
        iframeRef.current.style.height = `${e.data.height + 16}px`;
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-same-origin"
      className="w-full border-0"
      style={{ minHeight: '200px', overflow: 'hidden' }}
      title="Blog post content"
    />
  );
};

const BlogPost: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  // Sync check — determines which nav renders on first paint (no flash)
  const hasToken = !!localStorage.getItem('access_token');

  const [user, setUser] = useState<User | null>(null);
  const [post, setPost] = useState<BlogPostFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPost = async () => {
      // Try to load user details for dropdown (optional)
      if (hasToken) {
        try {
          const userRes = await authAPI.getCurrentUser();
          setUser(userRes.data);
        } catch {
          // Token expired or invalid — will show public nav
        }
      }

      // Always fetch the blog post (public endpoint)
      try {
        const res = await axios.get(`${API_URL}/api/v1/content/blogs/${slug}`);
        setPost(res.data);
      } catch (err: any) {
        if (err.response?.status === 404) setError('Post not found');
        else setError('Failed to load blog post');
      } finally {
        setLoading(false);
      }
    };
    if (slug) loadPost();
  }, [slug, hasToken]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">
      {/* Navigation */}
      <NavBar currentPage="blogs" user={user} onLogout={handleLogout} />

      {/* Content area — same max-width as Dashboard */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back link */}
        <Link to="/blogs" className="inline-flex items-center gap-1.5 text-sm text-primary-500 hover:text-primary-400 mb-6 group">
          <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Blog
        </Link>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{error}</h2>
            <Link to="/blogs" className="text-primary-500 hover:text-primary-400">← Back to all posts</Link>
          </div>
        ) : post ? (
          <article className="max-w-4xl">
            {/* SEO — React 19 hoists to <head> automatically */}
            <title>{post.title} — NWC-Analytics Blog</title>
            <meta name="description" content={post.excerpt || `${post.title} — stock analysis insights from NWC-Analytics.`} />
            <link rel="canonical" href={`https://nwc-analytics.com/blogs/${post.slug}`} />
            <meta property="og:type" content="article" />
            <meta property="og:title" content={post.title} />
            <meta property="og:description" content={post.excerpt || `${post.title} — stock analysis insights from NWC-Analytics.`} />
            <meta property="og:url" content={`https://nwc-analytics.com/blogs/${post.slug}`} />
            {post.cover_image_url && <meta property="og:image" content={post.cover_image_url} />}
            <meta property="og:site_name" content="NWC-Analytics" />
            {post.created_at && <meta property="article:published_time" content={new Date(post.created_at).toISOString()} />}
            {post.updated_at && <meta property="article:modified_time" content={new Date(post.updated_at).toISOString()} />}
            <meta property="article:section" content={post.category} />
            <meta name="twitter:card" content={post.cover_image_url ? 'summary_large_image' : 'summary'} />
            <meta name="twitter:title" content={post.title} />
            <meta name="twitter:description" content={post.excerpt || `${post.title} — stock analysis insights.`} />
            {post.cover_image_url && <meta name="twitter:image" content={post.cover_image_url} />}

            {/* JSON-LD: BlogPosting (Google reads from anywhere in DOM) */}
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "BlogPosting",
              "headline": post.title,
              "description": post.excerpt || post.title,
              "url": `https://nwc-analytics.com/blogs/${post.slug}`,
              ...(post.cover_image_url && { "image": post.cover_image_url }),
              ...(post.created_at && { "datePublished": new Date(post.created_at).toISOString() }),
              ...(post.updated_at && { "dateModified": new Date(post.updated_at).toISOString() }),
              "articleSection": post.category,
              ...(post.tags && { "keywords": post.tags }),
              "publisher": {
                "@type": "Organization",
                "name": "NWC-Analytics, LLC",
                "logo": {
                  "@type": "ImageObject",
                  "url": "https://nwc-analytics.com/images/logo.png"
                }
              },
              "mainEntityOfPage": {
                "@type": "WebPage",
                "@id": `https://nwc-analytics.com/blogs/${post.slug}`
              }
            }) }} />
            {/* Cover Image */}
            {post.cover_image_url && (
              <div className="rounded-lg overflow-hidden mb-8 aspect-[21/9]">
                <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover" />
              </div>
            )}

            {/* Meta */}
            <div className="flex items-center gap-3 mb-4">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                {post.category}
              </span>
              {post.created_at && (
                <span className="text-sm text-gray-400 dark:text-gray-500">
                  {new Date(post.created_at).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric'
                  })}
                </span>
              )}
              {post.updated_at && post.updated_at !== post.created_at && (
                <span className="text-sm text-gray-400 dark:text-gray-500 italic">
                  (updated {new Date(post.updated_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  })})
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-6 leading-tight">
              {post.title}
            </h1>

            {/* Tags */}
            {post.tags && (
              <div className="flex flex-wrap gap-2 mb-8">
                {post.tags.split(',').map((tag, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">
                    {tag.trim()}
                  </span>
                ))}
              </div>
            )}

            {/* Content — iframe isolates full HTML + <style> blocks from app styles */}
            <IframeContent html={post.content} />
          </article>
        ) : null}
      </div>
      <BackToTop />
    </div>
  );
};

export default BlogPost;