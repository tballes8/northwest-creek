import React from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';

const MICDecoder: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* SEO Meta */}
      <title>Decoding MIC Codes — Northwest Creek</title>
      <meta name="description" content="Learn how Market Identifier Codes (MICs) work. Decode the four-letter codes behind every stock exchange — from XNYS to XLON — with this visual guide." />
      <meta property="og:title" content="Decoding MIC Codes — Northwest Creek" />
      <meta property="og:description" content="What those four letters next to a stock listing actually mean — a visual guide to Market Identifier Codes." />
      <link rel="canonical" href="https://northwestcreekllc.com/mic-decoder" />

      {/* Nav */}
      <nav className="bg-gray-800 dark:bg-gray-900 shadow-sm border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <Link to="/" className="flex items-center">
              <img src="/images/logo.png" alt="Northwest Creek LLC" className="h-12 w-12 mr-3" />
              <span className="text-xl font-bold text-primary-400" style={{ fontFamily: "'Viner Hand ITC', 'Caveat', cursive", fontSize: '1.8rem', fontStyle: 'italic' }}>
                Northwest Creek
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

      {/* Hero Header */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-primary-900 dark:from-gray-950 dark:via-gray-900 dark:to-primary-950" />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 20px, currentColor 20px, currentColor 21px)', color: 'white' }} />
        <div className="relative max-w-3xl mx-auto px-6 py-16 md:py-24 text-center">
          <div className="inline-block px-4 py-1.5 rounded-full bg-primary-500/20 text-primary-300 text-xs font-semibold tracking-widest uppercase mb-6">
            Market Structure
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight mb-6" style={{ fontFamily: "'Georgia', serif" }}>
            Decoding MIC Codes: What Those Four Letters Actually Mean
          </h1>
          <p className="text-lg text-gray-300 italic max-w-xl mx-auto">
            There's a logic buried inside every Market Identifier Code — and understanding it changes how you read a stock listing.
          </p>
          <div className="mt-8 text-sm text-primary-300/70 font-medium">
            February 24, 2026 &nbsp;·&nbsp; 8 min read
          </div>
        </div>
      </header>

      {/* Article Content */}
      <article className="max-w-3xl mx-auto px-6 py-12 md:py-16">

        {/* Intro */}
        <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed mb-6">
          If you've spent any time looking at stock listings, you've seen them — four-letter codes like <code className="px-2 py-0.5 bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 rounded font-mono text-sm font-bold">XNYS</code>, <code className="px-2 py-0.5 bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 rounded font-mono text-sm font-bold">XLON</code>, or <code className="px-2 py-0.5 bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 rounded font-mono text-sm font-bold">XASE</code> sitting quietly next to a ticker symbol. These are Market Identifier Codes, or MICs, and they're far more than administrative labels. Each one is a precisely defined identifier that tells you exactly which regulated venue a security calls home.
        </p>
        <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed mb-10">
          Most investors glance past them. But once you understand how MIC codes are structured — and more importantly, what the common assumptions about them get wrong — they become a surprisingly readable shorthand for navigating global markets.
        </p>

        {/* Callout: The Standard */}
        <div className="bg-gray-800 dark:bg-gray-950 rounded-xl p-8 mb-12">
          <div className="text-xs font-semibold tracking-widest uppercase text-primary-400 mb-3">The Standard Behind the Code</div>
          <p className="text-gray-300 leading-relaxed mb-3">
            MICs are defined under <strong className="text-white">ISO 10383</strong>, an international standard maintained by the ISO (International Organization for Standardization) and administered by SWIFT. The standard was first published in 2003 to bring consistency to how trading venues are identified across global financial systems.
          </p>
          <p className="text-gray-300 leading-relaxed">
            The official MIC registry is published and maintained at <strong className="text-white">iso20022.org</strong> and updated regularly as new venues are created, merged, or closed. As of 2026, the registry contains well over 1,000 active MIC codes covering exchanges, multilateral trading facilities, and other regulated venues worldwide.
          </p>
        </div>

        {/* Anatomy Section */}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-14 mb-4 pl-4 border-l-4 border-primary-500">Anatomy of a MIC Code</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-8">
          Every MIC is exactly four uppercase letters. There are no numbers, no punctuation, no lowercase characters. Within those four characters, there is an intended structure — though as we'll see, the real world doesn't always follow the rules neatly.
        </p>

        {/* MIC Anatomy Diagram */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 mb-10 text-center border border-gray-200 dark:border-gray-700">
          <div className="text-xs font-semibold tracking-widest uppercase text-primary-600 dark:text-primary-400 mb-6">MIC Code Structure — Example: XNYS</div>
          <div className="inline-flex rounded-lg overflow-hidden shadow-lg mb-6">
            {[
              { letter: 'X', pos: 'POS 1', bg: 'bg-gray-900' },
              { letter: 'N', pos: 'POS 2', bg: 'bg-gray-700' },
              { letter: 'Y', pos: 'POS 3', bg: 'bg-primary-700' },
              { letter: 'S', pos: 'POS 4', bg: 'bg-primary-500' },
            ].map((c, i) => (
              <div key={i} className={`${c.bg} w-16 h-20 md:w-20 md:h-24 flex flex-col items-center justify-center`}>
                <span className="font-mono text-2xl md:text-4xl font-bold text-white">{c.letter}</span>
                <span className="text-[10px] text-white/50 tracking-wider mt-1">{c.pos}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-0 mb-4">
            {[
              { label: 'Exchange\nPrefix', color: 'bg-gray-900' },
              { label: 'City /\nVenue', color: 'bg-gray-700' },
              { label: 'City /\nVenue', color: 'bg-primary-700' },
              { label: 'Venue /\nSegment', color: 'bg-primary-500' },
            ].map((l, i) => (
              <div key={i} className="w-16 md:w-20 text-center px-1">
                <div className={`w-2 h-2 rounded-full ${l.color} mx-auto mb-1.5`} />
                <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug whitespace-pre-line">{l.label}</div>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
            Positions 2–4 typically abbreviate the city or venue name &nbsp;·&nbsp; <strong className="text-gray-900 dark:text-white">NYS</strong> = New York Stock (Exchange)
          </p>
        </div>

        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-10">
          The four-character structure is intentional but flexible. The ISO standard defines the format, not a rigid formula for every character. In practice, the most reliable geographic signal is almost never the first letter — it's the <strong className="text-gray-900 dark:text-white">middle two or three characters</strong>, which consistently abbreviate the city or venue name across exchanges worldwide.
        </p>

        {/* X Prefix Section */}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-14 mb-4 pl-4 border-l-4 border-primary-500">The "X" Prefix: The Most Misunderstood Pattern</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-8">
          The single most common misconception about MIC codes is that a leading <strong className="text-gray-900 dark:text-white">X</strong> means the exchange is American. It's an understandable assumption — every major U.S. exchange starts with X. But it's wrong, and understanding why reveals something important about how the standard evolved.
        </p>

        {/* Myth/Reality Box */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 mb-10 border border-gray-200 dark:border-gray-700">
          <div className="text-sm font-bold tracking-wider uppercase text-red-500 mb-2">✗ The Myth</div>
          <p className="text-gray-700 dark:text-gray-300 mb-5">"X at the start of a MIC means the exchange is in the United States."</p>
          <div className="text-sm font-bold tracking-wider uppercase text-green-500 mb-2">✓ The Reality</div>
          <p className="text-gray-700 dark:text-gray-300">
            The X prefix was originally reserved for exchanges with <em>no specific country affiliation</em> — international or supranational venues. U.S. exchanges were assigned X codes early in the standard's history, before consistent rules were established, and the convention stuck. But X is equally applied to the London Stock Exchange (<code className="px-1.5 py-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded font-mono text-sm font-bold">XLON</code>), Euronext Paris (<code className="px-1.5 py-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded font-mono text-sm font-bold">XPAR</code>), the Frankfurt Stock Exchange (<code className="px-1.5 py-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded font-mono text-sm font-bold">XFRA</code>), and the Tokyo Stock Exchange (<code className="px-1.5 py-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded font-mono text-sm font-bold">XTKS</code>). None of these are American.
          </p>
        </div>

        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-10">
          In practical terms, the X prefix today simply signals a <strong className="text-gray-900 dark:text-white">major, established, regulated exchange</strong> — a venue that was prominent enough to be assigned a code under the original or early framework of the standard. It is the default prefix for the world's most significant trading venues, regardless of geography.
        </p>

        {/* Prefix Patterns */}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-14 mb-4 pl-4 border-l-4 border-primary-500">Prefix Patterns That Do Hold Up</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-8">
          While X dominates the landscape of major exchanges, newer MIC assignments and smaller regional venues do follow more geographically consistent patterns. Here are the prefix groupings that carry real meaning:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
          {[
            { title: 'The Universal Prefix', prefix: 'X___', desc: 'Major established exchanges globally. No geographic meaning — historical convention only.', tags: ['XNYS','XLON','XPAR','XFRA','XTKS','XHKG'], color: 'border-primary-500', tagBg: 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' },
            { title: 'Oceania / Australia', prefix: 'A___', desc: 'Broadly used for Australian and some Asia-Pacific venues in newer assignments.', tags: ['XASX','APXL','XNEC'], color: 'border-green-500', tagBg: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
            { title: 'Middle East', prefix: 'D___ / E___', desc: 'Several Gulf and Middle Eastern exchanges appear under D and E prefixes in newer codes.', tags: ['DIFX','XDFM','XADS'], color: 'border-amber-500', tagBg: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
            { title: 'MTFs & Alternative Venues', prefix: 'Non-X', desc: 'Multilateral trading facilities and newer alternative venues often receive non-X prefixes reflecting their country of operation more closely.', tags: ['BATE','CHIX','TRQX'], color: 'border-purple-500', tagBg: 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' },
          ].map((card, i) => (
            <div key={i} className={`bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border-t-4 ${card.color} border border-gray-200 dark:border-gray-700`}>
              <h3 className="text-xs font-semibold tracking-wider uppercase text-gray-500 dark:text-gray-400 mb-2">{card.title}</h3>
              <div className="font-mono text-3xl font-bold text-gray-900 dark:text-white mb-2">{card.prefix}</div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{card.desc}</p>
              <div className="flex flex-wrap gap-2">
                {card.tags.map((t) => (
                  <span key={t} className={`font-mono text-xs font-bold px-2.5 py-1 rounded ${card.tagBg}`}>{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Middle Characters */}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-14 mb-4 pl-4 border-l-4 border-primary-500">The Middle Characters: Your Best Geographic Signal</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-8">
          If you want to decode where an exchange is located from its MIC code alone, stop looking at the first letter and focus on positions 2 through 4. This is where the standard consistently encodes geography — almost always as an abbreviation of the exchange's city.
        </p>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 mb-10 border-l-4 border-primary-500 border border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">City Abbreviations in Positions 2–4</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">Across every major global region, the middle characters reliably point to a city. Once you learn the pattern, MIC codes become genuinely readable at a glance.</p>
          <div className="flex flex-wrap gap-3">
            {[
              ['LON', 'London'], ['PAR', 'Paris'], ['FRA', 'Frankfurt'], ['AMS', 'Amsterdam'],
              ['NYS', 'New York'], ['NAS', 'NASDAQ'], ['TKS', 'Tokyo'], ['HKG', 'Hong Kong'],
              ['SHG', 'Shanghai'], ['BSE', 'Bombay'], ['SES', 'Singapore'], ['BUE', 'Buenos Aires'],
            ].map(([code, city]) => (
              <div key={code} className="font-mono text-sm bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-md text-gray-800 dark:text-gray-200">
                X<span className="text-primary-600 dark:text-primary-400 font-bold">{code}</span> → {city}
              </div>
            ))}
          </div>
        </div>

        {/* Segment MICs */}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-14 mb-4 pl-4 border-l-4 border-primary-500">Segment MICs: When One Exchange Has Many Codes</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-8">
          Here is where things get genuinely complex — and where many investors encounter MIC codes without realizing it. Large exchange groups often operate <strong className="text-gray-900 dark:text-white">multiple market segments</strong>, each with its own MIC. The parent exchange receives what's called an <strong className="text-gray-900 dark:text-white">Operating MIC</strong>, and each of its segments or platforms receives a <strong className="text-gray-900 dark:text-white">Segment MIC</strong>.
        </p>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 mb-8 border-l-4 border-green-500 border border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">Operating MIC vs. Segment MIC</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">An <strong>Operating MIC</strong> identifies the legal entity that operates the exchange. A <strong>Segment MIC</strong> identifies a specific market, trading platform, or instrument category within that operator.</p>
          <div className="flex flex-wrap gap-3">
            {[
              ['XLON', 'London Stock Exchange (Operating MIC)'],
              ['XLOM', 'LSE International Order Book (Segment)'],
              ['XNYS', 'NYSE (Operating MIC)'],
              ['XNYE', 'NYSE Equities (Segment)'],
              ['XNAS', 'NASDAQ (Operating MIC)'],
              ['XNGS', 'NASDAQ Global Select (Segment)'],
            ].map(([code, desc]) => (
              <div key={code} className="font-mono text-sm bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 px-3 py-1.5 rounded-md text-gray-800 dark:text-gray-200">
                <span className="text-green-600 dark:text-green-400 font-bold">{code}</span> — {desc}
              </div>
            ))}
          </div>
        </div>

        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-10">
          This is why NASDAQ appears in the MIC registry as both <code className="px-1.5 py-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded font-mono text-sm font-bold">XNAS</code> and <code className="px-1.5 py-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded font-mono text-sm font-bold">XNGS</code> — they're not duplicates. XNAS is the operating entity; XNGS is the specific market tier within it.
        </p>

        {/* Reference Table */}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-14 mb-6 pl-4 border-l-4 border-primary-500">MICs in the Wild: A Decoded Reference</h2>

        <div className="overflow-x-auto rounded-xl shadow-lg mb-12 border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 dark:bg-gray-950 text-white">
                <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase">MIC</th>
                <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase">Decoded</th>
                <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase">Exchange</th>
                <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase hidden md:table-cell">Country</th>
                <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase hidden lg:table-cell">Type</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800">
              {[
                ['XNYS', 'X + NYS (New York Stock)', 'New York Stock Exchange', 'United States', 'Operating MIC'],
                ['XNAS', 'X + NAS (NASDAQ)', 'NASDAQ', 'United States', 'Operating MIC'],
                ['XNGS', 'X + NGS (NASDAQ Global Select)', 'NASDAQ Global Select Market', 'United States', 'Segment MIC'],
                ['XASE', 'X + ASE (American Stock Exchange)', 'NYSE American (AMEX)', 'United States', 'Operating MIC'],
                ['XLON', 'X + LON (London)', 'London Stock Exchange', 'United Kingdom', 'Operating MIC'],
                ['XPAR', 'X + PAR (Paris)', 'Euronext Paris', 'France', 'Operating MIC'],
                ['XFRA', 'X + FRA (Frankfurt)', 'Frankfurt Stock Exchange', 'Germany', 'Operating MIC'],
                ['XAMS', 'X + AMS (Amsterdam)', 'Euronext Amsterdam', 'Netherlands', 'Operating MIC'],
                ['XSWX', 'X + SWX (Swiss Exchange)', 'SIX Swiss Exchange', 'Switzerland', 'Operating MIC'],
                ['XTKS', 'X + TKS (Tokyo Stock)', 'Tokyo Stock Exchange', 'Japan', 'Operating MIC'],
                ['XHKG', 'X + HKG (Hong Kong)', 'Hong Kong Stock Exchange', 'Hong Kong', 'Operating MIC'],
                ['XSHG', 'X + SHG (Shanghai)', 'Shanghai Stock Exchange', 'China', 'Operating MIC'],
                ['XSHE', 'X + SHE (Shenzhen)', 'Shenzhen Stock Exchange', 'China', 'Operating MIC'],
                ['XKRX', 'X + KRX (Korea Exchange)', 'Korea Exchange', 'South Korea', 'Operating MIC'],
                ['XBSE', 'X + BSE (Bombay Stock Exchange)', 'BSE Limited', 'India', 'Operating MIC'],
                ['XNSE', 'X + NSE (National Stock Exchange)', 'National Stock Exchange of India', 'India', 'Operating MIC'],
                ['XASX', 'A + ASX (Australian Securities)', 'ASX', 'Australia', 'Operating MIC'],
                ['XSES', 'X + SES (Singapore Exchange)', 'Singapore Exchange', 'Singapore', 'Operating MIC'],
                ['BVMF', 'B + VMF (B3 / Bovespa)', 'B3 – Brasil Bolsa Balcão', 'Brazil', 'Operating MIC'],
                ['XJSE', 'X + JSE (Johannesburg)', 'JSE Limited', 'South Africa', 'Operating MIC'],
                ['BATE', 'B + ATE (BATS Europe)', 'CBOE Europe (formerly BATS)', 'United Kingdom', 'MTF'],
                ['CHIX', 'CHI + X (Chi-X)', 'Cboe Chi-X Europe', 'United Kingdom', 'MTF'],
              ].map(([mic, decoded, exchange, country, type], i) => (
                <tr key={mic} className={`border-b border-gray-100 dark:border-gray-700 ${i % 2 === 1 ? 'bg-gray-50 dark:bg-gray-750' : ''}`}>
                  <td className="px-4 py-3 font-mono font-bold text-primary-600 dark:text-primary-400">{mic}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{decoded}</td>
                  <td className="px-4 py-3 text-gray-800 dark:text-gray-200">{exchange}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">{country}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      type === 'Segment MIC' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' :
                      type === 'MTF' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
                      'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    }`}>{type}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Myths */}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-14 mb-6 pl-4 border-l-4 border-primary-500">Common Myths, Debunked</h2>

        {[
          { myth: '"X means U.S."', text: 'XLON (London), XPAR (Paris), XFRA (Frankfurt), and XTKS (Tokyo) all start with X. The prefix carries no geographic meaning — it is a historical artifact of how the standard was first applied to major exchanges.' },
          { myth: '"Each exchange has one MIC"', text: 'Large exchange groups can have dozens of MIC codes — one for the operating entity, and additional segment MICs for each distinct market, platform, or product type they operate. NASDAQ alone accounts for several MICs. The London Stock Exchange Group has many more.' },
          { myth: '"MICs and stock exchange names are interchangeable"', text: "A MIC is a precise technical identifier tied to a specific legal entity or market segment registered in the ISO 10383 registry. An exchange's common name may change (AMEX became NYSE MKT, then NYSE American) while its MIC — XASE — remains the same. The MIC is the stable, canonical identifier." },
        ].map((m, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-7 mb-4 border border-gray-200 dark:border-gray-700">
            <div className="text-xs font-bold tracking-wider uppercase text-red-500 mb-2">✗ Myth {i + 1}: {m.myth}</div>
            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{m.text}</p>
          </div>
        ))}

        {/* Warning */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 rounded-r-lg p-6 mt-10 mb-12">
          <p className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed">
            <strong className="text-amber-700 dark:text-amber-400">⚠ The Registry Is a Living Document:</strong> MIC codes are not permanent. Exchanges merge, rebrand, close, or spin off new platforms regularly. The ISO 20022 registry is updated continuously — codes can be added, modified, or marked as expired. When working with historical data, always verify whether a MIC was active at the relevant date.
          </p>
        </div>

        {/* Why It Matters */}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-14 mb-4 pl-4 border-l-4 border-primary-500">Why This Matters Beyond the Trivia</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-6">
          Understanding MIC structure isn't just an academic exercise. In practice, MIC codes appear throughout financial data infrastructure — in trade confirmations, regulatory filings, order routing systems, market data feeds, and portfolio management software. When a brokerage confirms an execution at <code className="px-1.5 py-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded font-mono text-sm font-bold">XNGS</code> rather than <code className="px-1.5 py-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded font-mono text-sm font-bold">XNAS</code>, that distinction carries real meaning about which market tier and ruleset governed the trade.
        </p>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-12">
          For investors building their own tools or interpreting raw market data, the ability to parse a MIC code — to know that <code className="px-1.5 py-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded font-mono text-sm font-bold">XHKG</code> is Hong Kong, that <code className="px-1.5 py-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded font-mono text-sm font-bold">BVMF</code> is Brazil, that <code className="px-1.5 py-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded font-mono text-sm font-bold">CHIX</code> is a European alternative trading venue — transforms an opaque string into a readable signal.
        </p>

        {/* Glossary */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 mb-12 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">MIC Glossary</h2>
          {[
            ['ISO 10383', 'The international standard that defines Market Identifier Codes. Maintained by the ISO and administered by SWIFT. First published in 2003, it is updated regularly as new trading venues are created or existing ones are modified or closed.'],
            ['Operating MIC', 'The MIC assigned to the legal entity that operates a trading venue. This is the top-level identifier for an exchange or trading platform. All segment MICs associated with that venue reference the operating MIC as their parent.'],
            ['Segment MIC', 'A MIC assigned to a specific market, trading platform, instrument category, or tier within a larger exchange group. Segment MICs always reference a parent Operating MIC. For example, XNGS (NASDAQ Global Select) is a segment MIC under the XNAS operating MIC.'],
            ['MTF (Multilateral Trading Facility)', 'A European regulatory classification for an alternative trading venue that matches buyers and sellers of financial instruments, similar to a traditional exchange but under a different regulatory regime. MTFs receive their own MIC codes and often use non-X prefixes.'],
            ['ATS (Alternative Trading System)', 'The U.S. equivalent of an MTF — a non-exchange trading venue registered with the SEC that matches orders for securities. Dark pools are a type of ATS. Some ATSs have MIC codes; others operate without one.'],
            ['ISO 3166-1 Alpha-2', 'The international standard for two-letter country codes (US, GB, DE, JP, etc.) that loosely inspired parts of the MIC naming convention, particularly for newer assignments. However, MICs do not strictly follow country codes in their structure.'],
          ].map(([name, desc], i, arr) => (
            <div key={name} className={`${i < arr.length - 1 ? 'mb-5 pb-5 border-b border-gray-100 dark:border-gray-700' : ''}`}>
              <div className="text-sm font-bold text-primary-600 dark:text-primary-400">{name}</div>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mt-1">{desc}</p>
            </div>
          ))}
        </div>

        {/* Key Takeaway */}
        <div className="bg-gray-800 dark:bg-gray-950 rounded-xl p-8 mb-6">
          <div className="text-xs font-semibold tracking-widest uppercase text-primary-400 mb-3">Key Takeaway</div>
          <p className="text-gray-300 leading-relaxed mb-4">
            Four letters. Enormous precision. MIC codes are the quiet infrastructure of global markets — and once you understand their structure, they stop being noise and start being information. The leading X tells you almost nothing about geography. The middle characters tell you almost everything. And the difference between an Operating MIC and a Segment MIC tells you exactly how granular the data you're reading actually is.
          </p>
          <p className="text-gray-400 text-sm">
            For the complete, authoritative registry of all active MIC codes, visit <strong className="text-white">iso20022.org</strong> — the official source, updated continuously.
          </p>
        </div>

        {/* Disclaimer */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-8 mb-4">
          This article is for informational purposes only and does not constitute financial advice. MIC code information is based on the ISO 10383 standard. Always refer to the official ISO 20022 registry for current and authoritative MIC data.
        </p>

      </article>

      {/* Footer */}
      <footer className="bg-forest-800 dark:bg-gray-950 text-gray-300 dark:text-gray-400 py-12 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-4 md:mb-0">
              <img src="/images/logo.png" alt="Northwest Creek LLC" className="h-12 w-12 mr-3" />
              <div>
                <p className="text-xl font-bold text-white">Northwest Creek</p>
                <p className="text-sm">Professional stock analysis for retail investors</p>
              </div>
            </div>
            <div className="text-center md:text-right">
              <p className="text-sm">© 2026 Northwest Creek LLC. All rights reserved.</p>
              <p className="text-sm mt-1">Post Falls, Idaho</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MICDecoder;