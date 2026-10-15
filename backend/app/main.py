"""Orvella API. In production it also serves the built frontend (frontend/dist) with an SPA fallback."""
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import Base, _is_sqlite, engine
import asyncio
from contextlib import asynccontextmanager

from .routers import admin, auth, bantuan, desk, duel, google, kolab, learner, livequiz, mentor, orvi, player, sandbox, social, studio, webproj, workspace
from .services.presence import sweeper
from .services.runner import RunnerUnavailable

# PostgreSQL is managed by Alembic (python -m app.migrate). A local SQLite dev database is created on the fly.
if _is_sqlite:
    Base.metadata.create_all(engine)

@asynccontextmanager
async def lifespan(_: FastAPI):
    from .services.presence import hub
    hub.loop = asyncio.get_running_loop()  # route sync mendorong pesan realtime lewat loop ini
    task = asyncio.create_task(sweeper())  # drops silent presence connections
    yield
    task.cancel()


app = FastAPI(title="Orvella API", version="1.0.0", lifespan=lifespan)

for r in (auth.router, learner.router, player.router, player.ws_router, workspace.router, webproj.router, sandbox.router, social.router,
          social.ws_router, studio.router, mentor.router, admin.router, desk.router, google.router, kolab.router, kolab.ws_router, duel.router, bantuan.router, livequiz.router, livequiz.ws_router, orvi.router):
    app.include_router(r)


@app.exception_handler(RunnerUnavailable)
def _runner_down(_: Request, exc: RunnerUnavailable) -> JSONResponse:
    return JSONResponse({"detail": {"code": "runner", "message": str(exc)}}, status_code=503)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


dist = settings.frontend_dist
if dist.exists():
    if (dist / "assets").exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        if full_path.startswith(("api/", "ws/")):
            raise HTTPException(404)
        f = (dist / full_path).resolve()
        if full_path and f.is_file() and dist.resolve() in f.parents:
            return FileResponse(f)
        return FileResponse(dist / "index.html")
