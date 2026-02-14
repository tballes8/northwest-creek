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

const BlogPost: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
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
      // Try to load user (optional — determines which nav to show)
      try {
        const userRes = await authAPI.getCurrentUser();
        setUser(userRes.data);
      } catch {
        // Not logged in — will show public nav
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
  }, [slug]);

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">
      {/* Navigation */}
      <nav className="bg-gray-900 dark:bg-gray-900 shadow-sm border-b border-gray-700 dark:border-gray-700">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Logo — links to landing when public, static when signed in (matches Dashboard) */}
            {user ? (
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
            {user && (
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
              {/* Signed in: user dropdown */}
              {user ? (
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
              ) : (
                /* Not signed in: just an "All Posts" link */
                <Link to="/blogs" className="text-gray-400 hover:text-white text-sm font-medium">All Posts</Link>
              )}
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

            {/* Content — Tailwind prose handles all typography */}
            <div
              className="prose prose-lg dark:prose-invert max-w-none
                prose-headings:text-gray-900 dark:prose-headings:text-white
                prose-p:text-gray-700 dark:prose-p:text-gray-300
                prose-a:text-primary-600 dark:prose-a:text-primary-400
                prose-strong:text-gray-900 dark:prose-strong:text-white
                prose-img:rounded-lg prose-img:shadow-md
                prose-pre:bg-gray-900 prose-pre:text-gray-100
                prose-code:text-primary-600 dark:prose-code:text-primary-400
                prose-blockquote:border-primary-500"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />
          </article>
        ) : null}
      </div>
    </div>
  );
};

export default BlogPost;