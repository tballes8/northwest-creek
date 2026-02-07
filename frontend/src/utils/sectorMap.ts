/**
 * Stock Sector Mapping Utility
 * ~500 common US stocks mapped to yfinance sector names
 * 
 * Two-layer approach:
 *   1. Static map — instant lookup for known tickers
 *   2. Dynamic fetch — calls backend getCompany() for unknowns,
 *      caching results so each ticker is only fetched once per session.
 *
 * To regenerate with the latest data, run:
 *   python generate_sector_map.py
 */
import { stocksAPI } from '../services/api';

// ─── Sector color palette ───────────────────────────────────────────────
export const SECTOR_COLORS: Record<string, string> = {
  'Technology':             '#3B82F6', // blue-500
  'Healthcare':             '#10B981', // emerald-500
  'Financial Services':     '#F59E0B', // amber-500
  'Consumer Cyclical':      '#EC4899', // pink-500
  'Communication Services': '#8B5CF6', // violet-500
  'Industrials':            '#F97316', // orange-500
  'Consumer Defensive':     '#06B6D4', // cyan-500
  'Energy':                 '#EF4444', // red-500
  'Real Estate':            '#84CC16', // lime-500
  'Utilities':              '#6366F1', // indigo-500
  'Basic Materials':        '#14B8A6', // teal-500
  'Other':                  '#6B7280', // gray-500
};

