from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DesensitizationRule(Base):
    __tablename__ = "desensitization_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    member_scope: Mapped[str] = mapped_column(
        String(36), nullable=False, default="global", index=True
    )
    rule_type: Mapped[str] = mapped_column(String(20), nullable=False, default="literal")
    pattern: Mapped[str] = mapped_column(String(500), nullable=False)
    replacement_token: Mapped[str] = mapped_column(String(100), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
