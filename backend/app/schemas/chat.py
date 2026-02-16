from pydantic import BaseModel, Field


class ChatSessionCreateRequest(BaseModel):
    title: str = Field(default="新对话", min_length=1, max_length=120)
    runtime_profile_id: str | None = None


class ChatSessionUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    runtime_profile_id: str | None = None
    archived: bool | None = None


class ChatMessageCreateRequest(BaseModel):
    role: str = Field(default="user")
    content: str = Field(min_length=1)


class DesensitizationRuleCreateRequest(BaseModel):
    member_scope: str = Field(default="global", min_length=1, max_length=36)
    rule_type: str = Field(default="literal")
    pattern: str = Field(min_length=1, max_length=500)
    replacement_token: str = Field(min_length=1, max_length=100)
    enabled: bool = True
