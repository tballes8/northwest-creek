import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import ThemeToggle from '../components/ThemeToggle';
import { User } from '../types';
import { authAPI } from '../services/api';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface BlogPostItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  category: string;
  tags: string | null;
  author_id: string | null;
  is_published: boolean;
  created_at: string | null;
  updated_at: string | null;
}

const BlogList: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<BlogPostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    const loadData = async () => {
      // Try to load user (optional — visitor may not be logged in)
      try {
        const userRes = await authAPI.getCurrentUser();
        setUser(userRes.data);
      } catch {
        // Not logged in — that's fine for public blog pages
      }

      try {
        const [postsRes, catsRes] = await Promise.all([
          axios.get(`${API_URL}/api/v1/content/blogs`),
          axios.get(`${API_URL}/api/v1/content/blogs/categories`),
        ]);
        setPosts(postsRes.data);
        setCategories(catsRes.data);
      } catch (err) {
        console.error('Failed to load blog posts:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const filteredPosts = selectedCategory
    ? posts.filter((p) => p.category === selectedCategory)
    : posts;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-800">
      {/* Nav */}
      <nav className="bg-gray-900 shadow-sm border-b border-gray-700">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/images/logo.png" alt="Northwest Creek" className="h-10 w-10 mr-3" />
              <span
                className="text-xl font-bold text-primary-400"
                style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}
              >
                Northwest Creek
              </span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              {user && <Link to="/dashboard" className="text-gray-400 hover:text-white">Dashboard</Link>}
              <Link to="/blogs" className="text-primary-400 font-medium border-b-2 border-primary-400 pb-1">Blog</Link>
            </div>
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              {user ? (
                <Link to="/dashboard" className="text-sm text-gray-300 hover:text-teal-400">{user.email}</Link>
              ) : (
                <div className="flex items-center space-x-3">
                  <Link to="/login" className="text-sm text-gray-300 hover:text-teal-400">Sign In</Link>
                  <Link
                    to="/register"
                    className="text-sm px-3 py-1.5 rounded-md bg-primary-600 text-white hover:bg-primary-500 transition-colors"
                  >
                    Get Started
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">Blog</h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Insights on investing, portfolio strategy, and building wealth with a balanced approach.
          </p>
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === null
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === cat
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Posts */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-20">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No posts yet</h2>
            <p className="text-gray-500 dark:text-gray-400">Check back soon for new content.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredPosts.map((post) => (
              <Link
                key={post.id}
                to={`/blogs/${post.slug}`}
                className="group bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-sm hover:shadow-lg border border-gray-200 dark:border-gray-700 transition-all duration-200 hover:-translate-y-0.5"
              >
                {/* Cover Image */}
                {post.cover_image_url ? (
                  <div className="aspect-[16/9] overflow-hidden">
                    <img
                      src={post.cover_image_url}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                ) : (
                  <div className="aspect-[16/9] bg-gradient-to-br from-primary-500/20 to-primary-700/20 flex items-center justify-center">
                    <svg className="w-12 h-12 text-primary-400/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                    </svg>
                  </div>
                )}

                <div className="p-5">
                  {/* Category + Date */}
                  <div className="flex items-center gap-3 mb-3">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                      {post.category}
                    </span>
                    {post.created_at && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(post.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2">
                    {post.title}
                  </h2>

                  {/* Excerpt */}
                  {post.excerpt && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
                      {post.excerpt}
                    </p>
                  )}

                  {/* Tags */}
                  {post.tags && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {post.tags.split(',').slice(0, 3).map((tag, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
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

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-700 mt-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src="/images/logo.png" alt="Northwest Creek" className="h-6 w-6" />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                © {new Date().getFullYear()} Northwest Creek LLC
              </span>
            </div>
            <div className="flex items-center gap-6">
              {!user && (
                <Link to="/register" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                  Create Free Account
                </Link>
              )}
              <Link to="/dashboard" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default BlogList;