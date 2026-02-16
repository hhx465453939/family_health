from pydantic import BaseModel, Field


class McpServerCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    endpoint: str = Field(min_length=1, max_length=500)
    auth_type: str = Field(default="none", min_length=1, max_length=32)
    auth_payload: str | None = Field(default=None, max_length=1000)
    enabled: bool = True
    timeout_ms: int = Field(default=8000, ge=100, le=60000)


class McpServerUpdateRequest(BaseModel):
    endpoint: str | None = Field(default=None, min_length=1, max_length=500)
    auth_type: str | None = Field(default=None, min_length=1, max_length=32)
    auth_payload: str | None = Field(default=None, max_length=1000)
    enabled: bool | None = None
    timeout_ms: int | None = Field(default=None, ge=100, le=60000)


class AgentBindingUpdateRequest(BaseModel):
    mcp_server_ids: list[str] = Field(default_factory=list)
