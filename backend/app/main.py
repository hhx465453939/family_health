from uuid import uuid4

from fastapi import FastAPI, Request

from app.api.v1.router import api_router
from app.core.database import Base, engine
from app.core.paths import raw_vault_root, sanitized_workspace_root
import app.models  # noqa: F401

app = FastAPI(title="Family Health Backend")


@app.middleware("http")
async def add_trace_id(request: Request, call_next):
    request.state.trace_id = str(uuid4())
    response = await call_next(request)
    response.headers["X-Trace-Id"] = request.state.trace_id
    return response


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    raw_vault_root()
    sanitized_workspace_root()


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(api_router)
