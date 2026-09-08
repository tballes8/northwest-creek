from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text, Numeric, Date, Index, Integer, UniqueConstraint, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
import uuid

Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255))
    is_active = Column(Boolean, default=True)
    verification_token = Column(String(255), nullable=True)
    verification_token_expires = Column(DateTime(timezone=True), nullable=True)
    password_reset_token = Column(String(255), nullable=True)
    password_reset_token_expires = Column(DateTime(timezone=True), nullable=True)
    is_verified = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False)
    
    # Subscription tiers: beginner, casual, active, professional
    subscription_tier = Column(String(50), default="beginner")

    # Stripe linkage — avoids repeated API lookups by email
    stripe_customer_id = Column(String(255), nullable=True, index=True)
    
    # Phone / SMS alert fields
    phone_number = Column(String(20), nullable=True)
    phone_verified = Column(Boolean, default=False)
    phone_otp_hash = Column(String(255), nullable=True)
    phone_otp_expires = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationship to watchlists
    watchlists = relationship("Watchlist", back_populates="user", cascade="all, delete-orphan")
    portfolio = relationship("Portfolio", back_populates="user", cascade="all, delete-orphan")
    alerts = relationship("PriceAlert", back_populates="user", cascade="all, delete-orphan")
    technical_alerts = relationship("TechnicalAlert", back_populates="user", cascade="all, delete-orphan")
    feature_usage = relationship("FeatureUsage", back_populates="user", cascade="all, delete-orphan")

    @property
    def phone_last_four(self) -> str | None:
        """Masked phone number for API responses — never expose full number."""
        return self.phone_number[-4:] if self.phone_number else None


class Watchlist(Base):
    __tablename__ = "watchlists"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    ticker = Column(String(10), nullable=False)
    target_price = Column(Numeric(precision=18, scale=2), nullable=True)
    added_at = Column(DateTime(timezone=True), server_default=func.now())
    notes = Column(Text, nullable=True)
    # created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship to user
    user = relationship("User", back_populates="watchlists")

class Portfolio(Base):
    __tablename__ = "portfolio"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    ticker = Column(String(10), nullable=False)
    quantity = Column(Numeric(precision=18, scale=8), nullable=False)
    buy_price = Column(Numeric(precision=18, scale=4), nullable=False)
    buy_date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationship to user
    user = relationship("User", back_populates="portfolio")


class PortfolioTransaction(Base):
    """Append-only buy/sell ledger. Source of truth for realized P/L.

    NOTHING IS EVER DELETED FROM THIS TABLE. A mistyped sale is corrected by
    appending a REVERSAL row that carries the negated realized_pl, so the
    history records both the error and the correction.

    `portfolio` remains a materialized projection of *current* holdings
    (quantity + average cost). Every mutation writes one row here AND updates
    the projection in the same transaction, which keeps this invariant true:

        remaining_qty   = SUM(BUY.qty) - SUM(SELL.qty) + SUM(REVERSAL.qty)
        remaining_basis = SUM(BUY.qty * BUY.price)
                          - SUM(SELL.qty * SELL.cost_basis_per_share)
                          + SUM(REVERSAL.qty * REVERSAL.cost_basis_per_share)

    ...counting forward from the most recent ADJUST checkpoint for the ticker.

    Deliberately NOT FK'd to portfolio.id: the holdings row is deleted on a
    full exit, and a later re-buy of the same ticker gets a new position id.
    The durable identity of a holding is (user_id, ticker).
    """
    __tablename__ = "portfolio_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    ticker = Column(String(10), nullable=False)

    # BUY | SELL | ADJUST | REVERSAL. String + CHECK rather than a PG enum so
    # adding DIVIDEND/SPLIT later is a CHECK swap, not an ALTER TYPE migration.
    transaction_type = Column(String(10), nullable=False)

    # Always a positive magnitude; direction lives in transaction_type, so a
    # "negative BUY" can never exist. ADJUST is a restatement checkpoint and
    # may be 0 (position removed).
    quantity = Column(Numeric(precision=18, scale=8), nullable=False)
    price = Column(Numeric(precision=18, scale=4), nullable=False)
    transaction_date = Column(Date, nullable=False)

    # SELL/REVERSAL only: the projection's average cost at the moment of sale.
    # Freezes realized P/L against future rounding changes, makes the projection
    # exactly recomputable, and is the forward-compat seam for FIFO.
    cost_basis_per_share = Column(Numeric(precision=18, scale=4), nullable=True)

    # SELL/REVERSAL only. Stored so the realized aggregate is a plain SUM().
    # A REVERSAL carries the negative of the sale it voids, so SUM() nets to
    # zero with no special-casing at any call site.
    realized_pl = Column(Numeric(precision=18, scale=4), nullable=True)

    # REVERSAL only: the SELL row this voids. Self-referential; nothing is ever
    # deleted from this table, so no ondelete behavior is required. The unique
    # constraint is what prevents the same sale being voided twice.
    reverses_transaction_id = Column(
        UUID(as_uuid=True),
        ForeignKey('portfolio_transactions.id'),
        nullable=True,
        unique=True,
    )

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # No updated_at — this table is append-only.

    __table_args__ = (
        CheckConstraint(
            "transaction_type IN ('BUY', 'SELL', 'ADJUST', 'REVERSAL')",
            name='ck_portfolio_tx_type',
        ),
        CheckConstraint(
            "(transaction_type IN ('BUY', 'SELL', 'REVERSAL') AND quantity > 0) "
            "OR (transaction_type = 'ADJUST' AND quantity >= 0)",
            name='ck_portfolio_tx_quantity',
        ),
        CheckConstraint('price > 0', name='ck_portfolio_tx_price'),
        # Guards the realized aggregate: a SELL with a NULL realized_pl would
        # drop silently out of SUM() and understate the user's gains.
        CheckConstraint(
            "transaction_type NOT IN ('SELL', 'REVERSAL') "
            "OR (cost_basis_per_share IS NOT NULL AND realized_pl IS NOT NULL)",
            name='ck_portfolio_tx_sell_basis',
        ),
        CheckConstraint(
            "(transaction_type = 'REVERSAL') = (reverses_transaction_id IS NOT NULL)",
            name='ck_portfolio_tx_reversal_link',
        ),
        Index('idx_portfolio_tx_user_date', 'user_id', 'transaction_date'),
        Index('idx_portfolio_tx_user_ticker', 'user_id', 'ticker'),
    )


