"""Sector rotation heatmap API endpoints.

Read-only views over the sector_etf_daily_closes table populated by the
fetch_daily_snapshots cron. Open to all authenticated paid users.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import get_current_user
from app.schemas.sector_rotation import HeatmapResponse, TimelapseResponse
from app.services import sector_rotation

router = APIRouter()

VALID_WINDOWS = {"1D", "1W", "1M", "3M", "6M", "1Y"}


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
