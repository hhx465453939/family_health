from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ExportItem(Base):
    __tablename__ = "export_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("export_jobs.id"), nullable=False, index=True
    )
    item_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    item_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    sanitized_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
