import re
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.companies import get_current_company
from app.api.forms import public_form_url
from app.core.database import get_db
from app.models import ClientContact, ClientFormAssignment, Company, Form
from app.services.email_service import (
    FormInvitation,
    is_email_configured,
    send_form_invitation,
)

router = APIRouter(prefix="/api/client-contacts", tags=["client contacts"])
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ClientContactCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str = Field(min_length=3, max_length=320)
    full_name: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        email = value.strip().lower()
        if not EMAIL_PATTERN.match(email):
            raise ValueError("Enter a valid email address.")
        return email


class ClientContactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    email: str
    full_name: str | None
    notes: str | None
    created_at: datetime


class ClientContactInviteRequest(BaseModel):
    form_id: int = Field(gt=0)
    contact_ids: list[int] = Field(min_length=1, max_length=100)
    message: str | None = Field(default=None, max_length=1000)


class ClientContactInviteResponse(BaseModel):
    queued: int
    assigned: int
    smtp_configured: bool
    form_url: str


def get_company_form(db: Session, company_id: int, form_id: int) -> Form:
    form = db.scalar(
        select(Form).where(Form.id == form_id, Form.company_id == company_id)
    )
    if form is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found.",
        )
    if not form.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only active forms can be sent to clients.",
        )
    return form


@router.get("", response_model=list[ClientContactRead])
def list_client_contacts(
    company: Annotated[Company, Depends(get_current_company)],
    db: Session = Depends(get_db),
) -> list[ClientContact]:
    return list(
        db.scalars(
            select(ClientContact)
            .where(ClientContact.company_id == company.id)
            .order_by(ClientContact.created_at.desc(), ClientContact.id.desc())
        )
    )


@router.post(
    "",
    response_model=ClientContactRead,
    status_code=status.HTTP_201_CREATED,
)
def create_client_contact(
    payload: ClientContactCreate,
    company: Annotated[Company, Depends(get_current_company)],
    db: Session = Depends(get_db),
) -> ClientContact:
    contact = ClientContact(
        company_id=company.id,
        email=payload.email,
        full_name=payload.full_name,
        notes=payload.notes,
    )
    db.add(contact)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This client email is already saved.",
        ) from None

    db.refresh(contact)
    return contact


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client_contact(
    contact_id: int,
    company: Annotated[Company, Depends(get_current_company)],
    db: Session = Depends(get_db),
) -> None:
    contact = db.scalar(
        select(ClientContact).where(
            ClientContact.id == contact_id,
            ClientContact.company_id == company.id,
        )
    )
    if contact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client contact not found.",
        )

    db.delete(contact)
    db.commit()


@router.post("/invite", response_model=ClientContactInviteResponse)
def invite_saved_clients(
    payload: ClientContactInviteRequest,
    background_tasks: BackgroundTasks,
    company: Annotated[Company, Depends(get_current_company)],
    db: Session = Depends(get_db),
) -> ClientContactInviteResponse:
    form = get_company_form(db, company.id, payload.form_id)
    contacts = list(
        db.scalars(
            select(ClientContact).where(
                ClientContact.company_id == company.id,
                ClientContact.id.in_(payload.contact_ids),
            )
        )
    )

    if len(contacts) != len(set(payload.contact_ids)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more selected clients were not found.",
        )

    form_url = public_form_url(form.id)
    description = payload.message or form.description
    assigned_count = 0
    for contact in contacts:
        assignment = db.scalar(
            select(ClientFormAssignment).where(
                ClientFormAssignment.form_id == form.id,
                ClientFormAssignment.client_contact_id == contact.id,
            )
        )
        if assignment is None:
            db.add(
                ClientFormAssignment(
                    company_id=company.id,
                    form_id=form.id,
                    client_contact_id=contact.id,
                    message=description,
                )
            )
        else:
            assignment.message = description
        assigned_count += 1

        background_tasks.add_task(
            send_form_invitation,
            FormInvitation(
                recipient_email=contact.email,
                company_name=company.name,
                form_title=form.title,
                form_description=description,
                form_url=form_url,
            ),
        )

    db.commit()

    return ClientContactInviteResponse(
        queued=len(contacts),
        assigned=assigned_count,
        smtp_configured=is_email_configured(),
        form_url=form_url,
    )
