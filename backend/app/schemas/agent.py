from pydantic import BaseModel, Field


class AgentQaRequest(BaseModel):
    session_id: str
    query: str = Field(default="")
    kb_id: str | None = None
    background_prompt: str | None = None
    enabled_mcp_ids: list[str] | None = None
    runtime_profile_id: str | None = None
    attachments_ids: list[str] | None = None