class PriceAlert(Base):
    __tablename__ = "price_alerts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    ticker = Column(String(10), nullable=False)
    target_price = Column(Numeric(precision=18, scale=2), nullable=False)
    condition = Column(String(10), nullable=False)  # 'above' or 'below'
    is_active = Column(Boolean, default=True)
    sms_enabled = Column(Boolean, default=False)
    triggered_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship to user
    user = relationship("User", back_populates="alerts")


class TechnicalAlert(Base):
    __tablename__ = "technical_alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    ticker = Column(String(10), nullable=False)
    alert_type = Column(String(30), nullable=False)
    config = Column(JSONB, nullable=False)
    last_state = Column(JSONB, nullable=True)
    is_active = Column(Boolean, default=True)
    sms_enabled = Column(Boolean, default=False)
    triggered_at = Column(DateTime(timezone=True), nullable=True)
    trigger_details = Column(JSONB, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="technical_alerts")


class WaitlistSignup(Base):
    """Collects opt-in emails from the public landing page.

    No FK to users — these are pre-registration leads from social media
    links. The `source` column captures utm_source / ref param / referrer
    so you can measure which social channel is converting.
    """
    __tablename__ = "waitlist_signups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    source = Column(String(255), nullable=True)          # utm_source, ref param, or document.referrer
    ip_address = Column(String(45), nullable=True)        # IPv4 or IPv6, for rate-limit / abuse detection
    converted = Column(Boolean, default=False)            # flipped True when they register a real account
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class FeatureUsage(Base):
    """Tracks per-user, per-feature usage for time-based tier limits (daily/weekly)."""
    __tablename__ = "feature_usage"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    feature = Column(String(50), nullable=False)   # e.g. "dcf_valuations", "stock_reviews", "technical_analysis"
    used_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="feature_usage")

    __table_args__ = (
        Index('idx_feature_usage_user_feature', 'user_id', 'feature'),
        Index('idx_feature_usage_used_at', 'used_at'),
    )


class DailyStockSnapshot(Base):
    __tablename__ = "daily_stock_snapshots"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticker = Column(String(10), nullable=False, index=True)
    open_price = Column(Numeric(precision=18, scale=2), nullable=False)
    close_price = Column(Numeric(precision=18, scale=2), nullable=False)
    change_percent = Column(Numeric(precision=18, scale=2), nullable=False)
    snapshot_date = Column(Date, nullable=False, index=True)
    asset_type = Column(String(20), nullable=True, index=True)  # e.g. "CS", "ETF", "WARRANT"
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    __table_args__ = (
        Index('idx_snapshot_date_change', 'snapshot_date', 'change_percent'),
    )


