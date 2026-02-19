from pydantic import BaseModel, Field


class ChatSessionCreateRequest(BaseModel):
    title: str = Field(default="New Chat", min_length=1, max_length=120)
    runtime_profile_id: str | None = None
    role_id: str | None = None
    background_prompt: str | None = Field(default=None, max_length=20000)
    reasoning_enabled: bool | None = None
    reasoning_budget: int | None = Field(default=None, ge=0, le=131072)
    show_reasoning: bool = True
    context_message_limit: int = Field(default=20, ge=1, le=100)
    default_enabled_mcp_ids: list[str] = Field(default_factory=list)


class ChatSessionUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    runtime_profile_id: str | None = None
    role_id: str | None = None
    background_prompt: str | None = Field(default=None, max_length=20000)
    reasoning_enabled: bool | None = None
    reasoning_budget: int | None = Field(default=None, ge=0, le=131072)
    show_reasoning: bool | None = None
    context_message_limit: int | None = Field(default=None, ge=1, le=100)
    archived: bool | None = None
    default_enabled_mcp_ids: list[str] | None = None


class ChatBulkSessionRequest(BaseModel):
    session_ids: list[str] = Field(default_factory=list)


class ChatMessageCreateRequest(BaseModel):
    role: str = Field(default="user")
    content: str = Field(min_length=1)


class DesensitizationRuleCreateRequest(BaseModel):
    member_scope: str = Field(default="global", min_length=1, max_length=36)
    rule_type: str = Field(default="literal")
    pattern: str = Field(min_length=1, max_length=500)
    replacement_token: str = Field(min_length=1, max_length=100)
    tag: str | None = Field(default=None, max_length=40)
    enabled: bool = True


class DesensitizationRuleUpdateRequest(BaseModel):
    member_scope: str | None = Field(default=None, min_length=1, max_length=36)
    rule_type: str | None = Field(default=None)
    pattern: str | None = Field(default=None, min_length=1, max_length=500)
    replacement_token: str | None = Field(default=None, min_length=1, max_length=100)
    tag: str | None = Field(default=None, max_length=40)
    enabled: bool | None = None
