"""
Technical Alert Schemas - Pydantic models for indicator-based alerts
"""
from pydantic import BaseModel, Field, model_validator
from typing import Dict, List, Literal, Optional, Any
from datetime import datetime


VALID_ALERT_TYPES = {
    "sentiment_shift",
    "ma_crossover",
    "rsi_extreme",
    "macd_cross",
    "bollinger_breach",
    "dcf_valuation",
    "rule_of_40",
}

ALERT_TYPE_LABELS = {
    "sentiment_shift": "Sentiment Shift",
    "ma_crossover": "MA Crossover",
    "rsi_extreme": "RSI Extreme",
    "macd_cross": "MACD Cross",
    "bollinger_breach": "Bollinger Band Breach",
    "dcf_valuation": "DCF Valuation",
    "rule_of_40": "Rule of 40",
}


def _validate_config(alert_type: str, config: dict) -> dict:
    """Validate config shape against alert_type. Returns cleaned config."""
    if alert_type == "sentiment_shift":
        target = config.get("target_outlook")
        if target not in ("bullish", "bearish", "neutral"):
            raise ValueError("sentiment_shift requires config.target_outlook: 'bullish', 'bearish', or 'neutral'")
        return {"target_outlook": target}

    elif alert_type == "ma_crossover":
        cross_type = config.get("cross_type")
        if cross_type not in ("golden_cross", "death_cross"):
            raise ValueError("ma_crossover requires config.cross_type: 'golden_cross' or 'death_cross'")
        return {"cross_type": cross_type}

    elif alert_type == "rsi_extreme":
        direction = config.get("direction")
        if direction not in ("above", "below"):
            raise ValueError("rsi_extreme requires config.direction: 'above' or 'below'")
        threshold = config.get("threshold")
        if threshold is None:
            threshold = 70 if direction == "above" else 30
        threshold = float(threshold)
        if direction == "above" and not (60 <= threshold <= 90):
            raise ValueError("rsi_extreme 'above' threshold must be between 60-90")
        if direction == "below" and not (10 <= threshold <= 40):
            raise ValueError("rsi_extreme 'below' threshold must be between 10-40")
        return {"direction": direction, "threshold": threshold}

    elif alert_type == "macd_cross":
        cross_type = config.get("cross_type")
        if cross_type not in ("bullish", "bearish"):
            raise ValueError("macd_cross requires config.cross_type: 'bullish' or 'bearish'")
        return {"cross_type": cross_type}

    elif alert_type == "bollinger_breach":
        breach_type = config.get("breach_type")
        if breach_type not in ("upper", "lower"):
            raise ValueError("bollinger_breach requires config.breach_type: 'upper' or 'lower'")
        return {"breach_type": breach_type}

    elif alert_type == "dcf_valuation":
        target = config.get("target_rating")
        if target not in ("strong_buy", "buy", "sell", "strong_sell"):
            raise ValueError("dcf_valuation requires config.target_rating: 'strong_buy', 'buy', 'sell', or 'strong_sell'")
        return {"target_rating": target}

    elif alert_type == "rule_of_40":
        direction = config.get("direction")
        if direction not in ("above", "below"):
            raise ValueError("rule_of_40 requires config.direction: 'above' or 'below'")
        threshold = config.get("threshold")
        if threshold is None:
            threshold = 40
        threshold = float(threshold)
        if not (0 <= threshold <= 100):
            raise ValueError("rule_of_40 threshold must be between 0-100")
        return {"direction": direction, "threshold": threshold}

    raise ValueError(f"Unknown alert_type: {alert_type}")


def _config_display(alert_type: str, config: dict, ticker: str) -> str:
    """Human-readable description of what the alert watches for."""
    if alert_type == "sentiment_shift":
        return f"Alert when {ticker} outlook turns {config['target_outlook']}"
    elif alert_type == "ma_crossover":
        label = "Golden Cross (SMA20 > SMA50)" if config["cross_type"] == "golden_cross" else "Death Cross (SMA20 < SMA50)"
        return f"Alert on {ticker} {label}"
    elif alert_type == "rsi_extreme":
        label = f"RSI crosses {'above' if config['direction'] == 'above' else 'below'} {config['threshold']:.0f}"
        return f"Alert when {ticker} {label}"
    elif alert_type == "macd_cross":
        label = "bullish cross (histogram turns positive)" if config["cross_type"] == "bullish" else "bearish cross (histogram turns negative)"
        return f"Alert on {ticker} MACD {label}"
    elif alert_type == "bollinger_breach":
        label = "upper band" if config["breach_type"] == "upper" else "lower band"
        return f"Alert when {ticker} breaks {label}"
    elif alert_type == "dcf_valuation":
        label = config["target_rating"].replace("_", " ").title()
        return f"Alert when {ticker} DCF rating turns {label}"
    elif alert_type == "rule_of_40":
        dir_label = "rises above" if config["direction"] == "above" else "drops below"
        return f"Alert when {ticker} Rule of 40 {dir_label} {config['threshold']:.0f}"
    return ""


class TechnicalAlertCreate(BaseModel):
    """Create a technical indicator alert"""
    ticker: str = Field(..., min_length=1, max_length=10)
    alert_type: str = Field(..., description="Type of technical alert")
    config: dict = Field(..., description="Alert-type-specific configuration")
    notes: Optional[str] = Field(None, max_length=500)
    sms_enabled: bool = Field(False, description="Send SMS text when this alert triggers")

    @model_validator(mode="after")
    def validate_alert_config(self):
        if self.alert_type not in VALID_ALERT_TYPES:
            raise ValueError(f"alert_type must be one of: {', '.join(sorted(VALID_ALERT_TYPES))}")
        self.config = _validate_config(self.alert_type, self.config)
        return self


class TechnicalAlertUpdate(BaseModel):
    """Update a technical alert (config is immutable — delete and recreate)"""
    is_active: Optional[bool] = None
    sms_enabled: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=500)


class TechnicalAlertResponse(BaseModel):
    """Technical alert response"""
    id: str
    ticker: str
    alert_type: str
    config: dict
    last_state: Optional[dict] = None
    is_active: bool
    sms_enabled: bool = False
    triggered_at: Optional[datetime] = None
    trigger_details: Optional[dict] = None
    notes: Optional[str] = None
    created_at: datetime

    # Computed display fields
    alert_type_display: str = ""
    config_display: str = ""

    class Config:
        from_attributes = True


class TechnicalAlertsSummary(BaseModel):
    """Technical alerts list response"""
    alerts: List[TechnicalAlertResponse]
    total_alerts: int
    active_alerts: int
    triggered_alerts: int
    indicator_alerts_used: int
    indicator_alerts_limit: int
