from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LlmRuntimeProfile(Base):
    __tablename__ = "llm_runtime_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    llm_model_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    embedding_model_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    reranker_model_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    params_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
