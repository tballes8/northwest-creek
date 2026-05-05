"""Sector rotation heatmap API endpoints.

Read-only views over the sector_etf_daily_closes table populated by the
fetch_daily_snapshots cron. Open to all authenticated paid users.
"""
import time
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import get_current_user
from app.schemas.sector_rotation import (
    CyclePhaseResponse,
    HeatmapResponse,
    TimelapseResponse,
)
from app.services import sector_rotation
from app.services.cycle_phase_analyzer import synthesize_cycle_phase

router = APIRouter()

VALID_WINDOWS = {"1D", "1W", "1M", "3M", "6M", "1Y"}

# System-wide 24h cache for cycle phase synthesis. The answer is the same for
# every user on a given day — no point regenerating per request.
_CYCLE_PHASE_TTL = 24 * 3600
_cycle_phase_cache: dict[str, tuple[float, dict]] = {}


@router.get("/heatmap", response_model=HeatmapResponse)
async def get_heatmap(
    window: str = Query(default="1M", description="Lookback window: 1D, 1W, 1M, 3M, 6M, 1Y"),
    end_date: date | None = Query(default=None, description="As-of date (default: today)"),
    current_user = Depends(get_current_user),
):
    if window not in VALID_WINDOWS:
        raise HTTPException(status_code=422, detail=f"Invalid window. Use one of: {sorted(VALID_WINDOWS)}")
    target_date = end_date or date.today()
    try:
        return await sector_rotation.compute_relative_returns(target_date, window)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error computing heatmap: {e}")


@router.get("/timelapse", response_model=TimelapseResponse)
async def get_timelapse(
    window: str = Query(default="1M", description="Trailing return window per frame"),
    end_date: date | None = Query(default=None, description="As-of date (default: today)"),
    step_days: int = Query(default=1, ge=1, le=30, description="Days between frames"),
    current_user = Depends(get_current_user),
):
    if window not in VALID_WINDOWS:
        raise HTTPException(status_code=422, detail=f"Invalid window. Use one of: {sorted(VALID_WINDOWS)}")
    target_date = end_date or date.today()
    try:
        return await sector_rotation.compute_timelapse_frames(target_date, window, step_days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error computing timelapse: {e}")


@router.get("/cycle-phase", response_model=CyclePhaseResponse)
async def get_cycle_phase(
    current_user = Depends(get_current_user),
):
    """AI-synthesized economic cycle phase based on FRED macro indicators and
    current sector rotation. System-wide 24h cache — one upstream Anthropic call
    per day regardless of traffic. Returns 503 if synthesis is unavailable so the
    frontend can hide the panel cleanly."""
    today_key = date.today().isoformat()
    cached = _cycle_phase_cache.get(today_key)
    if cached is not None:
        ts, payload = cached
        if time.time() - ts < _CYCLE_PHASE_TTL:
            return payload

    payload = await synthesize_cycle_phase(date.today())
    if payload is None:
        raise HTTPException(
            status_code=503,
            detail="Cycle phase analysis is temporarily unavailable.",
        )

    _cycle_phase_cache[today_key] = (time.time(), payload)
    # Drop stale day-keys to keep the dict bounded
    for k in list(_cycle_phase_cache.keys()):
        if k != today_key:
            _cycle_phase_cache.pop(k, None)
    return payload