class StockSnapshot(Base):
    """Live screener universe — upserted every 15 min from FMP batch-quote."""
    __tablename__ = "stock_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    symbol = Column(String(10), nullable=False, unique=True)
    name = Column(String(255), nullable=True)
    price = Column(Numeric(precision=18, scale=4), nullable=True)
    change_percentage = Column(Numeric(precision=10, scale=4), nullable=True)
    change = Column(Numeric(precision=18, scale=4), nullable=True)
    volume = Column(Numeric(precision=20, scale=0), nullable=True)
    avg_volume = Column(Numeric(precision=20, scale=0), nullable=True)
    day_low = Column(Numeric(precision=18, scale=4), nullable=True)
    day_high = Column(Numeric(precision=18, scale=4), nullable=True)
    year_high = Column(Numeric(precision=18, scale=4), nullable=True)
    year_low = Column(Numeric(precision=18, scale=4), nullable=True)
    market_cap = Column(Numeric(precision=24, scale=2), nullable=True)
    # Trailing annual dividend per share (from /company-screener, refreshed on the
    # daily universe rebuild). Yield is derived live as this ÷ price — see screener.py.
    last_annual_dividend = Column(Numeric(precision=18, scale=4), nullable=True)
    # 5-year beta vs. market (from /company-screener, daily rebuild). Volatility filter.
    beta = Column(Numeric(precision=10, scale=4), nullable=True)
    # Recency-gated dividend, from market_data.evaluate_dividend() on the daily rebuild.
    # last_annual_dividend above is FMP's raw trailing figure and carries no ex-date, so it
    # keeps quoting a rate for payers that stopped (NFE: ~124%). These are the gated values
    # the screener actually reads; dividend_annual is NULL when suspended or unannualizable.
    dividend_annual = Column(Numeric(precision=18, scale=4), nullable=True)
    dividend_status = Column(String(12), nullable=True)  # none|active|suspended|unknown
    dividend_last_ex_date = Column(Date, nullable=True)
    price_avg_50 = Column(Numeric(precision=18, scale=4), nullable=True)
    price_avg_200 = Column(Numeric(precision=18, scale=4), nullable=True)
    exchange = Column(String(20), nullable=True)
    open_price = Column(Numeric(precision=18, scale=4), nullable=True)
    previous_close = Column(Numeric(precision=18, scale=4), nullable=True)
    fmp_timestamp = Column(DateTime(timezone=True), nullable=True)
    last_refreshed = Column(DateTime(timezone=True), server_default=func.now())
    is_etf = Column(Boolean, nullable=True)

    # Company profile fields for keyword search
    sector = Column(String(100), nullable=True)
    industry = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)

    # BB/KC squeeze state — precomputed daily by compute_squeeze_job
    squeeze_state = Column(String(8), nullable=True)  # 'on' | 'fired' | 'none'
    squeeze_bars = Column(Integer, nullable=True)     # bars_in_squeeze if 'on', bars_since_fire if 'fired'
    squeeze_ratio = Column(Numeric(precision=10, scale=4), nullable=True)  # BB width ÷ KC width (smaller = tighter)
    squeeze_computed_at = Column(DateTime(timezone=True), nullable=True)

    # Fund metadata — populated only on is_etf rows, by
    # refresh_stock_snapshots._update_etf_metadata from /stable/etf/info.
    #
    # expense_ratio is a PERCENT (0.0300 = 3bp), not a fraction: FMP's expenseRatio
    # unit differs between funds and market_data._normalize_expense_ratio reconciles
    # it on ingest so every consumer reads one unit.
    expense_ratio = Column(Numeric(precision=6, scale=4), nullable=True)
    # Deliberately not market_cap: that comes from batch-quote and is sparse for
    # funds, this comes from the fund itself. ETF mode filters and sorts on aum.
    aum = Column(Numeric(precision=24, scale=2), nullable=True)
    nav = Column(Numeric(precision=18, scale=4), nullable=True)
    holdings_count = Column(Integer, nullable=True)
    asset_class = Column(String(50), nullable=True)   # Equity | Fixed Income | Commodity | ...
    etf_company = Column(String(120), nullable=True)  # issuer
    inception_date = Column(Date, nullable=True)
    # Every field above is written with COALESCE, so without this a value stale
    # because etf/info has been erroring for days is indistinguishable from a fresh one.
    etf_info_refreshed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index('idx_ss_market_cap', 'market_cap'),
        Index('idx_ss_price_avg_50', 'price_avg_50'),
        Index('idx_ss_price_avg_200', 'price_avg_200'),
        Index('idx_ss_change_pct', 'change_percentage'),
        Index('idx_ss_squeeze_state', 'squeeze_state'),
        Index('idx_ss_sector', 'sector'),
        Index('idx_ss_industry', 'industry'),
        # Two GIN full-text indexes also exist on this table and are NOT modelled
        # here, because they are expression indexes over to_tsvector(...) which
        # SQLAlchemy cannot express as a plain Index: idx_ss_description_fts and
        # idx_ss_combined_fts (migration 023). /stocks/search-by-keywords depends on
        # both. `alembic revision --autogenerate` cannot see them and WILL emit
        # op.drop_index for each — delete those lines from any generated migration.
    )


