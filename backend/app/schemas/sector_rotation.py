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
