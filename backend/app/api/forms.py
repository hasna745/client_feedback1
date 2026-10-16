from datetime import datetime
import os
import re
from typing import Annotated, Any, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.auth import get_current_user
from app.api.companies import get_current_company
from app.core.database import get_db
from app.models import ClientContact, ClientFormAssignment, Company, Form, Question, Response, User
from app.services.email_service import (
    FormInvitation,
    is_email_configured,
    send_form_invitation,
)

router = APIRouter(prefix="/api/forms", tags=["forms"])
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

QuestionType = Literal[
    "rating_5",
    "rating_10",
    "nps",
    "text",
    "long_text",
    "multiple_choice",
    "checkbox",
    "yes_no",
]


class QuestionBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    type: QuestionType
    label: str = Field(min_length=1, max_length=500)
    options: Any | None = None
    order: int = Field(ge=0)
    required: bool = True


class QuestionCreate(QuestionBase):
    pass


class QuestionRead(QuestionBase):
    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    form_id: int


class FormBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    is_active: bool = True


class FormCreate(FormBase):
    questions: list[QuestionCreate] = Field(min_length=1)


class FormUpdate(FormBase):
    questions: list[QuestionCreate] = Field(min_length=1)


class FormRead(FormBase):
    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    company_id: int
    created_at: datetime
    questions: list[QuestionRead]


class PublicFormSummary(BaseModel):
    id: int
    company_id: int
    company_name: str
    title: str
    description: str | None
    question_count: int


class FormInvitationRequest(BaseModel):
    recipients: list[str] = Field(min_length=1, max_length=100)
    message: str | None = Field(default=None, max_length=1000)

    @field_validator("recipients")
    @classmethod
    def normalize_recipients(cls, value: list[str]) -> list[str]:
        recipients: list[str] = []
        seen: set[str] = set()

        for raw_email in value:
            email = raw_email.strip().lower()
            if not EMAIL_PATTERN.match(email):
                raise ValueError(f"{raw_email} is not a valid email address.")
            if email not in seen:
                recipients.append(email)
                seen.add(email)

        if not recipients:
            raise ValueError("At least one valid recipient email is required.")

        return recipients


class FormInvitationResponse(BaseModel):
    queued: int
    assigned: int = 0
    smtp_configured: bool
    form_url: str


def build_questions(questions: list[QuestionCreate]) -> list[Question]:
    return [
        Question(
            type=question.type,
            label=question.label,
            options=question.options,
            order=question.order,
            required=question.required,
        )
        for question in questions
    ]


def load_company_form(db: Session, company_id: int, form_id: int) -> Form | None:
    return db.scalar(
        select(Form)
        .options(selectinload(Form.questions))
        .where(Form.id == form_id, Form.company_id == company_id)
    )


def get_current_company_form(
    id: int,
    company: Annotated[Company, Depends(get_current_company)],
    db: Session = Depends(get_db),
) -> Form:
    form = load_company_form(db, company.id, id)

    if form is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found.",
        )

    return form


def frontend_base_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")


def public_form_url(form_id: int) -> str:
    return f"{frontend_base_url()}/submit?form={form_id}"


@router.post("", response_model=FormRead, status_code=status.HTTP_201_CREATED)
def create_form(
    payload: FormCreate,
    company: Annotated[Company, Depends(get_current_company)],
    db: Session = Depends(get_db),
) -> Form:
    form = Form(
        company_id=company.id,
        title=payload.title,
        description=payload.description,
        is_active=payload.is_active,
        questions=build_questions(payload.questions),
    )
    db.add(form)
    db.commit()
    db.refresh(form)

    return load_company_form(db, company.id, form.id) or form


@router.get("", response_model=list[FormRead])
def list_forms(
    company: Annotated[Company, Depends(get_current_company)],
    db: Session = Depends(get_db),
) -> list[Form]:
    return list(
        db.scalars(
            select(Form)
            .options(selectinload(Form.questions))
            .where(Form.company_id == company.id)
            .order_by(Form.created_at.desc(), Form.id.desc())
        )
    )


