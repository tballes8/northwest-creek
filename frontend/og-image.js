/**
 * Dynamic Open Graph card renderer for the NWC-Analytics frontend.
 *
 * satori (flexbox + text layout -> SVG) + @resvg/resvg-js (SVG -> PNG). Pure
 * JS/wasm/native — no headless browser, works on Railway. server.js owns the
 * HTTP routing, caching, and fail-soft fallbacks; this module only builds the
 * 1200x630 card and returns a PNG Buffer.
 *
 * Fonts are bundled TTFs under ./fonts (OFL-licensed lookalikes for the site's
 * proprietary Georgia): PT Serif for titles, Inter for supporting text. Never
 * fetched at runtime.
 */
const fs = require('fs');
const path = require('path');

const WIDTH = 1200;
const HEIGHT = 630;

// Brand tokens (match the blog header gradient + accent).
const BG_FROM = '#1a2a3a';
const BG_TO = '#2c4a6e';
const ACCENT = '#2c7be5';
const TITLE_COLOR = '#ffffff';
const EXCERPT_COLOR = '#c0d8e8';
const FOOTER_COLOR = '#9fb4c7';

// ── Fonts (loaded once; failure is non-fatal — server.js falls back) ─────────
const FONT_DIR = path.join(__dirname, 'fonts');
let FONTS = [];
let fontsReady = false;
try {
  FONTS = [
    { name: 'PT Serif', file: 'PTSerif-Regular.ttf', weight: 400, style: 'normal' },
    { name: 'PT Serif', file: 'PTSerif-Bold.ttf', weight: 700, style: 'normal' },
    { name: 'Inter', file: 'Inter-Regular.ttf', weight: 400, style: 'normal' },
    { name: 'Inter', file: 'Inter-Bold.ttf', weight: 700, style: 'normal' },
  ].map((f) => ({
    name: f.name,
    data: fs.readFileSync(path.join(FONT_DIR, f.file)),
    weight: f.weight,
    style: f.style,
  }));
  fontsReady = true;
} catch (err) {
  console.error(`[og-image] font load failed (${err.message}) — OG cards will fall back to the logo`);
}

// ── Logo (embedded as a data URI; optional) ──────────────────────────────────
// Read from the build output (public/ is copied to build/ at build time).
let LOGO_DATA_URI = null;
try {
  const logoBuf = fs.readFileSync(path.join(__dirname, 'build', 'images', 'logo.png'));
  LOGO_DATA_URI = `data:image/png;base64,${logoBuf.toString('base64')}`;
} catch (err) {
  console.warn(`[og-image] logo not found (${err.message}) — cards will render without it`);
}

