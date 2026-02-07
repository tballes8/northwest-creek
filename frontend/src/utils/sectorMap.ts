/**
 * Stock Sector Mapping Utility
 * Maps common US stock tickers to their GICS sectors.
 * Used for portfolio/watchlist diversification pie charts.
 */

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

const TICKER_SECTOR_MAP: Record<string, string> = {
  // ── Technology ──────────────────────────────────
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
  UBER: 'Technology', ABNB: 'Technology', DASH: 'Technology', COIN: 'Technology',
  ROKU: 'Technology', U: 'Technology', PATH: 'Technology', MDB: 'Technology',
  OKTA: 'Technology', HUBS: 'Technology', DOCU: 'Technology', ZM: 'Technology',
  ARM: 'Technology', SMCI: 'Technology', TSM: 'Technology', ASML: 'Technology',
  SAP: 'Technology', Sony: 'Technology', BABA: 'Technology', JD: 'Technology',
  PDD: 'Technology', BIDU: 'Technology', NTES: 'Technology', AUR: 'Technology',
  VEEA:  'Technology', DOCN: 'Technology',

  // ── Healthcare ──────────────────────────────────
  UNH: 'Healthcare', JNJ: 'Healthcare', LLY: 'Healthcare', ABBV: 'Healthcare',
  MRK: 'Healthcare', TMO: 'Healthcare', ABT: 'Healthcare', PFE: 'Healthcare',
  DHR: 'Healthcare', AMGN: 'Healthcare', BMY: 'Healthcare', MDT: 'Healthcare',
  GILD: 'Healthcare', ISRG: 'Healthcare', VRTX: 'Healthcare', SYK: 'Healthcare',
  BSX: 'Healthcare', REGN: 'Healthcare', ZTS: 'Healthcare', ELV: 'Healthcare',
  HCA: 'Healthcare', CI: 'Healthcare', MCK: 'Healthcare', CVS: 'Healthcare',
  MRNA: 'Healthcare', BIIB: 'Healthcare', ILMN: 'Healthcare', DXCM: 'Healthcare',
  IDXX: 'Healthcare', A: 'Healthcare', IQV: 'Healthcare', EW: 'Healthcare',
  HUM: 'Healthcare', CNC: 'Healthcare', BAX: 'Healthcare', BDX: 'Healthcare',
  GEHC: 'Healthcare', ALGN: 'Healthcare', GTBP: 'Healthcare',

  // ── Financial Services ──────────────────────────
  BRK: 'Financial Services', JPM: 'Financial Services', V: 'Financial Services',
  MA: 'Financial Services', BAC: 'Financial Services', WFC: 'Financial Services',
  GS: 'Financial Services', MS: 'Financial Services', SPGI: 'Financial Services',
  BLK: 'Financial Services', C: 'Financial Services', AXP: 'Financial Services',
  SCHW: 'Financial Services', CB: 'Financial Services', PGR: 'Financial Services',
  MMC: 'Financial Services', ICE: 'Financial Services', CME: 'Financial Services',
  AON: 'Financial Services', USB: 'Financial Services', PNC: 'Financial Services',
  TFC: 'Financial Services', AIG: 'Financial Services', MET: 'Financial Services',
  PRU: 'Financial Services', AFL: 'Financial Services', ALL: 'Financial Services',
  PYPL: 'Financial Services', FIS: 'Financial Services', FISV: 'Financial Services',
  COF: 'Financial Services', DFS: 'Financial Services', SYF: 'Financial Services',
  'BRK.B': 'Financial Services', 'BRK.A': 'Financial Services', 
  OXLC: 'Financial Services', HIVE: 'Financial Services', IREN: 'Financial Services',
  CIFR: 'Financial Services',

  // ── Consumer Cyclical ───────────────────────────
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

  // ── Communication Services ──────────────────────
  NFLX: 'Communication Services', DIS: 'Communication Services',
  CMCSA: 'Communication Services', TMUS: 'Communication Services',
  VZ: 'Communication Services', T: 'Communication Services',
  CHTR: 'Communication Services', EA: 'Communication Services',
  TTWO: 'Communication Services', MTCH: 'Communication Services',
  SNAP: 'Communication Services', PINS: 'Communication Services',
  WBD: 'Communication Services', PARA: 'Communication Services',
  LYV: 'Communication Services', RBLX: 'Communication Services',
  SPOT: 'Communication Services', RDDT: 'Communication Services',
  NXDR: 'Communication Services',

  // ── Industrials ─────────────────────────────────
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
  LUV: 'Industrials', AXON: 'Industrials', KODK: 'Industrials',
  ACHR: 'Industrials',

  // ── Consumer Defensive ──────────────────────────
  WMT: 'Consumer Defensive', PG: 'Consumer Defensive', KO: 'Consumer Defensive',
  PEP: 'Consumer Defensive', COST: 'Consumer Defensive', PM: 'Consumer Defensive',
  MO: 'Consumer Defensive', MDLZ: 'Consumer Defensive', CL: 'Consumer Defensive',
  KMB: 'Consumer Defensive', GIS: 'Consumer Defensive', K: 'Consumer Defensive',
  HSY: 'Consumer Defensive', SJM: 'Consumer Defensive', KHC: 'Consumer Defensive',
  STZ: 'Consumer Defensive', TAP: 'Consumer Defensive', BG: 'Consumer Defensive',
  ADM: 'Consumer Defensive', KR: 'Consumer Defensive', SYY: 'Consumer Defensive',
  TGT: 'Consumer Defensive', EL: 'Consumer Defensive',

  // ── Energy ──────────────────────────────────────
  XOM: 'Energy', CVX: 'Energy', COP: 'Energy', SLB: 'Energy',
  EOG: 'Energy', MPC: 'Energy', PSX: 'Energy', VLO: 'Energy',
  PXD: 'Energy', OXY: 'Energy', WMB: 'Energy', KMI: 'Energy',
  HAL: 'Energy', DVN: 'Energy', FANG: 'Energy', HES: 'Energy',
  BKR: 'Energy', OKE: 'Energy', TRGP: 'Energy', APA: 'Energy',

  // ── Real Estate ─────────────────────────────────
  PLD: 'Real Estate', AMT: 'Real Estate', CCI: 'Real Estate',
  EQIX: 'Real Estate', SPG: 'Real Estate', PSA: 'Real Estate',
  O: 'Real Estate', WELL: 'Real Estate', DLR: 'Real Estate',
  VICI: 'Real Estate', AVB: 'Real Estate', EQR: 'Real Estate',
  ARE: 'Real Estate', MAA: 'Real Estate', UDR: 'Real Estate',
  VTR: 'Real Estate', IRM: 'Real Estate', ESS: 'Real Estate',
  MPW: 'Real Estate',

  // ── Utilities ───────────────────────────────────
  NEE: 'Utilities', SO: 'Utilities', DUK: 'Utilities',
  D: 'Utilities', SRE: 'Utilities', AEP: 'Utilities',
  EXC: 'Utilities', XEL: 'Utilities', ED: 'Utilities',
  PCG: 'Utilities', WEC: 'Utilities', ES: 'Utilities',
  AWK: 'Utilities', ATO: 'Utilities', CNP: 'Utilities',
  CMS: 'Utilities', DTE: 'Utilities', FE: 'Utilities',
  CEG: 'Utilities', VST: 'Utilities',

  // ── Basic Materials ─────────────────────────────
  LIN: 'Basic Materials', APD: 'Basic Materials', SHW: 'Basic Materials',
  ECL: 'Basic Materials', FCX: 'Basic Materials', NEM: 'Basic Materials',
  NUE: 'Basic Materials', DOW: 'Basic Materials', DD: 'Basic Materials',
  PPG: 'Basic Materials', VMC: 'Basic Materials', MLM: 'Basic Materials',
  CTVA: 'Basic Materials', CF: 'Basic Materials', MOS: 'Basic Materials',
  BALL: 'Basic Materials', IP: 'Basic Materials', PKG: 'Basic Materials',
  GOLD: 'Basic Materials',
};

/**
 * Look up the GICS sector for a given ticker.
 * Returns "Other" if the ticker is not in the mapping.
 */
export const getSector = (ticker: string): string => {
  const upper = ticker.toUpperCase().trim();
  return TICKER_SECTOR_MAP[upper] || 'Other';
};

export interface SectorBreakdown {
  sector: string;
  count: number;
  value: number;       // total $ value (for portfolio) or count (for watchlist)
  percentage: number;  // 0–100
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
    existing.value += item.value ?? 1; // default to 1 for equal weighting
    existing.tickers.push(item.ticker.toUpperCase());
    sectorMap.set(sector, existing);
  });

  const totalValue = Array.from(sectorMap.values()).reduce((sum, s) => sum + s.value, 0);

  const breakdown: SectorBreakdown[] = Array.from(sectorMap.entries())
    .map(([sector, data]) => ({
      sector,
      count: data.count,
      value: data.value,
      percentage: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
      color: SECTOR_COLORS[sector] || SECTOR_COLORS['Other'],
      tickers: data.tickers,
    }))
    .sort((a, b) => b.percentage - a.percentage);

  return breakdown;
};

export default TICKER_SECTOR_MAP;
