from pydantic import BaseModel, Field


class KnowledgeBaseCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    member_scope: str = Field(default="global", min_length=1, max_length=36)
    chunk_size: int = Field(default=1000, ge=200, le=4000)
    chunk_overlap: int = Field(default=150, ge=0, le=1000)
    top_k: int = Field(default=8, ge=1, le=50)
    rerank_top_n: int = Field(default=4, ge=1, le=20)
    embedding_model_id: str | None = None
    reranker_model_id: str | None = None
    semantic_model_id: str | None = None
    use_global_defaults: bool = True
    retrieval_strategy: str = Field(default="hybrid", pattern="^(keyword|semantic|hybrid)$")
    keyword_weight: float = Field(default=0.5, ge=0, le=1)
    semantic_weight: float = Field(default=0.5, ge=0, le=1)
    rerank_weight: float = Field(default=0.0, ge=0, le=1)
    strategy_params: dict[str, float | int | str | bool] | None = None


class KnowledgeBaseUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    chunk_size: int | None = Field(default=None, ge=200, le=4000)
    chunk_overlap: int | None = Field(default=None, ge=0, le=1000)
    top_k: int | None = Field(default=None, ge=1, le=50)
    rerank_top_n: int | None = Field(default=None, ge=1, le=20)
    embedding_model_id: str | None = None
    reranker_model_id: str | None = None
    semantic_model_id: str | None = None
    use_global_defaults: bool | None = None
    retrieval_strategy: str | None = Field(default=None, pattern="^(keyword|semantic|hybrid)$")
    keyword_weight: float | None = Field(default=None, ge=0, le=1)
    semantic_weight: float | None = Field(default=None, ge=0, le=1)
    rerank_weight: float | None = Field(default=None, ge=0, le=1)
    strategy_params: dict[str, float | int | str | bool] | None = None


class KnowledgeBaseBuildDocument(BaseModel):
    title: str = Field(default="doc", min_length=1, max_length=120)
    content: str = Field(min_length=1)


class KnowledgeBaseBuildRequest(BaseModel):
    documents: list[KnowledgeBaseBuildDocument] = Field(default_factory=list)


class RetrievalQueryRequest(BaseModel):
    kb_id: str
    query: str = Field(min_length=1)
    top_k: int | None = Field(default=None, ge=1, le=50)
    strategy: str | None = Field(default=None, pattern="^(keyword|semantic|hybrid)$")
    keyword_weight: float | None = Field(default=None, ge=0, le=1)
    semantic_weight: float | None = Field(default=None, ge=0, le=1)
    rerank_weight: float | None = Field(default=None, ge=0, le=1)
