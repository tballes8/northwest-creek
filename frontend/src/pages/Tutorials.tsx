import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import ThemeToggle from '../components/ThemeToggle';
import { User } from '../types';
import { authAPI } from '../services/api';

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

/** Extract YouTube video ID from various URL formats */
const getYouTubeId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
};

const getThumbnail = (tutorial: Tutorial): string => {
  if (tutorial.thumbnail_url) return tutorial.thumbnail_url;
  if (tutorial.youtube_url) {
    const id = getYouTubeId(tutorial.youtube_url);
    if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  }
  return '';
};

const Tutorials: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<number | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const userRes = await authAPI.getCurrentUser();
        setUser(userRes.data);

        const token = localStorage.getItem('access_token');
        const headers = { Authorization: `Bearer ${token}` };

        const [tutRes, catRes] = await Promise.all([
          axios.get(`${API_URL}/api/v1/content/tutorials`, { headers }),
          axios.get(`${API_URL}/api/v1/content/tutorials/categories`, { headers }),
        ]);
        setTutorials(tutRes.data);
        setCategories(catRes.data);
      } catch (err: any) {
        if (err.response?.status === 401) navigate('/login');
        console.error('Failed to load tutorials:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [navigate]);

  const filtered = selectedCategory === 'All'
    ? tutorials
    : tutorials.filter(t => t.category === selectedCategory);

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
              <Link to="/tutorials" className="text-primary-400 font-medium border-b-2 border-primary-400 pb-1">Tutorials</Link>
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Tutorials</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl">
            Learn how to use every feature of Northwest Creek. From setting up your first watchlist to advanced technical analysis — we've got you covered.
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
            <span className="ml-3 text-gray-500 dark:text-gray-400">Loading tutorials...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No tutorials yet</h3>
            <p className="text-gray-500 dark:text-gray-400">Check back soon — new content is on the way!</p>
          </div>
        ) : (
          /* Tutorial Grid */
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(tutorial => {
              const videoId = tutorial.youtube_url ? getYouTubeId(tutorial.youtube_url) : null;
              const isPlaying = playingId === tutorial.id;

              return (
                <div
                  key={tutorial.id}
                  className="bg-white dark:bg-gray-700 rounded-lg shadow-lg dark:shadow-gray-200/20 border dark:border-gray-500 overflow-hidden group"
                >
                  {/* Video / Thumbnail */}
                  <div className="relative aspect-video bg-gray-900">
                    {isPlaying && videoId ? (
                      <iframe
                        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
                        title={tutorial.title}
                        className="absolute inset-0 w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <button
                        onClick={() => setPlayingId(tutorial.id)}
                        className="absolute inset-0 w-full h-full focus:outline-none"
                      >
                        {getThumbnail(tutorial) ? (
                          <img
                            src={getThumbnail(tutorial)}
                            alt={tutorial.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                            <svg className="w-12 h-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        {/* Play overlay */}
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-16 h-16 bg-primary-600/90 rounded-full flex items-center justify-center">
                            <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-2">{tutorial.title}</h3>
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                        {tutorial.category}
                      </span>
                    </div>
                    {tutorial.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
                        {tutorial.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Tutorials;