@router.get("/public", response_model=list[PublicFormSummary])
def list_public_active_forms(db: Session = Depends(get_db)) -> list[PublicFormSummary]:
    rows = db.execute(
        select(
            Form.id,
            Form.company_id,
            Company.name.label("company_name"),
            Form.title,
            Form.description,
            func.count(Question.id).label("question_count"),
        )
        .select_from(Form)
        .join(Company, Form.company_id == Company.id)
        .outerjoin(Question, Question.form_id == Form.id)
        .where(Form.is_active.is_(True))
        .group_by(Form.id, Company.name)
        .order_by(Company.name.asc(), Form.created_at.desc(), Form.id.desc())
    ).all()

    return [
        PublicFormSummary(
            id=row.id,
            company_id=row.company_id,
            company_name=row.company_name,
            title=row.title,
            description=row.description,
            question_count=row.question_count,
        )
        for row in rows
    ]


@router.get("/assigned", response_model=list[PublicFormSummary])
def list_assigned_active_forms(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[PublicFormSummary]:
    if current_user.role != "client":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only client users can view assigned forms.",
        )

    rows = db.execute(
        select(
            Form.id,
            Form.company_id,
            Company.name.label("company_name"),
            Form.title,
            Form.description,
            func.count(func.distinct(Question.id)).label("question_count"),
            func.max(ClientFormAssignment.created_at).label("assigned_at"),
        )
        .select_from(ClientFormAssignment)
        .join(Form, ClientFormAssignment.form_id == Form.id)
        .join(Company, Form.company_id == Company.id)
        .join(ClientContact, ClientFormAssignment.client_contact_id == ClientContact.id)
        .outerjoin(Question, Question.form_id == Form.id)
        .where(
            Form.is_active.is_(True),
            ClientContact.email == current_user.email,
        )
        .group_by(Form.id, Company.name)
        .order_by(func.max(ClientFormAssignment.created_at).desc(), Form.id.desc())
    ).all()

    return [
        PublicFormSummary(
            id=row.id,
            company_id=row.company_id,
            company_name=row.company_name,
            title=row.title,
            description=row.description,
            question_count=row.question_count,
        )
        for row in rows
    ]


@router.get("/{id}", response_model=FormRead)
def read_form(
    form: Annotated[Form, Depends(get_current_company_form)],
) -> Form:
    return form


@router.get("/{id}/public", response_model=FormRead)
def read_public_active_form(id: int, db: Session = Depends(get_db)) -> Form:
    form = db.scalar(
        select(Form)
        .options(selectinload(Form.questions))
        .where(Form.id == id, Form.is_active.is_(True))
    )

    if form is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active form not found.",
        )

    return form


@router.put("/{id}", response_model=FormRead)
def update_form(
    payload: FormUpdate,
    form: Annotated[Form, Depends(get_current_company_form)],
    db: Session = Depends(get_db),
) -> Form:
    response_count = db.scalar(
        select(func.count(Response.id)).where(Response.form_id == form.id)
    )
    if response_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Forms with submitted responses cannot have their questions replaced.",
        )

    form.title = payload.title
    form.description = payload.description
    form.is_active = payload.is_active
    form.questions = build_questions(payload.questions)

    db.commit()

    return load_company_form(db, form.company_id, form.id) or form


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_form(
    form: Annotated[Form, Depends(get_current_company_form)],
    db: Session = Depends(get_db),
) -> None:
    db.delete(form)
    db.commit()


@router.patch("/{id}/toggle-active", response_model=FormRead)
def toggle_form_active(
    form: Annotated[Form, Depends(get_current_company_form)],
    db: Session = Depends(get_db),
) -> Form:
    form.is_active = not form.is_active
    db.commit()

    return load_company_form(db, form.company_id, form.id) or form


@router.post("/{id}/invite", response_model=FormInvitationResponse)
def invite_form_recipients(
    id: int,
    payload: FormInvitationRequest,
    background_tasks: BackgroundTasks,
    company: Annotated[Company, Depends(get_current_company)],
    db: Session = Depends(get_db),
) -> FormInvitationResponse:
    form = load_company_form(db, company.id, id)
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

    form_url = public_form_url(form.id)
    description = payload.message or form.description
    for email in payload.recipients:
        background_tasks.add_task(
            send_form_invitation,
            FormInvitation(
                recipient_email=email,
                company_name=company.name,
                form_title=form.title,
                form_description=description,
                form_url=form_url,
            ),
        )

    return FormInvitationResponse(
        queued=len(payload.recipients),
        assigned=0,
        smtp_configured=is_email_configured(),
        form_url=form_url,
    )
