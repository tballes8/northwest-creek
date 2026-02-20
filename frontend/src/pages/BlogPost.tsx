import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import ThemeToggle from '../components/ThemeToggle';
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

  // Strip <!DOCTYPE>, <html>, <head> wrappers — keep <style> + <body> content
  const extractBody = (raw: string): string => {
    // If there's a <body>, grab its innerHTML; otherwise treat as fragment
    const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : raw;

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

  // User dropdown menu
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const getTierBadge = (tier: string) => {
    const badges = {
      free: { bg: 'bg-gray-100 dark:bg-gray-600', text: 'text-gray-800 dark:text-gray-200', label: 'Free' },
      casual: { bg: 'bg-primary-100 dark:bg-primary-900/50', text: 'text-primary-800 dark:text-primary-200', label: 'Casual' },
      active: { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-800 dark:text-purple-200', label: 'Active' },
      professional: { bg: 'bg-yellow-100 dark:bg-yellow-900/50', text: 'text-yellow-800 dark:text-yellow-200', label: 'Professional' },
    };
    const badge = badges[tier as keyof typeof badges] || badges.free;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  // Use hasToken for immediate nav decision, user for dropdown details
  const isSignedIn = hasToken && user;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">
      {/* Navigation */}
      <nav className="bg-gray-900 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Logo — links to landing when public, static when signed in */}
            {hasToken ? (
              <div className="flex items-center">
                <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3" />
                <span className="text-xl font-bold text-primary-400 dark:text-primary-400" style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}>Northwest Creek</span>
              </div>
            ) : (
              <Link to="/" className="flex items-center">
                <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3" />
                <span className="text-xl font-bold text-primary-400" style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}>Northwest Creek</span>
              </Link>
            )}

            {/* Signed in: full page links */}
            {hasToken && (
              <div className="hidden md:flex items-center space-x-8">
                <Link to="/dashboard" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Dashboard</Link>
                <Link to="/watchlist" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Watchlist</Link>
                <Link to="/portfolio" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Portfolio</Link>
                <Link to="/alerts" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Alerts</Link>
                <Link to="/stocks" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Stocks</Link>
                <Link to="/technical-analysis" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Technical Analysis</Link>
                <Link to="/dcf-valuation" className="text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">DCF Valuation</Link>
              </div>
            )}

            <div className="flex items-center space-x-4">
              {/* Signed in: user dropdown (renders once user data loads) */}
              {isSignedIn ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 text-sm text-gray-300 hover:text-teal-400 transition-colors focus:outline-none"
                  >
                    <span className="hidden lg:inline">{user.email}</span>
                    <span className="lg:hidden">{user.email?.split('@')[0]}</span>
                    {getTierBadge(user.subscription_tier)}
                    <svg className={`w-4 h-4 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 py-1 animate-in fade-in duration-150">
                      <div className="px-4 py-2 border-b border-gray-700">
                        <p className="text-sm font-medium text-white truncate">{user.full_name || user.email}</p>
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      </div>

                      <Link
                        to="/account"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        Account Settings
                      </Link>
                      <Link
                        to="/tutorials"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Tutorials
                      </Link>
                      <Link
                        to="/blogs"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
                        Blog
                      </Link>

                      {user.is_admin && (
                        <>
                          <div className="border-t border-gray-700 my-1"></div>
                          <Link
                            to="/admin"
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-amber-400 hover:bg-gray-700 hover:text-amber-300 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            Admin Panel
                          </Link>
                        </>
                      )}

                      <div className="border-t border-gray-700 my-1"></div>
                      <button
                        onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              ) : !hasToken ? (
                /* Not signed in: just an "All Posts" link */
                <Link to="/blogs" className="text-gray-400 hover:text-white text-sm font-medium">All Posts</Link>
              ) : null}
              <ThemeToggle />
            </div>
          </div>
        </div>
      </nav>

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
            <title>{post.title} — Northwest Creek Blog</title>
            <meta name="description" content={post.excerpt || `${post.title} — stock analysis insights from Northwest Creek.`} />
            <link rel="canonical" href={`https://northwestcreekllc.com/blogs/${post.slug}`} />
            <meta property="og:type" content="article" />
            <meta property="og:title" content={post.title} />
            <meta property="og:description" content={post.excerpt || `${post.title} — stock analysis insights from Northwest Creek.`} />
            <meta property="og:url" content={`https://northwestcreekllc.com/blogs/${post.slug}`} />
            {post.cover_image_url && <meta property="og:image" content={post.cover_image_url} />}
            <meta property="og:site_name" content="Northwest Creek" />
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
              "url": `https://northwestcreekllc.com/blogs/${post.slug}`,
              ...(post.cover_image_url && { "image": post.cover_image_url }),
              ...(post.created_at && { "datePublished": new Date(post.created_at).toISOString() }),
              ...(post.updated_at && { "dateModified": new Date(post.updated_at).toISOString() }),
              "articleSection": post.category,
              ...(post.tags && { "keywords": post.tags }),
              "publisher": {
                "@type": "Organization",
                "name": "Northwest Creek LLC",
                "logo": {
                  "@type": "ImageObject",
                  "url": "https://northwestcreekllc.com/images/logo.png"
                }
              },
              "mainEntityOfPage": {
                "@type": "WebPage",
                "@id": `https://northwestcreekllc.com/blogs/${post.slug}`
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
    </div>
  );
};

export default BlogPost;
