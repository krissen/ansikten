"""Culling API Routes

Stats-driven culling workspace: list a player's image files and soft-delete /
restore them via the app-managed trash.
"""

import logging
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.culling_service import culling_service

logger = logging.getLogger(__name__)

router = APIRouter()


class CullingFilesRequest(BaseModel):
    roots: List[str] = []
    globs: List[str] = []
    extension_preset: Optional[str] = "jpg"
    recursive: bool = True
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    player: Optional[str] = None
    name_glob: Optional[str] = None


class TrashRequest(BaseModel):
    paths: List[str]


class RestoreRequest(BaseModel):
    ids: List[str]


class EmptyRequest(BaseModel):
    ids: Optional[List[str]] = None


@router.post("/culling/files")
async def list_files(request: CullingFilesRequest):
    """List image files for the current filter, optionally restricted to a player."""
    try:
        return culling_service.list_files(
            roots=request.roots,
            globs=request.globs,
            extension_preset=request.extension_preset,
            recursive=request.recursive,
            date_from=request.date_from,
            date_to=request.date_to,
            player=request.player,
            name_glob=request.name_glob,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Culling list failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/culling/trash")
async def trash(request: TrashRequest):
    """Soft-delete files to the app trash."""
    try:
        return culling_service.trash(request.paths)
    except Exception as e:
        logger.exception("Culling trash failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/culling/trash")
async def list_trash():
    """List items currently in the app trash."""
    try:
        return culling_service.list_trash()
    except Exception as e:
        logger.exception("Culling list-trash failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/culling/restore")
async def restore(request: RestoreRequest):
    """Restore trashed items to their original locations."""
    try:
        return culling_service.restore(request.ids)
    except Exception as e:
        logger.exception("Culling restore failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/culling/empty")
async def empty(request: EmptyRequest):
    """Permanently delete trashed items (all, or the given ids)."""
    try:
        return culling_service.empty(request.ids)
    except Exception as e:
        logger.exception("Culling empty failed")
        raise HTTPException(status_code=500, detail=str(e))
