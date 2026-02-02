"""
Daily Snapshot Schemas
"""
from pydantic import BaseModel
from datetime import date
from typing import List


class DailySnapshotItem(BaseModel):
    ticker: str
    open_price: float
    close_price: float
    change_percent: float
    snapshot_date: date
    
    class Config:
        from_attributes = True


class DailySnapshotResponse(BaseModel):
    snapshots: List[DailySnapshotItem]
    total_count: int
    snapshot_date: date