// ── satori / resvg lazy loader (satori ships ESM; require() would throw) ─────
let _deps = null;
async function loadDeps() {
  if (!_deps) {
    const satoriMod = await import('satori');
    const satori = satoriMod.default || satoriMod.satori || satoriMod;
    const { Resvg } = require('@resvg/resvg-js');
    _deps = { satori, Resvg };
  }
  return _deps;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Char-budget truncation so satori never lays out an absurd string. Visual
 *  line-limiting is done with -webkit-line-clamp; this is just a safety cap. */
function truncateChars(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const slice = s.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > 0 ? slice.slice(0, lastSpace) : slice)}…`;
}

/** Multi-line clamp style block (satori-supported subset). */
function clamp(lines) {
  return {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: lines,
    overflow: 'hidden',
  };
}

const accentBar = { type: 'div', props: { style: { width: '100%', height: '8px', backgroundColor: ACCENT } } };

// ── Seeded sparkline motif (deterministic per slug; no Math.random) ──────────

/** FNV-1a hash of a string -> uint32. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG -> function yielding floats in [0, 1). */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A faint, upward-trending price-chart motif seeded by `seed` (the slug), so a
 * given post always renders the same card (cache/CDN-safe). Returned as an
 * absolutely-positioned inline <svg> that sits BEHIND the content layer (see
 * shell()'s z-index wrapper). Spans full width across the ~45%–85% height band.
 */
function buildSparkline(seed, width, height) {
  const rand = mulberry32(fnv1a(seed || 'default'));
  const N = 16;
  const pad = 14;
  const top = height * 0.45 + pad;
  const bottom = height * 0.85 - pad;
  const jitter = (bottom - top) * 0.3;

  const pts = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const x = t * width;
    const trendY = bottom - t * (bottom - top); // linear rise (y grows downward)
    const y = Math.max(top, Math.min(bottom, trendY + (rand() - 0.5) * 2 * jitter));
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;

  return {
    type: 'svg',
    props: {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      style: { position: 'absolute', top: 0, left: 0 },
      children: [
        {
          type: 'defs',
          props: {
            children: {
              type: 'linearGradient',
              props: {
                id: 'spark',
                x1: 0, y1: top, x2: 0, y2: height,
                gradientUnits: 'userSpaceOnUse',
                children: [
                  { type: 'stop', props: { offset: '0%', stopColor: ACCENT, stopOpacity: 0.06 } },
                  { type: 'stop', props: { offset: '100%', stopColor: ACCENT, stopOpacity: 0 } },
                ],
              },
            },
          },
        },
        { type: 'path', props: { d: area, fill: 'url(#spark)' } },
        {
          type: 'path',
          props: {
            d: line,
            fill: 'none',
            stroke: ACCENT,
            strokeOpacity: 0.1,
            strokeWidth: 3,
            strokeLinejoin: 'round',
            strokeLinecap: 'round',
          },
        },
      ],
    },
  };
}

function shell(children, seed) {
  return {
    type: 'div',
    props: {
      style: {
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: BG_FROM,
        backgroundImage: `linear-gradient(135deg, ${BG_FROM} 0%, ${BG_TO} 100%)`,
        color: TITLE_COLOR,
        fontFamily: 'Inter',
      },
      // Layering: satori has no z-index, so paint order = tree order. The
      // sparkline is the first child (painted first, behind); the content
      // wrapper follows and paints on top — keeping the footer/logo legible.
      children: [
        buildSparkline(seed, WIDTH, HEIGHT),
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              height: '100%',
            },
            children: [accentBar, ...children],
          },
        },
      ],
    },
  };
}

function footerRow() {
  const left = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'row', alignItems: 'center' },
      children: [
        ...(LOGO_DATA_URI
          ? [{ type: 'img', props: { src: LOGO_DATA_URI, width: 56, height: 56, style: { borderRadius: '8px' } } }]
          : []),
        {
          type: 'div',
          props: {
            style: {
              marginLeft: LOGO_DATA_URI ? '18px' : '0',
              fontFamily: 'Inter',
              fontWeight: 700,
              fontSize: '30px',
              color: TITLE_COLOR,
            },
            children: 'NWC-Analytics',
          },
        },
      ],
    },
  };
  const right = {
    type: 'div',
    props: {
      style: { fontFamily: 'Inter', fontWeight: 400, fontSize: '26px', color: FOOTER_COLOR },
      children: 'nwc-analytics.com',
    },
  };
  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
      children: [left, right],
    },
  };
}

function postCard({ title, excerpt, seed }) {
  const safeTitle = truncateChars(title, 110);
  const safeExcerpt = excerpt ? truncateChars(excerpt, 170) : '';
  // Scale the title down for long headlines so 3 lines always fit above the footer.
  const titleSize = safeTitle.length > 90 ? 46 : safeTitle.length > 55 ? 54 : 62;

  const textGroup = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column' },
      children: [
        {
          type: 'div',
          props: {
            style: {
              fontFamily: 'PT Serif',
              fontWeight: 700,
              fontSize: `${titleSize}px`,
              lineHeight: 1.15,
              color: TITLE_COLOR,
              ...clamp(3),
            },
            children: safeTitle,
          },
        },
        ...(safeExcerpt
          ? [{
              type: 'div',
              props: {
                style: {
                  marginTop: '26px',
                  fontFamily: 'Inter',
                  fontWeight: 400,
                  fontSize: '27px',
                  lineHeight: 1.4,
                  color: EXCERPT_COLOR,
                  ...clamp(2),
                },
                children: safeExcerpt,
              },
            }]
          : []),
      ],
    },
  };

  const content = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexGrow: 1,
        padding: '68px 72px',
      },
      children: [textGroup, footerRow()],
    },
  };

  return shell([content], seed);
}

function defaultCardTree() {
  const content = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px',
        textAlign: 'center',
      },
      children: [
        ...(LOGO_DATA_URI
          ? [{ type: 'img', props: { src: LOGO_DATA_URI, width: 108, height: 108, style: { borderRadius: '16px' } } }]
          : []),
        {
          type: 'div',
          props: {
            style: { marginTop: '28px', fontFamily: 'PT Serif', fontWeight: 700, fontSize: '68px', color: TITLE_COLOR },
            children: 'NWC-Analytics',
          },
        },
        {
          type: 'div',
          props: {
            style: { marginTop: '18px', fontFamily: 'Inter', fontWeight: 400, fontSize: '30px', color: EXCERPT_COLOR },
            children: 'Professional tools at individual prices.',
          },
        },
        {
          type: 'div',
          props: {
            style: { marginTop: '44px', fontFamily: 'Inter', fontWeight: 400, fontSize: '24px', color: FOOTER_COLOR },
            children: 'nwc-analytics.com',
          },
        },
      ],
    },
  };
  return shell([content], 'default');
}

// ── Render ───────────────────────────────────────────────────────────────────
async function renderTree(tree) {
  if (!fontsReady) throw new Error('OG fonts not loaded');
  const { satori, Resvg } = await loadDeps();
  const svg = await satori(tree, { width: WIDTH, height: HEIGHT, fonts: FONTS });
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
    font: { loadSystemFonts: false }, // satori already outlines text; no system fonts needed
  });
  return resvg.render().asPng();
}

/** Render the branded card for a blog post. Returns a PNG Buffer. */
function renderPostCard(post) {
  return renderTree(postCard({
    title: post.title || 'NWC-Analytics',
    excerpt: post.excerpt || '',
    seed: post.slug || 'default',
  }));
}

/** Render the site-default card (homepage / non-blog routes). Returns a PNG Buffer. */
function renderDefaultCard() {
  return renderTree(defaultCardTree());
}

module.exports = { renderPostCard, renderDefaultCard };
