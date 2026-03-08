import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const REGIONS = ["All Regions", "Americas", "Europe", "Asia-Pacific", "Middle East & Africa"];
const PER_PAGE = 25;

interface MICEntry {
  mic: string;
  name: string;
  country: string;
  city: string;
  region: string;
  type: string;
  notes: string;
}

const typeColor = (t: string) => {
  if (!t) return { bg: 'bg-primary-50 dark:bg-primary-900/30', text: 'text-primary-700 dark:text-primary-300' };
  if (t.includes('Stock')) return { bg: 'bg-primary-50 dark:bg-primary-900/30', text: 'text-primary-700 dark:text-primary-300' };
  if (t.includes('Deriv')) return { bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' };
  if (t.includes('MTF') || t.includes('ATS')) return { bg: 'bg-green-50 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300' };
  if (t.includes('OTC')) return { bg: 'bg-purple-50 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' };
  return { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400' };
};

const regionDot = (r: string) => {
  if (r === 'Americas') return 'text-primary-600 dark:text-primary-400';
  if (r === 'Europe') return 'text-green-600 dark:text-green-400';
  if (r === 'Asia-Pacific') return 'text-amber-600 dark:text-amber-400';
  if (r === 'Middle East & Africa') return 'text-purple-600 dark:text-purple-400';
  return 'text-gray-500';
};

const MICDecoder: React.FC = () => {
  const [mics, setMics] = useState<MICEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('All Regions');
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchMICs();
  }, []);

  async function fetchMICs() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: 8000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{
            role: 'user',
            content: `Search for a comprehensive list of ISO 10383 Market Identifier Codes (MICs) for stock exchanges and trading venues worldwide. Include as many as possible across all regions. Return ONLY a JSON array (no markdown, no explanation) where each object has these fields:
- mic: the 4-letter MIC code
- name: full name of the exchange or venue
- country: country name
- city: city
- region: one of "Americas", "Europe", "Asia-Pacific", or "Middle East & Africa"
- type: one of "Stock Exchange", "Derivatives Exchange", "MTF/ATS", "OTC", or "Other"
- notes: one short sentence describing it (or empty string)

Include major exchanges from: US, Canada, UK, Germany, France, Netherlands, Switzerland, Italy, Spain, Japan, China, Hong Kong, South Korea, India, Australia, Singapore, Brazil, Mexico, South Africa, Saudi Arabia, UAE, and others. Aim for 120+ entries. Return ONLY the raw JSON array.`
          }]
        })
      });
      const data = await res.json();
      const text = data.content.map((b: any) => b.text || '').join('');
      const clean = text.replace(/```json|```/g, '').trim();
      const start = clean.indexOf('[');
      const end = clean.lastIndexOf(']');
      if (start === -1 || end === -1) throw new Error('No valid JSON array found in response');
      const parsed: MICEntry[] = JSON.parse(clean.slice(start, end + 1));
      setMics(parsed);
    } catch (e: any) {
      setError('Failed to load MIC data. ' + (e.message || ''));
    }
    setLoading(false);
  }

  const filtered = mics.filter(m => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      m.mic?.toLowerCase().includes(q) ||
      m.name?.toLowerCase().includes(q) ||
      m.country?.toLowerCase().includes(q) ||
      m.city?.toLowerCase().includes(q);
    const matchRegion = region === 'All Regions' || m.region === region;
    return matchSearch && matchRegion;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const TYPE_LABELS = ['Stock Exchange', 'Derivatives Exchange', 'MTF/ATS', 'OTC', 'Other'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* SEO */}
      <title>MIC Code Lookup — NWC-Analytics</title>
      <meta name="description" content="Search and explore ISO 10383 Market Identifier Codes (MICs) for stock exchanges and trading venues worldwide." />
      <meta property="og:title" content="MIC Code Lookup — Northwest Creek" />
      <link rel="canonical" href="https://northwestcreekllc.com/mic-decoder" />

      {/* Nav */}
      <nav className="bg-gray-800 dark:bg-gray-900 shadow-sm border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <Link to="/" className="flex items-center">
              <img src="/images/logo.png" alt="NWC-Analytics LLC" className="h-12 w-12 mr-3" />
              <span className="text-xl font-bold text-primary-400" style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}>
                NWC-Analytics
              </span>
            </Link>
            <div className="flex items-center space-x-4">
              <Link to="/login" className="text-gray-300 hover:text-primary-400 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                Sign In
              </Link>
              <Link to="/pricing" className="bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm">
                Get Started
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-primary-900 dark:from-gray-950 dark:via-gray-900 dark:to-primary-950" />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 20px, currentColor 20px, currentColor 21px)', color: 'white' }} />
        <div className="relative max-w-3xl mx-auto px-6 py-14 md:py-20 text-center">
          <div className="inline-block px-4 py-1.5 rounded-full bg-primary-500/20 text-primary-300 text-xs font-semibold tracking-widest uppercase mb-5">
            ISO 10383
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight mb-5" style={{ fontFamily: "'Georgia', serif" }}>
            Market Identifier Codes (MICs)
          </h1>
          <p className="text-lg text-gray-300 italic max-w-lg mx-auto">
            A searchable directory of global exchange and trading venue MIC codes
          </p>
          {!loading && mics.length > 0 && (
            <div className="mt-6 text-sm text-primary-300/70 font-medium">{mics.length} venues loaded</div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 md:py-12">

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            placeholder="Search by MIC, name, country, or city..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 min-w-0 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <select
            value={region}
            onChange={e => { setRegion(e.target.value); setPage(1); }}
            className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TYPE_LABELS.map(t => {
            const c = typeColor(t);
            return (
              <span key={t} className={`${c.bg} ${c.text} text-xs font-bold px-3 py-1 rounded-full`}>{t}</span>
            );
          })}
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 dark:border-primary-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400 text-base">Fetching MIC data from live sources…</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">This may take a few seconds</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 rounded-r-lg p-5 mb-6 flex items-center justify-between flex-wrap gap-3">
            <span className="text-amber-800 dark:text-amber-300 text-sm font-medium">⚠ {error}</span>
            <button
              onClick={fetchMICs}
              className="px-4 py-1.5 rounded-md bg-gray-800 dark:bg-gray-700 text-white text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Results */}
        {!loading && !error && (
          <>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Showing {paginated.length} of {filtered.length} results
              {(search || region !== 'All Regions') ? ` (filtered from ${mics.length})` : ''}
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-800 dark:bg-gray-950">
                      <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-white">MIC</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-white">Exchange / Venue</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-white">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-white">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase text-white min-w-[160px] hidden lg:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((m, i) => {
                      const tc = typeColor(m.type);
                      const rc = regionDot(m.region);
                      return (
                        <tr
                          key={m.mic + i}
                          className={`border-b border-gray-100 dark:border-gray-700 ${i % 2 === 1 ? 'bg-gray-50 dark:bg-gray-750' : 'bg-white dark:bg-gray-800'} hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors`}
                        >
                          <td className="px-4 py-3">
                            <span className="font-mono font-bold text-primary-600 dark:text-primary-400 text-base">{m.mic}</span>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white leading-snug">{m.name}</td>
                          <td className="px-4 py-3 leading-snug">
                            <div className="text-gray-700 dark:text-gray-300">{m.city}</div>
                            <div className="text-xs text-gray-400 dark:text-gray-500">{m.country}</div>
                            <div className="mt-0.5">
                              <span className={`text-[11px] font-bold ${rc}`}>● {m.region}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`${tc.bg} ${tc.text} text-xs font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap`}>{m.type}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs leading-relaxed hidden lg:table-cell">{m.notes}</td>
                        </tr>
                      );
                    })}
                    {paginated.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">
                          No matching MIC codes found. Try adjusting your search or region filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-3 mt-6">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    page === 1
                      ? 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-default'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer'
                  }`}
                >
                  ← Prev
                </button>
                <span className="text-sm text-gray-600 dark:text-gray-400">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    page === totalPages
                      ? 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-default'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer'
                  }`}
                >
                  Next →
                </button>
              </div>
            )}

            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-10">
              Data sourced from ISO 10383. For the official complete registry, visit iso20022.org.
            </p>
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-forest-800 dark:bg-gray-950 text-gray-300 dark:text-gray-400 py-12 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-4 md:mb-0">
              <img src="/images/logo.png" alt="NWC-Analytics LLC" className="h-12 w-12 mr-3" />
              <div>
                <p className="text-xl font-bold text-white">NWC-Analytics</p>
                <p className="text-sm">Professional stock analysis for retail investors</p>
              </div>
            </div>
            <div className="text-center md:text-right">
              <p className="text-sm">© 2026 NWC-Analytics LLC. All rights reserved.</p>
              <p className="text-sm mt-1">Post Falls, Idaho</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MICDecoder;