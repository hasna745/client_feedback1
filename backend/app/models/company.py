from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.client_contact import ClientContact
    from app.models.form import Form
    from app.models.user import User


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        unique=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    notification_email: Mapped[str | None] = mapped_column(String, nullable=True)
    notify_on_response: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default=true(),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    owner: Mapped[User] = relationship(
        "User",
        back_populates="company",
    )
    forms: Mapped[list[Form]] = relationship(
        "Form",
        back_populates="company",
        cascade="all, delete-orphan",
    )
    client_contacts: Mapped[list[ClientContact]] = relationship(
        "ClientContact",
        back_populates="company",
        cascade="all, delete-orphan",
    )
