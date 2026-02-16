from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    member_scope: Mapped[str] = mapped_column(String(36), nullable=False, default="global")
    chunk_size: Mapped[int] = mapped_column(nullable=False, default=1000)
    chunk_overlap: Mapped[int] = mapped_column(nullable=False, default=150)
    top_k: Mapped[int] = mapped_column(nullable=False, default=8)
    rerank_top_n: Mapped[int] = mapped_column(nullable=False, default=4)
    embedding_model_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    reranker_model_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
