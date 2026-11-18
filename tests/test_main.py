from fastapi.testclient import TestClient
from backend.main import app


def test_home():
    with TestClient(app) as client:
        response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {
        "message": "Сервер умного браслета работает!"
    }