"""
What counts as a US-listed common stock: the one ticker filter for every list the app
builds from vendor data. The screener universe (tasks/refresh_stock_snapshots.py), the
daily snapshot cron (tasks/fetch_daily_snapshots.py), the gainers/losers and ticker
tapes (services/market_data.py, endpoints/market.py) and the IPO calendar
(endpoints/stocks.py) all read these rules, so a symbol one of them drops is not
offered by another. The most-active tape also drops leveraged and inverse funds
(is_leveraged_or_inverse_fund).

Pure: stdlib only, no app.config. The daily-snapshot cron imports it, and cron services
lack most settings.

    python -m app.core.listings --selftest
"""
import re

# Exchanges that count as a US listing, spelled the way FMP's batch-quote and
# /company-screener's `exchange` parameter spell them.
#
# These are batch-quote's `exchange` values, which are NOT what /company-screener
# reports for the same symbol: the screener says "New York Stock Exchange Arca" and
# "Chicago Board Options Exchange" where batch-quote says "AMEX" and "CBOE". The screener
# universe's quote gate reads batch-quote, so it must be spelled batch-quote's way, and
# the universe build sends exactly these values as `exchange=`.
#
# CBOE is here because Cboe BZX lists ~14% of US ETFs (measured over a 1000-symbol
# sample by scripts/probe_etf_universe.py: AMEX 644, NASDAQ 202, CBOE 143, NYSE 10).
# Without it those funds are fetched and then silently dropped — the ETF screener
# would just be missing ~675 funds with nothing in the logs to say why.
#
# OTC is deliberately NOT here. It was 1 symbol in that sample, and since the gate
# applies to every row, adding it would also admit OTC common stock to the stock
# screener — a change to stock-side behaviour that buys one fund.
US_EXCHANGES = frozenset({"NYSE", "NASDAQ", "AMEX", "CBOE"})

# Other vendor spellings of the same venues (the IPO calendar has used them). Accepted by
# is_us_exchange, never sent to FMP.
_EXCHANGE_ALIASES = {"NYSEARCA": "AMEX", "NYSEAMERICAN": "AMEX", "BATS": "CBOE"}


def normalize_exchange(exchange: str | None) -> str:
    """Upper-cased with whitespace removed, so "Nasdaq", "NYSE " and "NYSE Arca"
    compare. The gates drop silently, so a vendor casing change must not shrink a list."""
    return re.sub(r"\s+", "", exchange or "").upper()


def is_us_exchange(exchange: str | None) -> bool:
    """True for a US_EXCHANGES venue under any accepted spelling."""
    ex = normalize_exchange(exchange)
    return ex in US_EXCHANGES or ex in _EXCHANGE_ALIASES


def is_us_symbol(symbol: str | None) -> bool:
    """A symbol a US listing can carry and the ticker columns can store: no "." (FMP's
    foreign-venue suffix: SHOP.TO, HSBA.L, 7203.T) and at most 10 characters (the
    VARCHAR(10) of stock_snapshots and daily_stock_snapshots)."""
    return bool(symbol) and "." not in symbol and len(symbol) <= 10


# Instruments /company-screener's stock leg returns that are not common stock: warrants,
# SPAC units and rights, preferreds and depositary shares, exchange-traded notes and
# baby bonds, and synthetic trust certificates. FMP has no instrument-type field on the
# screener and the symbol alone is not enough: most carry a plain five-letter ticker
# (ACGCW warrants, IDACU units, CGABL notes), so the name is checked too. Measured
# 2026-10-25: 286 of 4,642 stock-leg rows, none of them common stock, many listed with
# the parent's market cap (a Bank of America note at $175B). They passed every screen
# and, carrying junk multiples, led every P/E-ascending sort.
_NON_COMMON_SYMBOL = re.compile(r"-(P[A-Z]?|WT|WS|UN?|RI?)$")   # -PA preferred, -WT warrant, -UN unit, -RI rights
# "Depositary shares" means a preferred stake only when it is not "American Depositary
# Shares": an ADR is the US line of a foreign company's common stock (ARM, $224B, is
# named "Arm Holdings plc American Depositary Shares"). Every depositary name on the
# 2026-10-25 universe was an ADR; preferred depositaries are also caught by
# _PREFERRED_CONTEXT and their -P symbol suffixes.
_NON_COMMON_NAME = re.compile(
    r"\b(warrants?|units?|rights?|contingent value|pfd|(?<!american )depositary (shares?|receipts?)|"
    r"debentures?|subordinated|senior notes?|notes? due|bonds? due|trust certificates?|"
    r"synthetic fixed-income|strats|corts|saturns|pplus)\b",
    re.I,
)
# "Preferred" alone is a real company name (Preferred Bank, Preferred Apartment
# Communities); a preferred security's name also carries a coupon, series or share word.
_PREFERRED_WORD = re.compile(r"\bpreferred\b", re.I)
_PREFERRED_CONTEXT = re.compile(r"%|\b(series|stock|shares?|pfd|cum|non-?cum|perpetual|depositary|redeemable)\b", re.I)
# Nasdaq's fifth letter is an instrument code: W is a warrant, U a unit. FMP names most
# of these after the parent ("NioCorp Developments Ltd." for NIOBW, "Gores Holdings XI"
# for GHXIU), so the name rule above cannot see them; the shape alone can. Measured
# 2026-10-25 over 4,642 stock-leg rows: 22 five-letter-W symbols, all warrants; 84
# five-letter-U, all SPAC units; no common stock of either shape.
_UNIT_OR_WARRANT_SYMBOL = re.compile(r"^[A-Z]{4}[UW]$")
# Rights (fifth letter R) are rarer and a five-letter common could end in R, so they
# stay gated on a SPAC-shaped name. No trailing boundary: "Acquisitions Corp." and
# "Acquisition1 Corp" are both real names.
_SPAC_RIGHT_SYMBOL = re.compile(r"^[A-Z]{4}R$")
_SPAC_NAME = re.compile(r"\b(acquisition|merger|spac)", re.I)


