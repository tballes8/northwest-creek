"""Pydantic schemas for sector rotation heatmap endpoints."""
from typing import Optional
from pydantic import BaseModel


class SectorReturn(BaseModel):
    ticker: str
    name: str
    return_pct: Optional[float]
    vs_spy_pct: Optional[float]


class HeatmapResponse(BaseModel):
    as_of: str
    window: str
    spy_return_pct: Optional[float]
    sectors: list[SectorReturn]


class TimelapseFrame(BaseModel):
    date: str
    spy_return_pct: Optional[float]
    sectors: list[SectorReturn]


class TimelapseResponse(BaseModel):
    window: str
    step_days: int
    end_date: str
    frames: list[TimelapseFrame]


class CyclePhaseSignal(BaseModel):
    key: str
    label: str
    value: str
    # The period the reading covers ("Q3 2026", "Sep 2026", "Nov 14, 2026")
    period: str
    # FRED's date for it: the first day of the period for monthly/quarterly series
    observation_date: str
    interpretation: str


class CyclePhaseResponse(BaseModel):
    phase: str
    confidence: str
    summary: str
    supporting_signals: list[CyclePhaseSignal]
    sector_alignment: str
    # The sector returns the alignment reads: window and its last trading session
    sector_window: str
    sector_as_of: Optional[str] = None
    # The day the analysis was generated
    as_of: str
    disclaimer: str
