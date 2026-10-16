from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models import Company, User

router = APIRouter(prefix="/api/companies", tags=["companies"])


class CompanyCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    notification_email: str | None = Field(default=None, max_length=320)
    notify_on_response: bool = True


class CompanyUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    notification_email: str | None = Field(default=None, max_length=320)
    notify_on_response: bool | None = None

    @field_validator("name", "notify_on_response")
    @classmethod
    def reject_null_values(cls, value: str | bool | None) -> str | bool | None:
        if value is None:
            raise ValueError("Field cannot be null.")

        return value


class CompanyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    name: str
    description: str | None
    notification_email: str | None
    notify_on_response: bool
    created_at: datetime


def require_business_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role != "business":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only business users can manage companies.",
        )

    return current_user


def get_current_company(
    current_user: Annotated[User, Depends(require_business_user)],
    db: Session = Depends(get_db),
) -> Company:
    company = db.scalar(select(Company).where(Company.owner_id == current_user.id))

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found for current user.",
        )

    return company


@router.post(
    "",
    response_model=CompanyRead,
    status_code=status.HTTP_201_CREATED,
)
def create_company(
    payload: CompanyCreate,
    current_user: Annotated[User, Depends(require_business_user)],
    db: Session = Depends(get_db),
) -> Company:
    existing_company = db.scalar(
        select(Company).where(Company.owner_id == current_user.id)
    )

    if existing_company is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Current user already owns a company.",
        )

    company = Company(
        owner_id=current_user.id,
        name=payload.name,
        description=payload.description,
        notification_email=payload.notification_email,
        notify_on_response=payload.notify_on_response,
    )
    db.add(company)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Current user already owns a company.",
        ) from None

    db.refresh(company)
    return company


@router.get("/me", response_model=CompanyRead)
def read_current_company(
    company: Annotated[Company, Depends(get_current_company)],
) -> Company:
    return company


@router.patch("/me", response_model=CompanyRead)
def update_current_company(
    payload: CompanyUpdate,
    company: Annotated[Company, Depends(get_current_company)],
    db: Session = Depends(get_db),
) -> Company:
    update_data = payload.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(company, field, value)

    db.commit()
    db.refresh(company)
    return company
