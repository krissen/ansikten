"""
Encoding Refinement API Routes

Provides endpoints for filtering outlier encodings and repairing
shape inconsistencies in the face database.
"""

import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..services.refinement_service import refinement_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ============ Request/Response Models ============


class PreviewEntry(BaseModel):
    """Preview result for one person+backend combination."""
    person: str
    backend: str
    total: int
    keep: int
    remove: int
    remove_indices: List[int]
    reason: str


class PreviewSummary(BaseModel):
    """Summary of preview results."""
    total_people: int
    affected_people: int
    total_remove: int


class PreviewResponse(BaseModel):
    """Response for preview endpoint."""
    preview: List[PreviewEntry]
    summary: PreviewSummary


class ApplyRequest(BaseModel):
    """Request to apply filtering."""
    mode: str = "std"
    backend_filter: Optional[str] = None
    persons: Optional[List[str]] = None
    std_threshold: float = 2.0
    cluster_dist: Optional[float] = None
    cluster_min: int = 6
    min_encodings: int = 8
    dry_run: bool = False


class ApplyResponse(BaseModel):
    """Response for apply endpoint."""
    status: str
    dry_run: bool
    removed: int
    by_person: Dict[str, int]
    by_backend: Dict[str, int]


class RepairShapesRequest(BaseModel):
    """Request to repair shapes."""
    persons: Optional[List[str]] = None
    dry_run: bool = False


class RepairedEntry(BaseModel):
    """Details of shape repair for one person."""
    person: str
    removed: int
    total: int
    kept_shape: List[int]
    removed_shapes: List[List[int]]


class RepairShapesResponse(BaseModel):
    """Response for repair-shapes endpoint."""
    status: str
    dry_run: bool
    total_removed: int
    repaired: List[RepairedEntry]


# ============ API Endpoints ============


@router.get("/refinement/preview", response_model=PreviewResponse)
async def preview_refinement(
    person: Optional[str] = Query(None, description="Person name or * for all"),
    mode: str = Query("std", description="Filter mode: std, cluster, or shape"),
    backend: Optional[str] = Query(None, alias="backend_filter", description="dlib, insightface, or null for all"),
    std_threshold: float = Query(2.0, description="Standard deviations for outlier detection"),
    cluster_dist: Optional[float] = Query(None, description="Max distance from centroid (null = backend default)"),
    cluster_min: int = Query(6, description="Minimum cluster size"),
    min_encodings: int = Query(8, description="Skip filtering if fewer encodings")
):
    """
    Preview what encodings would be removed.

    Returns per-person, per-backend breakdown of what would be filtered.
    Does not modify the database.

    Modes:
    - std: Remove encodings > N standard deviations from centroid
    - cluster: Keep only tight cluster around centroid
    - shape: Remove encodings with non-majority shape
    """
    try:
        logger.info(f"[Refinement] Preview: person={person}, mode={mode}, backend={backend}")
        result = await refinement_service.preview(
            person=person,
            mode=mode,
            backend_filter=backend,
            std_threshold=std_threshold,
            cluster_dist=cluster_dist,
            cluster_min=cluster_min,
            min_encodings=min_encodings
        )
        return PreviewResponse(
            preview=[PreviewEntry(**p) for p in result["preview"]],
            summary=PreviewSummary(**result["summary"])
        )

    except Exception as e:
        logger.error(f"[Refinement] Error in preview: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refinement/apply", response_model=ApplyResponse)
async def apply_refinement(request: ApplyRequest):
    """
    Apply filtering to remove outlier encodings.

    Uses backend-aware distance metrics:
    - dlib: Euclidean distance
    - insightface: Cosine distance

    Set dry_run=true to preview without saving.
    """
    try:
        logger.info(f"[Refinement] Apply: mode={request.mode}, dry_run={request.dry_run}")
        result = await refinement_service.apply(
            mode=request.mode,
            backend_filter=request.backend_filter,
            persons=request.persons,
            std_threshold=request.std_threshold,
            cluster_dist=request.cluster_dist,
            cluster_min=request.cluster_min,
            min_encodings=request.min_encodings,
            dry_run=request.dry_run
        )
        return ApplyResponse(**result)

    except ValueError as e:
        logger.error(f"[Refinement] Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[Refinement] Error applying refinement: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refinement/repair-shapes", response_model=RepairShapesResponse)
async def repair_shapes(request: RepairShapesRequest):
    """
    Repair inconsistent encoding shapes.

    For each person, finds the most common shape and removes
    encodings with different shapes.

    WARNING: If you've migrated from dlib to InsightFace, the
    minority backend's encodings may be removed. Use preview
    to verify before applying.
    """
    try:
        logger.info(f"[Refinement] Repair shapes: dry_run={request.dry_run}")
        result = await refinement_service.repair_shapes(
            persons=request.persons,
            dry_run=request.dry_run
        )
        return RepairShapesResponse(
            status=result["status"],
            dry_run=result["dry_run"],
            total_removed=result["total_removed"],
            repaired=[RepairedEntry(**r) for r in result["repaired"]]
        )

    except ValueError as e:
        logger.error(f"[Refinement] Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[Refinement] Error repairing shapes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
