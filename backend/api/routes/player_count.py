"""Player Count API Routes

GUI surface for the rakna_spelare CLI: count images per named person across a
folder/glob/date-span selection.
"""

import logging
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.player_count_service import player_count_service

logger = logging.getLogger(__name__)

router = APIRouter()


class PlayerCountRequest(BaseModel):
    """Folder/glob/date-span selection plus counting options."""

    roots: List[str] = []
    globs: List[str] = []
    extension_preset: Optional[str] = None  # 'jpg' | 'nef' | 'raw' | 'images' | 'all'
    extensions: Optional[List[str]] = None  # explicit override, e.g. ['.jpg']
    recursive: bool = True
    date_from: Optional[str] = None  # YYYY-MM-DD or YYMMDD
    date_to: Optional[str] = None
    gap_minutes: int = 30
    baseline: Literal["median", "mean"] = "median"
    min_images: int = 3
    per_match: bool = False
    tranare: Optional[List[str]] = None  # override coach exclusion list
    publik: Optional[List[str]] = None  # override audience exclusion list


@router.post("/players/count")
async def count_players(request: PlayerCountRequest):
    """Resolve the selection and return per-player image counts + statistics."""
    try:
        return player_count_service.count(
            roots=request.roots,
            globs=request.globs,
            extension_preset=request.extension_preset,
            extensions=request.extensions,
            recursive=request.recursive,
            date_from=request.date_from,
            date_to=request.date_to,
            gap_minutes=request.gap_minutes,
            baseline=request.baseline,
            min_images=request.min_images,
            per_match=request.per_match,
            tranare=request.tranare,
            publik=request.publik,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Player count failed")
        raise HTTPException(status_code=500, detail=str(e))
