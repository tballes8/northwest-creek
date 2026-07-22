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

function shell(children) {
  return {
    type: 'div',
    props: {
      style: {
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: BG_FROM,
        backgroundImage: `linear-gradient(135deg, ${BG_FROM} 0%, ${BG_TO} 100%)`,
        color: TITLE_COLOR,
        fontFamily: 'Inter',
      },
      children: [accentBar, ...children],
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

function postCard({ title, excerpt }) {
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

  return shell([content]);
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
  return shell([content]);
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
  return renderTree(postCard({ title: post.title || 'NWC-Analytics', excerpt: post.excerpt || '' }));
}

/** Render the site-default card (homepage / non-blog routes). Returns a PNG Buffer. */
function renderDefaultCard() {
  return renderTree(defaultCardTree());
}

module.exports = { renderPostCard, renderDefaultCard };
