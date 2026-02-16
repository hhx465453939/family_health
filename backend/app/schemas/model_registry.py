from pydantic import BaseModel, Field


class ProviderCreateRequest(BaseModel):
    provider_name: str = Field(min_length=1, max_length=64)
    base_url: str = Field(min_length=1, max_length=500)
    api_key: str = Field(min_length=1, max_length=500)
    enabled: bool = True


class ProviderUpdateRequest(BaseModel):
    base_url: str | None = Field(default=None, min_length=1, max_length=500)
    api_key: str | None = Field(default=None, min_length=1, max_length=500)
    enabled: bool | None = None


class RefreshModelsRequest(BaseModel):
    manual_models: list[str] | None = None


class RuntimeProfileCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    llm_model_id: str | None = None
    embedding_model_id: str | None = None
    reranker_model_id: str | None = None
    params: dict = Field(default_factory=dict)
    is_default: bool = False


class RuntimeProfileUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    llm_model_id: str | None = None
    embedding_model_id: str | None = None
    reranker_model_id: str | None = None
    params: dict | None = None
    is_default: bool | None = None
