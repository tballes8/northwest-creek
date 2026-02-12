import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import ThemeToggle from '../components/ThemeToggle';
import { User } from '../types';
import { authAPI } from '../services/api';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface BlogPostItem {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  category: string;
  tags: string | null;
  is_published: boolean;
  author_id: number | null;
  created_at: string | null;
}

/** Estimate reading time from word count (assumes ~200 wpm) */
const readTime = (excerpt: string | null): string => {
  if (!excerpt) return '3 min read';
  const words = excerpt.split(/\s+/).length;
  const mins = Math.max(1, Math.ceil(words / 200));
  return `${mins} min read`;
};

const Blogs: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<BlogPostItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const userRes = await authAPI.getCurrentUser();
        setUser(userRes.data);

        const token = localStorage.getItem('access_token');
        const headers = { Authorization: `Bearer ${token}` };

        const [blogRes, catRes] = await Promise.all([
          axios.get(`${API_URL}/api/v1/content/blogs`, { headers }),
          axios.get(`${API_URL}/api/v1/content/blogs/categories`, { headers }),
        ]);
        setPosts(blogRes.data);
        setCategories(catRes.data);
      } catch (err: any) {
        if (err.response?.status === 401) navigate('/login');
        console.error('Failed to load blogs:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [navigate]);

  const filtered = selectedCategory === 'All'
    ? posts
    : posts.filter(p => p.category === selectedCategory);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-800">
      {/* Nav */}
      <nav className="bg-gray-900 shadow-sm border-b border-gray-700">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3" />
              <span className="text-xl font-bold text-primary-400" style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}>Northwest Creek</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <Link to="/dashboard" className="text-gray-400 hover:text-white">Dashboard</Link>
              <Link to="/watchlist" className="text-gray-400 hover:text-white">Watchlist</Link>
              <Link to="/portfolio" className="text-gray-400 hover:text-white">Portfolio</Link>
              <Link to="/stocks" className="text-gray-400 hover:text-white">Stocks</Link>
              <Link to="/technical-analysis" className="text-gray-400 hover:text-white">Technical Analysis</Link>
              <Link to="/blogs" className="text-primary-400 font-medium border-b-2 border-primary-400 pb-1">Blog</Link>
            </div>
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <Link to="/dashboard" className="text-sm text-gray-300 hover:text-teal-400">{user?.email}</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <svg className="w-8 h-8 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Blog</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl">
            Deep dives into charts, graphs, technical indicators, and how to get the most out of your stock research.
          </p>
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setSelectedCategory('All')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === 'All'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === cat
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
            <span className="ml-3 text-gray-500 dark:text-gray-400">Loading posts...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No blog posts yet</h3>
            <p className="text-gray-500 dark:text-gray-400">We're writing something great — check back soon!</p>
          </div>
        ) : (
          /* Blog Grid */
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(post => (
              <Link
                key={post.id}
                to={`/blogs/${post.slug}`}
                className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 border dark:border-gray-500 overflow-hidden group hover:shadow-xl transition-shadow"
              >
                {/* Cover Image */}
                <div className="aspect-[16/9] bg-gradient-to-br from-primary-600/20 to-primary-800/30 overflow-hidden">
                  {post.cover_image_url ? (
                    <img
                      src={post.cover_image_url}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-12 h-12 text-primary-500/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                      {post.category}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {readTime(post.excerpt)}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2">
                    {post.title}
                  </h3>
                  {post.excerpt && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 mb-3">
                      {post.excerpt}
                    </p>
                  )}
                  {post.created_at && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(post.created_at).toLocaleDateString('en-US', {
                        month: 'long', day: 'numeric', year: 'numeric'
                      })}
                    </p>
                  )}

                  {/* Tags */}
                  {post.tags && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {post.tags.split(',').slice(0, 3).map((tag, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400">
                          {tag.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Blogs;
