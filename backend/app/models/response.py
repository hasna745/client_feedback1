from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.answer import Answer
    from app.models.form import Form
    from app.models.user import User


class Response(Base):
    __tablename__ = "responses"

    id: Mapped[int] = mapped_column(primary_key=True)
    form_id: Mapped[int] = mapped_column(
        ForeignKey("forms.id"),
        nullable=False,
    )
    client_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    overall_sentiment_score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    overall_sentiment_label: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    form: Mapped[Form] = relationship(
        "Form",
        back_populates="responses",
    )
    client: Mapped[User | None] = relationship(
        "User",
        back_populates="responses",
    )
    answers: Mapped[list[Answer]] = relationship(
        "Answer",
        back_populates="response",
        cascade="all, delete-orphan",
    )
