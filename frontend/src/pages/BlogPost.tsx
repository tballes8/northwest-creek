import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    const loadPost = async () => {
      try {
        // Try to load user (optional — visitor may not be logged in)
        try {
          const userRes = await authAPI.getCurrentUser();
          setUser(userRes.data);
        } catch {
          // Not logged in — that's fine for public blog pages
        }

        const token = localStorage.getItem('access_token');
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await axios.get(
          `${API_URL}/api/v1/content/blogs/${slug}`,
          { headers }
        );
        setPost(res.data);
      } catch (err: any) {
        if (err.response?.status === 404) setError('Post not found');
        else setError('Failed to load blog post');
      } finally {
        setLoading(false);
      }
    };
    if (slug) loadPost();
  }, [slug, navigate]);

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
              <Link to="/blogs" className="text-primary-400 font-medium border-b-2 border-primary-400 pb-1">Blog</Link>
            </div>
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <Link to="/dashboard" className="text-sm text-gray-300 hover:text-teal-400">{user?.email}</Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 overflow-hidden">
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
          <article>
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

            {/* Content */}
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
              style={{ textAlign: 'justify', overflowWrap: 'normal', wordBreak: 'normal' }}
              dangerouslySetInnerHTML={{ __html: post.content }}
            />
          </article>
        ) : null}
      </div>
    </div>
  );
};

export default BlogPost;