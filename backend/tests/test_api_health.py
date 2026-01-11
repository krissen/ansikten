"""
Tests for API health and basic endpoints.

Note: The health endpoint returns status based on startup state:
- "ok": All components ready
- "starting": Components still loading (expected during tests)
- "degraded": Some component has an error
"""

import pytest
from fastapi.testclient import TestClient

from api.server import app


@pytest.fixture
def client():
    return TestClient(app)


def test_health_endpoint(client):
    """Health endpoint should return valid response with expected fields."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    # Status can be "ok", "starting", or "degraded" depending on startup state
    assert data["status"] in ("ok", "starting", "degraded")
    assert "version" in data
    assert data["service"] == "ansikten-backend"
    # Components should be present
    assert "components" in data


def test_health_endpoint_has_components(client):
    """Health endpoint should include component status information."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    components = data.get("components", {})
    # These components are registered in startup_service
    expected_components = {"database", "mlModels"}
    assert expected_components.issubset(set(components.keys()))


def test_api_returns_json(client):
    """API endpoints should return valid JSON."""
    response = client.get("/health")
    assert response.headers["content-type"] == "application/json"
    # Should be parseable as JSON
    data = response.json()
    assert isinstance(data, dict)
