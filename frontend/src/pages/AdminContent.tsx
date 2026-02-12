import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import ThemeToggle from '../components/ThemeToggle';
import { User } from '../types';
import { authAPI } from '../services/api';
// WYSIWYG Editor — install: npm install react-quill-new
// If using the older package: npm install react-quill  (change import accordingly)
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface Tutorial {
  id: number;
  title: string;
  description: string | null;
  youtube_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  category: string;
  display_order: number;
  is_published: boolean;
  created_at: string | null;
}

interface BlogPostItem {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content?: string;
  cover_image_url: string | null;
  category: string;
  tags: string | null;
  is_published: boolean;
  created_at: string | null;
}

// Quill toolbar configuration
const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['blockquote', 'code-block'],
    ['link', 'image'],
    [{ color: [] }, { background: [] }],
    [{ align: [] }],
    ['clean'],
  ],
};

const quillFormats = [
  'header', 'bold', 'italic', 'underline', 'strike',
  'list', 'bullet', 'blockquote', 'code-block',
  'link', 'image', 'color', 'background', 'align',
];

const AdminContent: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'tutorials' | 'blogs'>('tutorials');
  const [loading, setLoading] = useState(true);

  // Tutorials state
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [tutorialForm, setTutorialForm] = useState(false);
  const [editingTutorial, setEditingTutorial] = useState<Tutorial | null>(null);
  const [tutForm, setTutForm] = useState({
    title: '', description: '', youtube_url: '', category: 'Getting Started', display_order: 0, is_published: false,
  });
  const [tutSaving, setTutSaving] = useState(false);

  // Blog state
  const [blogs, setBlogs] = useState<BlogPostItem[]>([]);
  const [blogForm, setBlogForm] = useState(false);
  const [editingBlog, setEditingBlog] = useState<BlogPostItem | null>(null);
  const [blogFormData, setBlogFormData] = useState({
    title: '', content: '', excerpt: '', cover_image_url: '', category: 'Charts & Graphs', tags: '', is_published: false,
  });
  const [blogSaving, setBlogSaving] = useState(false);

  // Feedback
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('access_token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const userRes = await authAPI.getCurrentUser();
        if (!userRes.data.is_admin) {
          navigate('/dashboard');
          return;
        }
        setUser(userRes.data);
        await Promise.all([loadTutorials(), loadBlogs()]);
      } catch (err: any) {
        if (err.response?.status === 401) navigate('/login');
        else navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [navigate]);

  // ── Tutorial CRUD ───────────────────────────────────────

  const loadTutorials = async () => {
    const res = await axios.get(`${API_URL}/api/v1/content/admin/tutorials`, { headers: getHeaders() });
    setTutorials(res.data);
  };

  const openTutorialForm = (tutorial?: Tutorial) => {
    if (tutorial) {
      setEditingTutorial(tutorial);
      setTutForm({
        title: tutorial.title,
        description: tutorial.description || '',
        youtube_url: tutorial.youtube_url || '',
        category: tutorial.category,
        display_order: tutorial.display_order,
        is_published: tutorial.is_published,
      });
    } else {
      setEditingTutorial(null);
      setTutForm({ title: '', description: '', youtube_url: '', category: 'Getting Started', display_order: 0, is_published: false });
    }
    setTutorialForm(true);
  };

  const saveTutorial = async () => {
    setTutSaving(true);
    try {
      if (editingTutorial) {
        await axios.put(`${API_URL}/api/v1/content/admin/tutorials/${editingTutorial.id}`, tutForm, { headers: getHeaders() });
        setMessage({ type: 'success', text: 'Tutorial updated!' });
      } else {
        await axios.post(`${API_URL}/api/v1/content/admin/tutorials`, tutForm, { headers: getHeaders() });
        setMessage({ type: 'success', text: 'Tutorial created!' });
      }
      setTutorialForm(false);
      await loadTutorials();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to save tutorial' });
    } finally {
      setTutSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const deleteTutorial = async (id: number) => {
    if (!window.confirm('Delete this tutorial?')) return;
    try {
      await axios.delete(`${API_URL}/api/v1/content/admin/tutorials/${id}`, { headers: getHeaders() });
      setMessage({ type: 'success', text: 'Tutorial deleted' });
      await loadTutorials();
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete tutorial' });
    }
    setTimeout(() => setMessage(null), 4000);
  };

  // ── Blog CRUD ───────────────────────────────────────────

  const loadBlogs = async () => {
    const res = await axios.get(`${API_URL}/api/v1/content/admin/blogs`, { headers: getHeaders() });
    setBlogs(res.data);
  };

  const openBlogForm = async (post?: BlogPostItem) => {
    if (post) {
      // Fetch full content for editing
      try {
        const res = await axios.get(`${API_URL}/api/v1/content/blogs/${post.slug}`, { headers: getHeaders() });
        setEditingBlog(post);
        setBlogFormData({
          title: res.data.title,
          content: res.data.content,
          excerpt: res.data.excerpt || '',
          cover_image_url: res.data.cover_image_url || '',
          category: res.data.category,
          tags: res.data.tags || '',
          is_published: res.data.is_published,
        });
      } catch {
        setMessage({ type: 'error', text: 'Failed to load blog post for editing' });
        return;
      }
    } else {
      setEditingBlog(null);
      setBlogFormData({
        title: '', content: '', excerpt: '', cover_image_url: '', category: 'Charts & Graphs', tags: '', is_published: false,
      });
    }
    setBlogForm(true);
  };

  const saveBlog = async () => {
    if (!blogFormData.title.trim() || !blogFormData.content.trim()) {
      setMessage({ type: 'error', text: 'Title and content are required' });
      setTimeout(() => setMessage(null), 4000);
      return;
    }
    setBlogSaving(true);
    try {
      if (editingBlog) {
        await axios.put(`${API_URL}/api/v1/content/admin/blogs/${editingBlog.id}`, blogFormData, { headers: getHeaders() });
        setMessage({ type: 'success', text: 'Blog post updated!' });
      } else {
        await axios.post(`${API_URL}/api/v1/content/admin/blogs`, blogFormData, { headers: getHeaders() });
        setMessage({ type: 'success', text: 'Blog post created!' });
      }
      setBlogForm(false);
      await loadBlogs();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to save blog post' });
    } finally {
      setBlogSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const deleteBlog = async (id: number) => {
    if (!window.confirm('Delete this blog post?')) return;
    try {
      await axios.delete(`${API_URL}/api/v1/content/admin/blogs/${id}`, { headers: getHeaders() });
      setMessage({ type: 'success', text: 'Blog post deleted' });
      await loadBlogs();
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete blog post' });
    }
    setTimeout(() => setMessage(null), 4000);
  };

  // ── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const tutorialCategories = ['Getting Started', 'Dashboard', 'Watchlist', 'Portfolio', 'Stocks', 'Technical Analysis', 'DCF Valuation', 'Alerts', 'General'];
  const blogCategories = ['Charts & Graphs', 'Technical Analysis', 'Fundamental Analysis', 'Portfolio Strategy', 'Getting Started', 'Feature Guides', 'Market Insights', 'General'];

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
              <span className="text-amber-400 font-medium border-b-2 border-amber-400 pb-1">Admin Panel</span>
            </div>
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <Link to="/dashboard" className="text-sm text-gray-300 hover:text-teal-400">{user?.email}</Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Panel</h1>
        </div>

        {/* Feedback */}
        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            message.type === 'success'
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}>
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 w-fit mb-6">
          <button
            onClick={() => { setActiveTab('tutorials'); setTutorialForm(false); setBlogForm(false); }}
            className={`px-6 py-2 text-sm font-medium transition-colors ${
              activeTab === 'tutorials'
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Tutorials ({tutorials.length})
          </button>
          <button
            onClick={() => { setActiveTab('blogs'); setTutorialForm(false); setBlogForm(false); }}
            className={`px-6 py-2 text-sm font-medium transition-colors ${
              activeTab === 'blogs'
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Blog Posts ({blogs.length})
          </button>
        </div>

        {/* ════════════════════════════════════════════════════
            TUTORIALS TAB
           ════════════════════════════════════════════════════ */}
        {activeTab === 'tutorials' && (
          <div>
            {!tutorialForm && (
              <button
                onClick={() => openTutorialForm()}
                className="mb-4 inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add Tutorial
              </button>
            )}

            {/* Tutorial Form */}
            {tutorialForm && (
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg border dark:border-gray-500 p-6 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {editingTutorial ? 'Edit Tutorial' : 'New Tutorial'}
                </h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
                    <input
                      type="text"
                      value={tutForm.title}
                      onChange={e => setTutForm({ ...tutForm, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="e.g., How to Set Up Your Watchlist"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">YouTube URL *</label>
                    <input
                      type="text"
                      value={tutForm.youtube_url}
                      onChange={e => setTutForm({ ...tutForm, youtube_url: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="https://www.youtube.com/watch?v=..."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                    <textarea
                      value={tutForm.description}
                      onChange={e => setTutForm({ ...tutForm, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="Brief description of what this tutorial covers..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                    <select
                      value={tutForm.category}
                      onChange={e => setTutForm({ ...tutForm, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      {tutorialCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Order</label>
                    <input
                      type="number"
                      value={tutForm.display_order}
                      onChange={e => setTutForm({ ...tutForm, display_order: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="tut-published"
                      checked={tutForm.is_published}
                      onChange={e => setTutForm({ ...tutForm, is_published: e.target.checked })}
                      className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                    />
                    <label htmlFor="tut-published" className="text-sm text-gray-700 dark:text-gray-300">Published (visible to users)</label>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-5">
                  <button
                    onClick={saveTutorial}
                    disabled={tutSaving || !tutForm.title.trim()}
                    className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors"
                  >
                    {tutSaving ? 'Saving...' : (editingTutorial ? 'Update Tutorial' : 'Create Tutorial')}
                  </button>
                  <button
                    onClick={() => setTutorialForm(false)}
                    className="px-5 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Tutorials List */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg border dark:border-gray-500 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Order</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                  {tutorials.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No tutorials yet. Click "Add Tutorial" to create one.</td></tr>
                  ) : tutorials.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-600/50">
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{t.display_order}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{t.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{t.category}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.is_published
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                        }`}>
                          {t.is_published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openTutorialForm(t)} className="text-primary-600 dark:text-primary-400 hover:underline text-sm mr-3">Edit</button>
                        <button onClick={() => deleteTutorial(t.id)} className="text-red-500 dark:text-red-400 hover:underline text-sm">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            BLOG POSTS TAB
           ════════════════════════════════════════════════════ */}
        {activeTab === 'blogs' && (
          <div>
            {!blogForm && (
              <button
                onClick={() => openBlogForm()}
                className="mb-4 inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                New Blog Post
              </button>
            )}

            {/* Blog Editor Form */}
            {blogForm && (
              <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg border dark:border-gray-500 p-6 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {editingBlog ? 'Edit Blog Post' : 'New Blog Post'}
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
                    <input
                      type="text"
                      value={blogFormData.title}
                      onChange={e => setBlogFormData({ ...blogFormData, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="e.g., Understanding Candlestick Charts"
                    />
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                      <select
                        value={blogFormData.category}
                        onChange={e => setBlogFormData({ ...blogFormData, category: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        {blogCategories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags (comma-separated)</label>
                      <input
                        type="text"
                        value={blogFormData.tags}
                        onChange={e => setBlogFormData({ ...blogFormData, tags: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        placeholder="RSI, MACD, Moving Averages"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cover Image URL</label>
                      <input
                        type="text"
                        value={blogFormData.cover_image_url}
                        onChange={e => setBlogFormData({ ...blogFormData, cover_image_url: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        placeholder="https://..."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Excerpt (preview text)</label>
                    <textarea
                      value={blogFormData.excerpt}
                      onChange={e => setBlogFormData({ ...blogFormData, excerpt: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="A short preview that appears on the blog listing..."
                    />
                  </div>

                  {/* WYSIWYG Editor */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Content *</label>
                    <div className="bg-white rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                      <ReactQuill
                        theme="snow"
                        value={blogFormData.content}
                        onChange={(content: string) => setBlogFormData({ ...blogFormData, content })}
                        modules={quillModules}
                        formats={quillFormats}
                        placeholder="Write your blog post here..."
                        style={{ minHeight: '300px' }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="blog-published"
                      checked={blogFormData.is_published}
                      onChange={e => setBlogFormData({ ...blogFormData, is_published: e.target.checked })}
                      className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                    />
                    <label htmlFor="blog-published" className="text-sm text-gray-700 dark:text-gray-300">Published (visible to users)</label>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-5">
                  <button
                    onClick={saveBlog}
                    disabled={blogSaving || !blogFormData.title.trim() || !blogFormData.content.trim()}
                    className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors"
                  >
                    {blogSaving ? 'Saving...' : (editingBlog ? 'Update Post' : 'Publish Post')}
                  </button>
                  <button
                    onClick={() => setBlogForm(false)}
                    className="px-5 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Blog Posts List */}
            <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg border dark:border-gray-500 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Created</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                  {blogs.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No blog posts yet. Click "New Blog Post" to write one.</td></tr>
                  ) : blogs.map(b => (
                    <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-600/50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{b.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{b.category}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          b.is_published
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                        }`}>
                          {b.is_published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {b.created_at ? new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openBlogForm(b)} className="text-primary-600 dark:text-primary-400 hover:underline text-sm mr-3">Edit</button>
                        <button onClick={() => deleteBlog(b.id)} className="text-red-500 dark:text-red-400 hover:underline text-sm">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminContent;
