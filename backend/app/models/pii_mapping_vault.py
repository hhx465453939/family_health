from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PiiMappingVault(Base):
    __tablename__ = "pii_mapping_vault"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    mapping_key: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    original_value_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    replacement_token: Mapped[str] = mapped_column(String(100), nullable=False)
    hash_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
