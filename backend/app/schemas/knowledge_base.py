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


class KnowledgeBaseBuildDocument(BaseModel):
    title: str = Field(default="doc", min_length=1, max_length=120)
    content: str = Field(min_length=1)


class KnowledgeBaseBuildRequest(BaseModel):
    documents: list[KnowledgeBaseBuildDocument] = Field(default_factory=list)


class RetrievalQueryRequest(BaseModel):
    kb_id: str
    query: str = Field(min_length=1)
    top_k: int | None = Field(default=None, ge=1, le=50)