class TickerDailyBar(Base):
    """Rolling daily OHLC history per ticker — feeds the squeeze precompute job.

    Seeded once from FMP historical EOD, then appended each trading day from the
    OHLC already captured in StockSnapshot. Only the most recent ~40 bars per
    ticker are retained (older bars are pruned by the job).
    """
    __tablename__ = "ticker_daily_bars"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    symbol = Column(String(10), nullable=False, index=True)
    bar_date = Column(Date, nullable=False)
    open = Column(Numeric(precision=18, scale=4), nullable=True)
    high = Column(Numeric(precision=18, scale=4), nullable=True)
    low = Column(Numeric(precision=18, scale=4), nullable=True)
    close = Column(Numeric(precision=18, scale=4), nullable=True)

    __table_args__ = (
        UniqueConstraint('symbol', 'bar_date', name='uq_ticker_daily_bar'),
        Index('idx_tdb_symbol', 'symbol'),
    )


class SectorEtfDailyClose(Base):
    """Daily close prices for the 11 GICS sector ETFs + SPY benchmark.
    Backfilled once on deploy, appended daily by fetch_daily_snapshots cron."""
    __tablename__ = "sector_etf_daily_closes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticker = Column(String(10), nullable=False, index=True)
    close_date = Column(Date, nullable=False, index=True)
    close_price = Column(Numeric(precision=18, scale=4), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('ticker', 'close_date', name='uq_sector_etf_ticker_date'),
        Index('idx_sector_etf_close_date', 'close_date'),
    )


class MacroIndicator(Base):
    """Latest observation per FRED macro series (yield curve, Fed funds, CPI, unemployment, GDP).
    Refreshed daily by fetch_macro_indicators cron — only the most recent observation per
    series_id is retained (upsert on series_id key)."""
    __tablename__ = "macro_indicators"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    series_id = Column(String(40), nullable=False, unique=True, index=True)
    observation_date = Column(Date, nullable=False)
    value = Column(Numeric(precision=18, scale=6), nullable=False)
    fetched_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SavedScreen(Base):
    __tablename__ = "saved_screens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    # "screener" → criteria is the screener filter payload.
    # "search"   → criteria is {"query": "<keyword search text>"} from Stock Search.
    # Both kinds share this table and the single "saved_screens" tier limit.
    kind = Column(String(20), nullable=False, server_default="screener")
    criteria = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Tutorial(Base):
    __tablename__ = "tutorials"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    youtube_url = Column(String(500), nullable=True)
    video_url = Column(String(500), nullable=True)
    thumbnail_url = Column(String(500), nullable=True)
    category = Column(String(100), default="General")
    display_order = Column(Integer, default=0)
    is_published = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class BlogPost(Base):
    __tablename__ = "blog_posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    slug = Column(String(300), unique=True, nullable=False, index=True)
    content = Column(Text, nullable=False)
    excerpt = Column(Text, nullable=True)
    cover_image_url = Column(String(500), nullable=True)
    category = Column(String(100), default="General")
    tags = Column(String(500), nullable=True)
    is_published = Column(Boolean, default=False)
    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MaintenanceReport(Base):
    """AI-generated review of a vendor (FMP) changelog, for the Admin maintenance console."""
    __tablename__ = "maintenance_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vendor = Column(String(50), nullable=False, default="FMP")
    source_text = Column(Text, nullable=False)        # the pasted changelog
    report_markdown = Column(Text, nullable=False)    # Claude's assessment
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())