/**
 * Shared type definitions for Ansikten monorepo.
 *
 * These types mirror the Python definitions in types.py.
 * Keep in sync when making changes.
 */

export enum FaceDetectionStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed"
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceAnnotation {
  imagePath: string;
  bbox: BoundingBox;
  personName?: string;
  confidence?: number;  // Default 1.0 for manual annotations
}

export interface DetectedFace {
  imagePath: string;
  bbox: BoundingBox;
  personName?: string;
  confidence: number;
  encoding?: number[];
}

export interface ImageStatus {
  imagePath: string;
  status: FaceDetectionStatus;
  facesDetected: number;
  timestamp: number;
  errorMessage?: string;
}

export interface MatchAlternative {
  name: string;
  distance: number;
  confidence: number;
  is_ignored?: boolean;
}

export interface DetectedFaceResult {
  face_id: string;
  bounding_box: BoundingBox;
  confidence: number;
  person_name?: string | null;
  is_confirmed?: boolean;
  match_case?: string | null;
  ignore_distance?: number | null;
  ignore_confidence?: number | null;
  match_alternatives?: MatchAlternative[] | null;
  encoding_hash?: string | null;
}

export interface DetectionResult {
  image_path: string;
  faces: DetectedFaceResult[];
  processing_time_ms: number;
  cached?: boolean;
  file_hash?: string | null;
}

export interface ReviewedFace {
  face_index: number;
  face_id: string;
  encoding_hash?: string | null;
  person_name?: string | null;
  is_ignored?: boolean;
}

export interface MarkReviewCompleteRequest {
  image_path: string;
  reviewed_faces: ReviewedFace[];
  file_hash?: string | null;
}
