from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ModelCatalog(Base):
    __tablename__ = "model_catalog"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    provider_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("model_providers.id"), nullable=False, index=True
    )
    model_name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    model_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    capabilities_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
