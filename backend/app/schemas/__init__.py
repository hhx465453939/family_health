"""Pydantic schemas."""

from app.schemas.agent import AgentQaRequest
from app.schemas.auth import (
    BootstrapOwnerRequest,
    CreateUserRequest,
    LoginRequest,
    RefreshRequest,
    UpdateRoleRequest,
    UpdateStatusRequest,
)
from app.schemas.chat import (
    ChatMessageCreateRequest,
    ChatSessionCreateRequest,
    ChatSessionUpdateRequest,
    DesensitizationRuleCreateRequest,
)
from app.schemas.export import ExportCreateRequest
from app.schemas.knowledge_base import (
    KnowledgeBaseBuildDocument,
    KnowledgeBaseBuildRequest,
    KnowledgeBaseCreateRequest,
    RetrievalQueryRequest,
)
from app.schemas.model_registry import (
    ProviderCreateRequest,
    ProviderUpdateRequest,
    RefreshModelsRequest,
    RuntimeProfileCreateRequest,
    RuntimeProfileUpdateRequest,
)
from app.schemas.mcp import (
    AgentBindingUpdateRequest,
    McpServerCreateRequest,
    McpServerUpdateRequest,
)

__all__ = [
    "AgentQaRequest",
    "BootstrapOwnerRequest",
    "ChatMessageCreateRequest",
    "ChatSessionCreateRequest",
    "ChatSessionUpdateRequest",
    "CreateUserRequest",
    "DesensitizationRuleCreateRequest",
    "ExportCreateRequest",
    "KnowledgeBaseBuildDocument",
    "KnowledgeBaseBuildRequest",
    "KnowledgeBaseCreateRequest",
    "LoginRequest",
    "ProviderCreateRequest",
    "ProviderUpdateRequest",
    "RefreshModelsRequest",
    "RefreshRequest",
    "RetrievalQueryRequest",
    "RuntimeProfileCreateRequest",
    "RuntimeProfileUpdateRequest",
    "AgentBindingUpdateRequest",
    "McpServerCreateRequest",
    "McpServerUpdateRequest",
    "UpdateRoleRequest",
    "UpdateStatusRequest",
]