// ─── Static sector map ──────────────────────────────────────────────────
const TICKER_SECTOR_MAP: Record<string, string> = {
  // ── Technology (120+) ─────────────────────────────────────────────────
  AAPL: 'Technology', MSFT: 'Technology', NVDA: 'Technology', GOOG: 'Technology',
  GOOGL: 'Technology', META: 'Technology', AVGO: 'Technology', ORCL: 'Technology',
  CSCO: 'Technology', CRM: 'Technology', AMD: 'Technology', ADBE: 'Technology',
  ACN: 'Technology', INTC: 'Technology', IBM: 'Technology', TXN: 'Technology',
  QCOM: 'Technology', INTU: 'Technology', AMAT: 'Technology', NOW: 'Technology',
  PANW: 'Technology', MU: 'Technology', LRCX: 'Technology', ADI: 'Technology',
  KLAC: 'Technology', SNPS: 'Technology', CDNS: 'Technology', MRVL: 'Technology',
  CRWD: 'Technology', FTNT: 'Technology', DELL: 'Technology', HPQ: 'Technology',
  HPE: 'Technology', PLTR: 'Technology', NET: 'Technology', DDOG: 'Technology',
  ZS: 'Technology', SNOW: 'Technology', WDAY: 'Technology', TEAM: 'Technology',
  SHOP: 'Technology', SQ: 'Technology', MELI: 'Technology', SE: 'Technology',
  UBER: 'Technology', ABNB: 'Technology', DASH: 'Technology',
  ROKU: 'Technology', U: 'Technology', PATH: 'Technology', MDB: 'Technology',
  OKTA: 'Technology', HUBS: 'Technology', DOCU: 'Technology', ZM: 'Technology',
  ARM: 'Technology', SMCI: 'Technology', TSM: 'Technology', ASML: 'Technology',
  SAP: 'Technology', BABA: 'Technology', JD: 'Technology',
  PDD: 'Technology', BIDU: 'Technology', NTES: 'Technology',
  ADSK: 'Technology', ANSS: 'Technology', MPWR: 'Technology', ON: 'Technology',
  NXPI: 'Technology', SWKS: 'Technology', QRVO: 'Technology', MCHP: 'Technology',
  KEYS: 'Technology', TER: 'Technology', ZBRA: 'Technology', TRMB: 'Technology',
  GEN: 'Technology', BSY: 'Technology', EPAM: 'Technology', GDDY: 'Technology',
  GRAB: 'Technology', FIVN: 'Technology', ESTC: 'Technology', CFLT: 'Technology',
  BILL: 'Technology', PCOR: 'Technology', IOT: 'Technology', GTLB: 'Technology',
  APP: 'Technology', ASAN: 'Technology', DUOL: 'Technology', CWAN: 'Technology',
  SOUN: 'Technology', IONQ: 'Technology', RGTI: 'Technology', QUBT: 'Technology',
  BBAI: 'Technology', AI: 'Technology', BIGC: 'Technology', FOUR: 'Technology',
  ANET: 'Technology', FFIV: 'Technology', JNPR: 'Technology', AKAM: 'Technology',
  STX: 'Technology', WDC: 'Technology', NTAP: 'Technology', PSTG: 'Technology',
  VRT: 'Technology', GEV: 'Technology', CRDO: 'Technology',
  ENPH: 'Technology', SEDG: 'Technology', FSLR: 'Technology',
  SMMT: 'Technology', LYFT: 'Technology', PINS: 'Technology',
  TWLO: 'Technology', ZI: 'Technology', MNDY: 'Technology',
  RBRK: 'Technology', S: 'Technology', TENB: 'Technology', VRNS: 'Technology',
  RPD: 'Technology', CYBR: 'Technology', QLYS: 'Technology',

  // ── Healthcare (80+) ──────────────────────────────────────────────────
  UNH: 'Healthcare', JNJ: 'Healthcare', LLY: 'Healthcare', ABBV: 'Healthcare',
  MRK: 'Healthcare', TMO: 'Healthcare', ABT: 'Healthcare', PFE: 'Healthcare',
  DHR: 'Healthcare', AMGN: 'Healthcare', BMY: 'Healthcare', MDT: 'Healthcare',
  GILD: 'Healthcare', ISRG: 'Healthcare', VRTX: 'Healthcare', SYK: 'Healthcare',
  BSX: 'Healthcare', REGN: 'Healthcare', ZTS: 'Healthcare', ELV: 'Healthcare',
  HCA: 'Healthcare', CI: 'Healthcare', MCK: 'Healthcare', CVS: 'Healthcare',
  MRNA: 'Healthcare', BIIB: 'Healthcare', ILMN: 'Healthcare', DXCM: 'Healthcare',
  IDXX: 'Healthcare', A: 'Healthcare', IQV: 'Healthcare', EW: 'Healthcare',
  HUM: 'Healthcare', CNC: 'Healthcare', BAX: 'Healthcare', BDX: 'Healthcare',
  GEHC: 'Healthcare', ALGN: 'Healthcare', RMD: 'Healthcare', HOLX: 'Healthcare',
  VEEV: 'Healthcare', PODD: 'Healthcare', INCY: 'Healthcare', EXAS: 'Healthcare',
  TFX: 'Healthcare', HSIC: 'Healthcare', OGN: 'Healthcare', VTRS: 'Healthcare',
  XRAY: 'Healthcare', TECH: 'Healthcare', JAZZ: 'Healthcare', NBIX: 'Healthcare',
  GTBP: 'Healthcare', HIMS: 'Healthcare', NUVB: 'Healthcare', RXRX: 'Healthcare',
  SANA: 'Healthcare', SRRK: 'Healthcare', CRSP: 'Healthcare', NTLA: 'Healthcare',
  BEAM: 'Healthcare', EDIT: 'Healthcare', RARE: 'Healthcare',
  WAT: 'Healthcare', MTD: 'Healthcare', PKI: 'Healthcare', CRL: 'Healthcare',
  DGX: 'Healthcare', LH: 'Healthcare', RVMD: 'Healthcare', PCVX: 'Healthcare',
  INSM: 'Healthcare', SRPT: 'Healthcare', ALNY: 'Healthcare', BMRN: 'Healthcare',
  UTHR: 'Healthcare', EXEL: 'Healthcare', MEDP: 'Healthcare', ICLR: 'Healthcare',
  MOH: 'Healthcare', CAH: 'Healthcare', COR: 'Healthcare',

  // ── Financial Services (80+) ──────────────────────────────────────────
  'BRK.B': 'Financial Services', 'BRK.A': 'Financial Services',
  JPM: 'Financial Services', V: 'Financial Services', MA: 'Financial Services',
  BAC: 'Financial Services', WFC: 'Financial Services', GS: 'Financial Services',
  MS: 'Financial Services', SPGI: 'Financial Services', BLK: 'Financial Services',
  C: 'Financial Services', AXP: 'Financial Services', SCHW: 'Financial Services',
  CB: 'Financial Services', PGR: 'Financial Services', MMC: 'Financial Services',
  ICE: 'Financial Services', CME: 'Financial Services', AON: 'Financial Services',
  USB: 'Financial Services', PNC: 'Financial Services', TFC: 'Financial Services',
  AIG: 'Financial Services', MET: 'Financial Services', PRU: 'Financial Services',
  AFL: 'Financial Services', ALL: 'Financial Services', PYPL: 'Financial Services',
  FIS: 'Financial Services', FISV: 'Financial Services', COF: 'Financial Services',
  DFS: 'Financial Services', SYF: 'Financial Services', BK: 'Financial Services',
  STT: 'Financial Services', NTRS: 'Financial Services', CFG: 'Financial Services',
  RF: 'Financial Services', HBAN: 'Financial Services', KEY: 'Financial Services',
  FITB: 'Financial Services', MTB: 'Financial Services', ZION: 'Financial Services',
  WAL: 'Financial Services', ALLY: 'Financial Services',
  SOFI: 'Financial Services', HOOD: 'Financial Services',
  MARA: 'Financial Services', RIOT: 'Financial Services', HUT: 'Financial Services',
  OXLC: 'Financial Services', AGNC: 'Financial Services', NLY: 'Financial Services',
  ARCC: 'Financial Services', MAIN: 'Financial Services', TPVG: 'Financial Services',
  GLAD: 'Financial Services', PSEC: 'Financial Services', HTGC: 'Financial Services',
  NDAQ: 'Financial Services', CBOE: 'Financial Services', COIN: 'Financial Services',
  TROW: 'Financial Services', BEN: 'Financial Services', IVZ: 'Financial Services',
  CINF: 'Financial Services', L: 'Financial Services', RE: 'Financial Services',
  RJF: 'Financial Services', LPLA: 'Financial Services', SEIC: 'Financial Services',
  EWBC: 'Financial Services', FNB: 'Financial Services', CMA: 'Financial Services',
  WBS: 'Financial Services', FCNCA: 'Financial Services', SNV: 'Financial Services',
  MKTX: 'Financial Services', MSCI: 'Financial Services', FDS: 'Financial Services',

  // ── Consumer Cyclical (70+) ───────────────────────────────────────────
  AMZN: 'Consumer Cyclical', TSLA: 'Consumer Cyclical', HD: 'Consumer Cyclical',
  NKE: 'Consumer Cyclical', MCD: 'Consumer Cyclical', SBUX: 'Consumer Cyclical',
  LOW: 'Consumer Cyclical', TJX: 'Consumer Cyclical', BKNG: 'Consumer Cyclical',
  MAR: 'Consumer Cyclical', GM: 'Consumer Cyclical', F: 'Consumer Cyclical',
  ORLY: 'Consumer Cyclical', AZO: 'Consumer Cyclical', ROST: 'Consumer Cyclical',
  DHI: 'Consumer Cyclical', LEN: 'Consumer Cyclical', PHM: 'Consumer Cyclical',
  CMG: 'Consumer Cyclical', YUM: 'Consumer Cyclical', DPZ: 'Consumer Cyclical',
  LULU: 'Consumer Cyclical', RCL: 'Consumer Cyclical', CCL: 'Consumer Cyclical',
  EBAY: 'Consumer Cyclical', ETSY: 'Consumer Cyclical', W: 'Consumer Cyclical',
  BBY: 'Consumer Cyclical', DG: 'Consumer Cyclical', DLTR: 'Consumer Cyclical',
  RIVN: 'Consumer Cyclical', LCID: 'Consumer Cyclical', NIO: 'Consumer Cyclical',
  CAVA: 'Consumer Cyclical', WING: 'Consumer Cyclical', SHAK: 'Consumer Cyclical',
  WYNN: 'Consumer Cyclical', LVS: 'Consumer Cyclical', MGM: 'Consumer Cyclical',
  POOL: 'Consumer Cyclical', DECK: 'Consumer Cyclical', BIRK: 'Consumer Cyclical',
  TPR: 'Consumer Cyclical', RL: 'Consumer Cyclical', CPRI: 'Consumer Cyclical',
  HAS: 'Consumer Cyclical', MAT: 'Consumer Cyclical', PENN: 'Consumer Cyclical',
  DKNG: 'Consumer Cyclical', EXPE: 'Consumer Cyclical',
  NCLH: 'Consumer Cyclical', QXO: 'Consumer Cyclical', GPC: 'Consumer Cyclical',
  KMX: 'Consumer Cyclical', AN: 'Consumer Cyclical', LAD: 'Consumer Cyclical',
  TOL: 'Consumer Cyclical', NVR: 'Consumer Cyclical', MTH: 'Consumer Cyclical',
  KBH: 'Consumer Cyclical', GRMN: 'Consumer Cyclical', LEG: 'Consumer Cyclical',
  ULTA: 'Consumer Cyclical', LKQ: 'Consumer Cyclical', BWA: 'Consumer Cyclical',
  HLT: 'Consumer Cyclical', IHG: 'Consumer Cyclical', H: 'Consumer Cyclical',
  DRI: 'Consumer Cyclical', TXRH: 'Consumer Cyclical', EAT: 'Consumer Cyclical',
  CAKE: 'Consumer Cyclical', PLAY: 'Consumer Cyclical',

  // ── Communication Services (30+) ──────────────────────────────────────
  NFLX: 'Communication Services', DIS: 'Communication Services',
  CMCSA: 'Communication Services', TMUS: 'Communication Services',
  VZ: 'Communication Services', T: 'Communication Services',
  CHTR: 'Communication Services', EA: 'Communication Services',
  TTWO: 'Communication Services', MTCH: 'Communication Services',
  SNAP: 'Communication Services',
  WBD: 'Communication Services', PARA: 'Communication Services',
  LYV: 'Communication Services', RBLX: 'Communication Services',
  SPOT: 'Communication Services', RDDT: 'Communication Services',
  FOXA: 'Communication Services', FOX: 'Communication Services',
  IPG: 'Communication Services', OMC: 'Communication Services',
  NWSA: 'Communication Services', NWS: 'Communication Services',
  ZG: 'Communication Services', Z: 'Communication Services',
  IART: 'Communication Services', GENI: 'Communication Services',
  ATUS: 'Communication Services', LBRDA: 'Communication Services',
  LBRDK: 'Communication Services', FWONA: 'Communication Services',

  // ── Industrials (80+) ─────────────────────────────────────────────────
  CAT: 'Industrials', UNP: 'Industrials', RTX: 'Industrials',
  HON: 'Industrials', BA: 'Industrials', DE: 'Industrials',
  LMT: 'Industrials', GE: 'Industrials', MMM: 'Industrials',
  UPS: 'Industrials', FDX: 'Industrials', WM: 'Industrials',
  ETN: 'Industrials', ITW: 'Industrials', EMR: 'Industrials',
  NOC: 'Industrials', GD: 'Industrials', CSX: 'Industrials',
  NSC: 'Industrials', TT: 'Industrials', CARR: 'Industrials',
  IR: 'Industrials', ROK: 'Industrials', PCAR: 'Industrials',
  FAST: 'Industrials', SWK: 'Industrials', LHX: 'Industrials',
  DAL: 'Industrials', UAL: 'Industrials', AAL: 'Industrials',
  LUV: 'Industrials', AXON: 'Industrials', GWW: 'Industrials',
  CTAS: 'Industrials', ODFL: 'Industrials', SAIA: 'Industrials',
  TDG: 'Industrials', HWM: 'Industrials', PH: 'Industrials',
  AME: 'Industrials', DOV: 'Industrials', XYL: 'Industrials',
  IEX: 'Industrials', NDSN: 'Industrials', RRX: 'Industrials',
  GNRC: 'Industrials', TTC: 'Industrials', SNA: 'Industrials',
  RSG: 'Industrials', CLH: 'Industrials', ACM: 'Industrials',
  PWR: 'Industrials', BLDR: 'Industrials', URI: 'Industrials',
  AUR: 'Industrials', JOBY: 'Industrials', ACHR: 'Industrials',
  LUNR: 'Industrials', RKLB: 'Industrials', ASTS: 'Industrials',
  HEI: 'Industrials', TXT: 'Industrials', LDOS: 'Industrials',
  J: 'Industrials', BAH: 'Industrials', TTEK: 'Industrials',
  WAB: 'Industrials', ROP: 'Industrials', CMI: 'Industrials',
  OTIS: 'Industrials', MAS: 'Industrials', PAYC: 'Industrials', 
  PAYX: 'Industrials', ADP: 'Industrials', VRSK: 'Industrials', 
  BR: 'Industrials', JBHT: 'Industrials', XPO: 'Industrials', 
  CHRW: 'Industrials', EXPD: 'Industrials',

  // ── Consumer Defensive (40+) ──────────────────────────────────────────
  WMT: 'Consumer Defensive', PG: 'Consumer Defensive', KO: 'Consumer Defensive',
  PEP: 'Consumer Defensive', COST: 'Consumer Defensive', PM: 'Consumer Defensive',
  MO: 'Consumer Defensive', MDLZ: 'Consumer Defensive', CL: 'Consumer Defensive',
  KMB: 'Consumer Defensive', GIS: 'Consumer Defensive', K: 'Consumer Defensive',
  HSY: 'Consumer Defensive', SJM: 'Consumer Defensive', KHC: 'Consumer Defensive',
  STZ: 'Consumer Defensive', TAP: 'Consumer Defensive', BG: 'Consumer Defensive',
  ADM: 'Consumer Defensive', KR: 'Consumer Defensive', SYY: 'Consumer Defensive',
  TGT: 'Consumer Defensive', EL: 'Consumer Defensive',
  KDP: 'Consumer Defensive', MNST: 'Consumer Defensive', CHD: 'Consumer Defensive',
  CLX: 'Consumer Defensive', CAG: 'Consumer Defensive', CPB: 'Consumer Defensive',
  MKC: 'Consumer Defensive', HRL: 'Consumer Defensive', TSN: 'Consumer Defensive',
  BF: 'Consumer Defensive', DEO: 'Consumer Defensive',
  WBA: 'Consumer Defensive', USFD: 'Consumer Defensive', PFGC: 'Consumer Defensive',
  GO: 'Consumer Defensive', SFM: 'Consumer Defensive', CASY: 'Consumer Defensive',

  // ── Energy (40+) ──────────────────────────────────────────────────────
  XOM: 'Energy', CVX: 'Energy', COP: 'Energy', SLB: 'Energy',
  EOG: 'Energy', MPC: 'Energy', PSX: 'Energy', VLO: 'Energy',
  PXD: 'Energy', OXY: 'Energy', WMB: 'Energy', KMI: 'Energy',
  HAL: 'Energy', DVN: 'Energy', FANG: 'Energy', HES: 'Energy',
  BKR: 'Energy', OKE: 'Energy', TRGP: 'Energy', APA: 'Energy',
  CTRA: 'Energy', EQT: 'Energy', MRO: 'Energy', MGY: 'Energy',
  AR: 'Energy', RRC: 'Energy', SWN: 'Energy', CHK: 'Energy',
  DTM: 'Energy', AM: 'Energy', DINO: 'Energy', PBF: 'Energy',
  SM: 'Energy', MTDR: 'Energy', CHRD: 'Energy', PR: 'Energy',
  VTLE: 'Energy', NOV: 'Energy', FTI: 'Energy', HP: 'Energy',

  // ── Real Estate (35+) ─────────────────────────────────────────────────
  PLD: 'Real Estate', AMT: 'Real Estate', CCI: 'Real Estate',
  EQIX: 'Real Estate', SPG: 'Real Estate', PSA: 'Real Estate',
  O: 'Real Estate', WELL: 'Real Estate', DLR: 'Real Estate',
  VICI: 'Real Estate', AVB: 'Real Estate', EQR: 'Real Estate',
  ARE: 'Real Estate', MAA: 'Real Estate', UDR: 'Real Estate',
  VTR: 'Real Estate', IRM: 'Real Estate', ESS: 'Real Estate',
  MPW: 'Real Estate', KIM: 'Real Estate', REG: 'Real Estate',
  FRT: 'Real Estate', BXP: 'Real Estate', SLG: 'Real Estate',
  VNO: 'Real Estate', HIW: 'Real Estate', CPT: 'Real Estate',
  HST: 'Real Estate', RHP: 'Real Estate', PEAK: 'Real Estate',
  INVH: 'Real Estate', SBAC: 'Real Estate', LAMR: 'Real Estate',
  WPC: 'Real Estate', NNN: 'Real Estate', STAG: 'Real Estate',

  // ── Utilities (30+) ───────────────────────────────────────────────────
  NEE: 'Utilities', SO: 'Utilities', DUK: 'Utilities',
  D: 'Utilities', SRE: 'Utilities', AEP: 'Utilities',
  EXC: 'Utilities', XEL: 'Utilities', ED: 'Utilities',
  PCG: 'Utilities', WEC: 'Utilities', ES: 'Utilities',
  AWK: 'Utilities', ATO: 'Utilities', CNP: 'Utilities',
  CMS: 'Utilities', DTE: 'Utilities', FE: 'Utilities',
  CEG: 'Utilities', VST: 'Utilities', NRG: 'Utilities',
  PPL: 'Utilities', EIX: 'Utilities', ETR: 'Utilities',
  AES: 'Utilities', LNT: 'Utilities', EVRG: 'Utilities',
  NI: 'Utilities', PNW: 'Utilities', OGE: 'Utilities',

  // ── Basic Materials (30+) ─────────────────────────────────────────────
  LIN: 'Basic Materials', APD: 'Basic Materials', SHW: 'Basic Materials',
  ECL: 'Basic Materials', FCX: 'Basic Materials', NEM: 'Basic Materials',
  NUE: 'Basic Materials', DOW: 'Basic Materials', DD: 'Basic Materials',
  PPG: 'Basic Materials', VMC: 'Basic Materials', MLM: 'Basic Materials',
  CTVA: 'Basic Materials', CF: 'Basic Materials', MOS: 'Basic Materials',
  BALL: 'Basic Materials', IP: 'Basic Materials', PKG: 'Basic Materials',
  GOLD: 'Basic Materials', AA: 'Basic Materials', STLD: 'Basic Materials',
  RS: 'Basic Materials', WRK: 'Basic Materials', SEE: 'Basic Materials',
  EMN: 'Basic Materials', CE: 'Basic Materials', HUN: 'Basic Materials',
  OLN: 'Basic Materials', RPM: 'Basic Materials', AVY: 'Basic Materials',
  IFF: 'Basic Materials', ALB: 'Basic Materials', FMC: 'Basic Materials',
  RGLD: 'Basic Materials', WPM: 'Basic Materials',
};

