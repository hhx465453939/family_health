from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False, default="New Chat")
    runtime_profile_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    role_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    background_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    reasoning_enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    reasoning_budget: Mapped[int | None] = mapped_column(Integer, nullable=True)
    show_reasoning: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    context_message_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    default_enabled_mcp_ids_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
