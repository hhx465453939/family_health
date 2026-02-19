from fastapi import APIRouter

from app.api.v1.agent import router as agent_router
from app.api.v1.auth import router as auth_router
from app.api.v1.chat import router as chat_router
from app.api.v1.export import router as export_router
from app.api.v1.file_preview import router as file_preview_router
from app.api.v1.knowledge_base import router as knowledge_base_router
from app.api.v1.mcp import router as mcp_router
from app.api.v1.model_registry import router as model_registry_router
from app.api.v1.retrieval import router as retrieval_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(chat_router, tags=["chat"])
api_router.include_router(agent_router, tags=["agent"])
api_router.include_router(model_registry_router, tags=["model-registry"])
api_router.include_router(mcp_router, tags=["mcp"])
api_router.include_router(knowledge_base_router, tags=["knowledge-base"])
api_router.include_router(retrieval_router, tags=["retrieval"])
api_router.include_router(export_router, tags=["export"])
api_router.include_router(file_preview_router, tags=["file-preview"])