// ─── Dynamic lookup cache (session-only) ────────────────────────────────
const dynamicCache = new Map<string, string>();
const pendingLookups = new Map<string, Promise<string>>();

/**
 * Look up sector for a ticker. Returns instantly for known tickers.
 * Returns "Other" for unknown tickers (use getSectorAsync for backend lookup).
 */
export const getSector = (ticker: string): string => {
  const upper = ticker.toUpperCase().trim();
  return TICKER_SECTOR_MAP[upper] || dynamicCache.get(upper) || 'Other';
};

/**
 * Async sector lookup — tries static map first, falls back to backend API.
 * Results are cached for the session so each ticker is only fetched once.
 */
export const getSectorAsync = async (ticker: string): Promise<string> => {
  const upper = ticker.toUpperCase().trim();

  // Check static map
  if (TICKER_SECTOR_MAP[upper]) return TICKER_SECTOR_MAP[upper];

  // Check dynamic cache
  if (dynamicCache.has(upper)) return dynamicCache.get(upper)!;

  // Check if already fetching
  if (pendingLookups.has(upper)) return pendingLookups.get(upper)!;

  // Fetch from backend (uses Polygon company info which has sector)
  const promise = stocksAPI.getCompany(upper)
    .then(res => {
      const sector = res.data?.sector || 'Other';
      dynamicCache.set(upper, sector);
      pendingLookups.delete(upper);
      return sector;
    })
    .catch(() => {
      dynamicCache.set(upper, 'Other');
      pendingLookups.delete(upper);
      return 'Other';
    });

  pendingLookups.set(upper, promise);
  return promise;
};

