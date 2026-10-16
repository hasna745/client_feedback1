from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ClientFormAssignment(Base):
    __tablename__ = "client_form_assignments"
    __table_args__ = (
        UniqueConstraint(
            "form_id",
            "client_contact_id",
            name="uq_client_form_assignments_form_contact",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id"),
        nullable=False,
    )
    form_id: Mapped[int] = mapped_column(
        ForeignKey("forms.id"),
        nullable=False,
    )
    client_contact_id: Mapped[int] = mapped_column(
        ForeignKey("client_contacts.id"),
        nullable=False,
    )
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
