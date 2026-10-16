from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.form import Form


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    form_id: Mapped[int] = mapped_column(
        ForeignKey("forms.id"),
        nullable=False,
    )
    type: Mapped[str] = mapped_column(String, nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)
    options: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    order: Mapped[int] = mapped_column("order", Integer, nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, nullable=False)

    form: Mapped[Form] = relationship(
        "Form",
        back_populates="questions",
    )