/**
 * Get all tickers in the static map for a given sector.
 * Used by the sector explorer on the Stocks page.
 */
export const getTickersForSector = (sector: string): string[] => {
  return Object.entries(TICKER_SECTOR_MAP)
    .filter(([_, s]) => s === sector)
    .map(([ticker]) => ticker);
};

export interface SectorBreakdown {
  sector: string;
  count: number;
  value: number;
  percentage: number;
  color: string;
  tickers: string[];
}

/**
 * Compute sector breakdown for a list of items.
 * For portfolio: pass items with { ticker, value } where value = total_value.
 * For watchlist: pass items with { ticker } — each stock is weighted equally.
 */
export const computeSectorBreakdown = (
  items: { ticker: string; value?: number }[]
): SectorBreakdown[] => {
  if (items.length === 0) return [];

  const sectorMap = new Map<string, { count: number; value: number; tickers: string[] }>();

  items.forEach(item => {
    const sector = getSector(item.ticker);
    const existing = sectorMap.get(sector) || { count: 0, value: 0, tickers: [] };
    existing.count += 1;
    existing.value += item.value ?? 1;
    existing.tickers.push(item.ticker.toUpperCase());
    sectorMap.set(sector, existing);
  });

  const totalValue = Array.from(sectorMap.values()).reduce((sum, s) => sum + s.value, 0);

  return Array.from(sectorMap.entries())
    .map(([sector, data]) => ({
      sector,
      count: data.count,
      value: data.value,
      percentage: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
      color: SECTOR_COLORS[sector] || SECTOR_COLORS['Other'],
      tickers: data.tickers,
    }))
    .sort((a, b) => b.percentage - a.percentage);
};

export default TICKER_SECTOR_MAP;
