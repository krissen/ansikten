"""
FastAPI Backend Server

Main entry point for the Bildvisare backend API.
Provides REST endpoints and WebSocket streaming for face detection.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Lifespan event handler
@asynccontextmanager
async def lifespan(app: FastAPI):
    import os
    import time
    import asyncio
    from .services.startup_service import get_startup_state, LoadingState
    
    startup_start = time.perf_counter()
    startup_state = get_startup_state()
    port = int(os.getenv('BILDVISARE_PORT', '5001'))
    logger.info("Bildvisare Backend API starting up...")
    logger.info(f"Server ready on http://127.0.0.1:{port}")
    
    def _load_database_sync():
        """Sync function for thread pool - loads database"""
        from .services.management_service import get_management_service
        svc = get_management_service()
        return len(svc.known_faces)
    
    def _warmup_ml_sync():
        """Sync function for thread pool - initializes ML backend"""
        from .services.detection_service import detection_service
        _ = detection_service.backend
        return detection_service.backend.backend_name
    
    async def preload_database():
        t0 = time.perf_counter()
        startup_state.set_state("database", LoadingState.LOADING, "Loading face database...")
        try:
            people_count = await asyncio.to_thread(_load_database_sync)
            elapsed = time.perf_counter() - t0
            startup_state.set_state("database", LoadingState.READY, 
                                    f"Loaded {people_count} people")
            logger.info(f"[Startup Profile] Database loaded in {elapsed:.2f}s")
        except Exception as e:
            logger.error(f"Failed to pre-load database: {e}", exc_info=True)
            startup_state.set_state("database", LoadingState.ERROR, 
                                    "Failed to load database", error=str(e))
    
    async def warmup_ml_models():
        t0 = time.perf_counter()
        startup_state.set_state("mlModels", LoadingState.LOADING, "Loading ML models...")
        try:
            backend_name = await asyncio.to_thread(_warmup_ml_sync)
            elapsed = time.perf_counter() - t0
            startup_state.set_state("mlModels", LoadingState.READY, 
                                    f"Loaded {backend_name}")
            logger.info(f"[Startup Profile] ML models loaded in {elapsed:.2f}s")
            logger.info(f"[Startup Profile] Total startup time: {time.perf_counter() - startup_start:.2f}s")
        except Exception as e:
            logger.error(f"Failed to warm up ML models: {e}", exc_info=True)
            startup_state.set_state("mlModels", LoadingState.ERROR,
                                    "Failed to load ML models", error=str(e))
    
    asyncio.create_task(preload_database())
    asyncio.create_task(warmup_ml_models())
    
    # Setup WS broadcast for startup status changes
    from .websocket.progress import setup_startup_listener
    setup_startup_listener()
    
    yield
    logger.info("Bildvisare Backend API shutting down...")

# Create FastAPI app
app = FastAPI(
    title="Bildvisare Backend API",
    description="Face detection and annotation API for Bildvisare image viewer",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS - only allow localhost (all ports)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint for backend readiness"""
    return {"status": "ok", "service": "bildvisare-backend"}



# Import routes
from .routes import detection, status, database, statistics, management, preprocessing, files, startup
app.include_router(detection.router, prefix="/api", tags=["detection"])
app.include_router(status.router, prefix="/api", tags=["status"])
app.include_router(database.router, prefix="/api", tags=["database"])
app.include_router(statistics.router, prefix="/api", tags=["statistics"])
app.include_router(management.router, prefix="/api", tags=["management"])
app.include_router(preprocessing.router, prefix="/api/preprocessing", tags=["preprocessing"])
app.include_router(files.router, prefix="/api", tags=["files"])
app.include_router(startup.router, prefix="/api", tags=["startup"])

# WebSocket endpoint
from .websocket import progress
app.include_router(progress.router)

if __name__ == "__main__":
    import uvicorn
    import os

    # Get port from environment variable, default to 5001
    port = int(os.getenv('BILDVISARE_PORT', '5001'))

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