def is_common_stock(symbol: str, name: str | None) -> bool:
    """False for any instrument a stock list should not carry. Written for the
    screener's stock leg: callers that also list funds apply it to their stock rows."""
    name = name or ""
    if _NON_COMMON_SYMBOL.search(symbol):
        return False
    if _NON_COMMON_NAME.search(name):
        return False
    if _PREFERRED_WORD.search(name) and _PREFERRED_CONTEXT.search(name):
        return False
    if _UNIT_OR_WARRANT_SYMBOL.match(symbol):
        return False
    if _SPAC_RIGHT_SYMBOL.match(symbol) and _SPAC_NAME.search(name):
        return False
    return True


# Leveraged and inverse funds: daily-reset trading products, not investments, and on
# a volume-sorted list they crowd out everything else (2026-11-06: SOXL, SOXS, NVD,
# SPDN, TQQQ, SQQQ, KORU, TSLL and TSLG were 9 of FMP's 50 most-actives). FMP gives no
# fund type on these lists, so the name decides. The leverage words are only read on
# a name that is plainly a fund, which keeps Ultra Clean Holdings and Build-A-Bear in.
# "Short" names an inverse fund except as Short-Term/Short Duration/Short Maturity,
# which are plain bond and volatility funds (VXX stays).
_FUND_NAME = re.compile(r"\b(etfs?|etns?|fund|trust|proshares|direxion|graniteshares)\b", re.I)
_LEVERAGE_NAME = re.compile(
    r"(?<![\w.])-?\d+(\.\d+)?x\b|\bultra(pro|short)?\b|\b(bull|bear|inverse|leveraged?)\b"
    r"|\bshort\b(?![- ](term|duration|maturity)\b)",
    re.I,
)


def is_leveraged_or_inverse_fund(name: str | None) -> bool:
    """True for a leveraged (2X, 3X, Ultra) or inverse (Short, Bear, -1X) fund."""
    name = name or ""
    return bool(_FUND_NAME.search(name) and _LEVERAGE_NAME.search(name))


