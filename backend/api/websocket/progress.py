"""
WebSocket Progress Streaming

Real-time progress updates for face detection and processing.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Set
import logging
import json

logger = logging.getLogger(__name__)
router = APIRouter()

# Active WebSocket connections
active_connections: Set[WebSocket] = set()

@router.websocket("/ws/progress")
async def websocket_progress(websocket: WebSocket):
    """
    WebSocket endpoint for real-time progress updates

    Events emitted:
    - log-entry: Backend log messages
    - detection-progress: Face detection progress percentage
    - face-detected: New face detected event
    - face-confirmed: Face identity confirmed event
    - startup-status: Startup state changes (KASAM UX)
    """
    await websocket.accept()
    active_connections.add(websocket)
    logger.info(f"[WebSocket] Client connected (total: {len(active_connections)})")

    try:
        await websocket.send_text(json.dumps({
            "event": "connected",
            "data": {"message": "WebSocket connection established"}
        }))

        # Send current startup status immediately
        from ..services.startup_service import get_startup_state
        startup_status = get_startup_state().get_status()
        await websocket.send_text(json.dumps({
            "event": "startup-status",
            "data": startup_status
        }))

        while True:
            data = await websocket.receive_text()
            logger.debug(f"[WebSocket] Received: {data}")

    except WebSocketDisconnect:
        active_connections.remove(websocket)
        logger.info(f"[WebSocket] Client disconnected (total: {len(active_connections)})")

async def broadcast_event(event_name: str, data: dict):
    """
    Broadcast event to all connected WebSocket clients

    Args:
        event_name: Name of the event
        data: Event payload
    """
    if not active_connections:
        return

    message = json.dumps({
        "event": event_name,
        "data": data
    })

    disconnected = set()
    for connection in active_connections:
        try:
            await connection.send_text(message)
        except Exception as e:
            logger.error(f"[WebSocket] Error sending to client: {e}")
            disconnected.add(connection)

    # Remove disconnected clients
    for connection in disconnected:
        active_connections.remove(connection)

async def send_log_entry(level: str, message: str):
    """Send log entry to all connected clients"""
    await broadcast_event("log-entry", {
        "level": level,
        "message": message,
        "timestamp": None
    })


async def broadcast_startup_status(status: dict):
    """Broadcast startup status change to all connected clients (KASAM UX)"""
    await broadcast_event("startup-status", status)


def setup_startup_listener():
    """Hook up StartupState listener to broadcast WS events"""
    from ..services.startup_service import get_startup_state
    startup_state = get_startup_state()
    startup_state.add_listener(broadcast_startup_status)
