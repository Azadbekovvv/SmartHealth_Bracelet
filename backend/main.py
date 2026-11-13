from contextlib import asynccontextmanager
from pathlib import Path
from fastapi.staticfiles import StaticFiles

from fastapi import FastAPI

from backend import models
from backend.database import engine
from backend.routers.bracelets import router as bracelets_router
from backend.routers.auth import router as auth_router
from backend.routers.measurements import router as measurements_router
from backend.routers.locations import router as locations_router
from backend.routers.alert_rules import router as alert_rules_router
from backend.routers.notifications import router as notifications_router
from backend.routers.geofences import router as geofences_router
from fastapi.middleware.cors import CORSMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):

    yield
    engine.dispose()


app = FastAPI(
    title="Smart Bracelet API",
    description="Сервер проекта «Умный браслет»",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Device-Key"],
)

app.include_router(auth_router)
app.include_router(bracelets_router)
app.include_router(measurements_router)
app.include_router(locations_router)
app.include_router(alert_rules_router)
app.include_router(notifications_router)
app.include_router(geofences_router)


@app.get("/")
def home():
    return {"message": "Сервер умного браслета работает!"}

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

app.mount(
    "/site",
    StaticFiles(directory=str(FRONTEND_DIR), html=True),
    name="site",
)