def _selftest() -> None:
    # is_common_stock: real companies, share classes and awkward names stay in
    for sym, name in [
        ("AAPL", "Apple Inc."), ("BRK-B", "Berkshire Hathaway Inc."), ("BF-B", "Brown-Forman Corporation"),
        ("MKC-V", "McCormick & Company, Incorporated"), ("PFBC", "Preferred Bank"),
        ("APTS", "Preferred Apartment Communities, Inc."), ("IPHX", "Inflection Point Acquisition Corp. VIII"),
        ("UAL", "United Airlines Holdings, Inc."), ("ACQU", "Acquire Holdings"),
        ("GOOGL", "Alphabet Inc."), ("LBTYA", "Liberty Global Ltd."), ("SHOW", "ShowBiz Inc."),
        ("ARM", "Arm Holdings plc American Depositary Shares"), ("TSM", "Taiwan Semiconductor Manufacturing Company Limited"),
        ("ACN", "Accenture plc"), ("PBR-A", "Petróleo Brasileiro S.A. - Petrobras"),
        ("JOYY", "JOYY, Inc. Sponsored ADR Class A"),
        ("NEWS", None),                                      # the IPO filter's WS rule dropped this shape
        ("ABCDR", "Abcdr Therapeutics Inc."),                # a five-letter R with no SPAC name
    ]:
        assert is_common_stock(sym, name), (sym, name)
    # ...and every instrument class found on the stock leg 2026-10-25 goes out
    for sym, name in [
        ("SCE-PG", "SCE Trust II TR PFD SECS 5.1%"), ("CELG-RI", "Bristol-Myers Squibb Company Contingent Value Rights"),
        ("ACGCW", "ACP Holdings Acquisition Corp. Warrants"), ("IPHXU", "Inflection Point Acquisition Corp. VIII"),
        ("SORNR", "Soren Acquisition Corp."), ("CGABL", "The Carlyle Group Inc. 4.625% Subordinated Notes due 2061"),
        ("STRF", "MicroStrategy Incorporated 10.00% Series A Perpetual Strife Preferred Stock"),
        ("DUKU", "Duke Energy Corporation Units 1.08.29"), ("MER-PK", "Bank of America Corp 6.45 % Notes 2018-15.12.66"),
        ("AAC-UN", "Ares Acquisition Corporation II"), ("PEW-WT", "GrabAGun Digital Holdings Inc."),
        ("CTA-PB", "EIDP, Inc. USD 4.50 Cum Pfd Registered Shs"), ("ETI-P", "Entergy Texas, Inc."),
        ("GJO", "STRATS(SM) Trust for Wal-Mart Stores, Inc. Securities, Series 2004-5"),
        ("NIOBW", "NioCorp Developments Ltd."), ("MDAIW", "Spectral AI, Inc."),
        ("HVMCU", "Highview Merger Corp."), ("XSLLU", "Xsolla SPAC 1"), ("GHXIU", "Gores Holdings XI, Inc."),
        ("TRGSR", "TRG Latin America Acquisitions Corp."), ("JONER", "Jones Ventures INTL Acquisition1 Corp"),
        ("XYZP", "Depositary Shares each representing a 1/1000th interest in a 5.375% Series H Preferred"),
        ("LILAP", "Liberty Latin America Ltd. 9% Cum Perp Red Pfd Shs Series A"),
        # the old gainers/losers filter's cases
        ("ABCWW", None), ("XYZ-WS", None), ("XYZ-WT", None),
    ]:
        assert not is_common_stock(sym, name), (sym, name)

    # is_us_symbol: the "." and length rule the universe build and the cron applied
    for sym in ("AAPL", "BRK-B", "ABCDEFGHIJ"):
        assert is_us_symbol(sym), sym
    for sym in ("", None, "SHOP.TO", "7203.T", "ABC.WS", "ABCDEFGHIJK"):
        assert not is_us_symbol(sym), sym

    # is_us_exchange: batch-quote's names, other spellings of them, casing and spaces
    for ex in ("NYSE", "NASDAQ", "AMEX", "CBOE", "nasdaq", " NYSE ", "NYSEARCA", "NYSE Arca",
               "NYSEAMERICAN", "NYSE American", "BATS"):
        assert is_us_exchange(ex), ex
    for ex in ("OTC", "TSX", "LSE", "Nasdaq Global Select", "", None):
        assert not is_us_exchange(ex), ex

    # is_leveraged_or_inverse_fund: FMP's names from the 2026-11-06 most-actives list
    for name in (
        "Direxion Daily Semiconductor Bull 3X ETF", "Direxion Daily Semiconductor Bear 3X ETF",
        "GraniteShares 2x Short NVDA Daily ETF", "Direxion Daily S&P 500 Bear 1X ETF",
        "ProShares UltraPro QQQ", "ProShares - UltraPro Short QQQ",
        "Direxion Daily MSCI South Korea Bull 3X ETF", "Direxion Daily TSLA Bull 2X ETF",
        "Themes ETF Trust - Leverage Shares 2X Long TSLA Daily ETF",
        "ProShares Ultra VIX Short-Term Futures ETF", "ProShares Short S&P500",
        "Volatility Shares -1x Short VIX Futures ETF", "MicroSectors FANG+ Index 3X Leveraged ETN",
        "Direxion Daily S&P Oil & Gas Exp. & Prod. Bull 1.5X Shares",
    ):
        assert is_leveraged_or_inverse_fund(name), name
    for name in (
        "Invesco QQQ Trust, Series 1", "State Street SPDR S&P 500 ETF", "iShares Semiconductor ETF",
        "iShares Bitcoin Trust ETF", "ProShares Bitcoin ETF", "Vanguard Short-Term Bond ETF",
        "iPath Series B S&P 500 VIX Short-Term Futures ETN", "PIMCO Enhanced Short Maturity Active ETF",
        "Ultra Clean Holdings, Inc.", "Build-A-Bear Workshop, Inc.", "Northern Trust Corporation",
        "NVIDIA Corporation", "3M Company", "Bullfrog AI Holdings, Inc.", "", None,
    ):
        assert not is_leveraged_or_inverse_fund(name), name
    print("listings selftest OK")


if __name__ == "__main__":
    import sys

    if "--selftest" in sys.argv[1:]:
        _selftest()
    else:
        print("usage: python -m app.core.listings --selftest")
