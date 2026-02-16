from pydantic import BaseModel, Field


class AgentQaRequest(BaseModel):
    session_id: str
    query: str = Field(min_length=1)
    enabled_mcp_ids: list[str] | None = None
    runtime_profile_id: str | None = None
    attachments_ids: list[str] | None = None
