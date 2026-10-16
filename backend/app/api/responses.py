from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.auth import get_current_user
from app.api.companies import get_current_company
from app.core.database import get_db
from app.models import Answer, Company, Form, Question, Response, User
from app.services.email_service import (
    AnswerSummary,
    FeedbackNotification,
    send_feedback_response_notification,
)
from app.services.nlp_service import analyze_text, sentiment_label_from_score

router = APIRouter(tags=["responses"])

NUMERIC_QUESTION_RANGES = {
    "rating_5": (1, 5),
    "rating_10": (1, 10),
    "nps": (0, 10),
}
TEXT_QUESTION_TYPES = {"text", "long_text"}
CHOICE_QUESTION_TYPES = {"multiple_choice", "checkbox"}


class AnswerSubmit(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    question_id: int
    value_text: str | None = None
    value_number: float | None = None
    value_options: Any | None = None


class ResponseCreate(BaseModel):
    answers: list[AnswerSubmit] = Field(min_length=1)


class AnswerQuestionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    label: str
    options: Any | None
    order: int
    required: bool


class AnswerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    response_id: int
    question_id: int
    value_text: str | None
    value_number: float | None
    value_options: Any | None
    sentiment_score: float | None
    sentiment_label: str | None
    keywords: Any | None
    question: AnswerQuestionRead


class ResponseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    form_id: int
    client_id: int | None
    submitted_at: datetime
    overall_sentiment_score: float | None
    overall_sentiment_label: str | None
    answers: list[AnswerRead]


class PaginatedResponses(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[ResponseRead]


def require_client_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role != "client":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only client users can submit feedback.",
        )

    return current_user


def load_response_with_answers(db: Session, response_id: int) -> Response | None:
    return db.scalar(
        select(Response)
        .options(
            selectinload(Response.form).selectinload(Form.company),
            selectinload(Response.answers).selectinload(Answer.question),
        )
        .where(Response.id == response_id)
    )


def load_active_form_with_questions(db: Session, form_id: int) -> Form | None:
    return db.scalar(
        select(Form)
        .options(selectinload(Form.questions))
        .where(Form.id == form_id, Form.is_active.is_(True))
    )


def load_company_form_with_questions(
    db: Session,
    company_id: int,
    form_id: int,
) -> Form | None:
    return db.scalar(
        select(Form)
        .options(selectinload(Form.questions))
        .where(Form.id == form_id, Form.company_id == company_id)
    )


def get_allowed_options(question: Question) -> list[Any] | None:
    if isinstance(question.options, list):
        return question.options

    if isinstance(question.options, dict):
        for key in ("options", "choices", "values"):
            value = question.options.get(key)
            if isinstance(value, list):
                return value

    return None


def normalize_text(value: str | None) -> str | None:
    if value is None:
        return None

    value = value.strip()
    return value or None


def has_options(value: Any | None) -> bool:
    if value is None:
        return False

    if isinstance(value, str):
        return bool(value.strip())

    if isinstance(value, (list, dict)):
        return len(value) > 0

    return True


def is_empty_submission(answer: AnswerSubmit) -> bool:
    return (
        normalize_text(answer.value_text) is None
        and answer.value_number is None
        and not has_options(answer.value_options)
    )


def validate_no_extra_values(
    answer: AnswerSubmit,
    *,
    allow_text: bool = False,
    allow_number: bool = False,
    allow_options: bool = False,
) -> None:
    if not allow_text and normalize_text(answer.value_text) is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Question {answer.question_id} does not accept value_text.",
        )

    if not allow_number and answer.value_number is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Question {answer.question_id} does not accept value_number.",
        )

    if not allow_options and has_options(answer.value_options):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Question {answer.question_id} does not accept value_options.",
        )


def validate_allowed_options(question: Question, values: list[Any]) -> None:
    allowed_options = get_allowed_options(question)
    if allowed_options is None:
        return

    invalid_values = [value for value in values if value not in allowed_options]
    if invalid_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Question {question.id} contains invalid option values.",
        )


def build_answer(question: Question, answer: AnswerSubmit) -> Answer:
    if question.type in NUMERIC_QUESTION_RANGES:
        validate_no_extra_values(answer, allow_number=True)

        if answer.value_number is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question {question.id} requires value_number.",
            )

        min_value, max_value = NUMERIC_QUESTION_RANGES[question.type]
        if answer.value_number < min_value or answer.value_number > max_value:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question {question.id} value_number must be between {min_value} and {max_value}.",
            )

        if not float(answer.value_number).is_integer():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question {question.id} value_number must be a whole number.",
            )

        return Answer(question_id=question.id, value_number=answer.value_number)

    if question.type in TEXT_QUESTION_TYPES:
        validate_no_extra_values(answer, allow_text=True)
        value_text = normalize_text(answer.value_text)

        if value_text is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question {question.id} requires value_text.",
            )

        analysis = analyze_text(value_text)
        return Answer(
            question_id=question.id,
            value_text=value_text,
            sentiment_score=analysis["sentiment_score"],
            sentiment_label=analysis["sentiment_label"],
            keywords=analysis["keywords"],
        )

    if question.type == "multiple_choice":
        validate_no_extra_values(answer, allow_options=True)
        value_options = answer.value_options

        if not has_options(value_options):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question {question.id} requires value_options.",
            )

        selected_values = value_options if isinstance(value_options, list) else [value_options]
        if len(selected_values) != 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question {question.id} accepts exactly one option.",
            )

        validate_allowed_options(question, selected_values)
        return Answer(question_id=question.id, value_options=selected_values[0])

    if question.type == "checkbox":
        validate_no_extra_values(answer, allow_options=True)
        if not isinstance(answer.value_options, list) or not answer.value_options:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question {question.id} requires value_options as a non-empty list.",
            )

        validate_allowed_options(question, answer.value_options)
        return Answer(question_id=question.id, value_options=answer.value_options)

    if question.type == "yes_no":
        validate_no_extra_values(answer, allow_options=True)
        if not isinstance(answer.value_options, bool):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question {question.id} requires value_options as a boolean.",
            )

        return Answer(question_id=question.id, value_options=answer.value_options)

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"Question {question.id} has unsupported type {question.type}.",
    )


def build_validated_answers(form: Form, payload: ResponseCreate) -> list[Answer]:
    questions_by_id = {question.id: question for question in form.questions}
    answers_by_question_id: dict[int, AnswerSubmit] = {}

    for answer in payload.answers:
        if answer.question_id in answers_by_question_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question {answer.question_id} was answered more than once.",
            )

        if answer.question_id not in questions_by_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question {answer.question_id} does not belong to this form.",
            )

        answers_by_question_id[answer.question_id] = answer

    for question in form.questions:
        answer = answers_by_question_id.get(question.id)
        if question.required and (answer is None or is_empty_submission(answer)):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question {question.id} is required.",
            )

    answer_models = [
        build_answer(questions_by_id[answer.question_id], answer)
        for answer in payload.answers
        if not is_empty_submission(answer)
    ]

    if not answer_models:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one answer is required.",
        )

    return answer_models


def apply_overall_sentiment(response: Response) -> None:
    sentiment_scores = [
        answer.sentiment_score
        for answer in response.answers
        if answer.sentiment_score is not None
    ]

    if not sentiment_scores:
        response.overall_sentiment_score = None
        response.overall_sentiment_label = None
        return

    overall_score = sum(sentiment_scores) / len(sentiment_scores)
    response.overall_sentiment_score = overall_score
    response.overall_sentiment_label = sentiment_label_from_score(overall_score)


def format_notification_value(answer: Answer) -> str:
    if answer.value_text is not None:
        return answer.value_text

    if answer.value_number is not None:
        return str(answer.value_number)

    if answer.value_options is not None:
        return str(answer.value_options)

    return "N/A"


def build_feedback_notification(response: Response) -> FeedbackNotification | None:
    company = response.form.company

    if not company.notify_on_response or not company.notification_email:
        return None

    answers = [
        AnswerSummary(
            question_label=answer.question.label,
            answer_value=format_notification_value(answer),
            sentiment_label=answer.sentiment_label,
            keywords=answer.keywords if isinstance(answer.keywords, list) else None,
        )
        for answer in sorted(
            response.answers,
            key=lambda item: (item.question.order, item.question.id),
        )
    ]

    return FeedbackNotification(
        recipient_email=company.notification_email,
        form_title=response.form.title,
        submitted_at=response.submitted_at,
        overall_sentiment_label=response.overall_sentiment_label,
        answers=answers,
    )


def get_business_company_for_user(db: Session, user: User) -> Company:
    company = db.scalar(select(Company).where(Company.owner_id == user.id))

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found for current user.",
        )

    return company


@router.post(
    "/api/forms/{form_id}/responses",
    response_model=ResponseRead,
    status_code=status.HTTP_201_CREATED,
)
def submit_form_response(
    form_id: int,
    payload: ResponseCreate,
    background_tasks: BackgroundTasks,
    current_user: Annotated[User, Depends(require_client_user)],
    db: Session = Depends(get_db),
) -> Response:
    form = load_active_form_with_questions(db, form_id)
    if form is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active form not found.",
        )

    response = Response(
        form_id=form.id,
        client_id=current_user.id,
        answers=build_validated_answers(form, payload),
    )
    apply_overall_sentiment(response)
    db.add(response)
    db.commit()
    db.refresh(response)

    loaded_response = load_response_with_answers(db, response.id) or response
    notification = build_feedback_notification(loaded_response)
    if notification is not None:
        background_tasks.add_task(send_feedback_response_notification, notification)

    return loaded_response


@router.get("/api/forms/{form_id}/responses", response_model=PaginatedResponses)
def list_form_responses(
    form_id: int,
    company: Annotated[Company, Depends(get_current_company)],
    db: Session = Depends(get_db),
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PaginatedResponses:
    form = load_company_form_with_questions(db, company.id, form_id)
    if form is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found.",
        )

    total = db.scalar(
        select(func.count(Response.id)).where(Response.form_id == form.id)
    ) or 0
    responses = list(
        db.scalars(
            select(Response)
            .options(selectinload(Response.answers).selectinload(Answer.question))
            .where(Response.form_id == form.id)
            .order_by(Response.submitted_at.desc(), Response.id.desc())
            .limit(limit)
            .offset(offset)
        )
    )

    return PaginatedResponses(
        total=total,
        limit=limit,
        offset=offset,
        items=responses,
    )


@router.get("/api/responses/me", response_model=list[ResponseRead])
def list_my_responses(
    current_user: Annotated[User, Depends(require_client_user)],
    db: Session = Depends(get_db),
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Response]:
    return list(
        db.scalars(
            select(Response)
            .options(selectinload(Response.answers).selectinload(Answer.question))
            .where(Response.client_id == current_user.id)
            .order_by(Response.submitted_at.desc(), Response.id.desc())
            .limit(limit)
            .offset(offset)
        )
    )


@router.get("/api/responses/{id}", response_model=ResponseRead)
def read_response(
    id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> Response:
    response = load_response_with_answers(db, id)
    if response is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Response not found.",
        )

    if current_user.role == "client":
        if response.client_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Response not found.",
            )

        return response

    if current_user.role == "business":
        company = get_business_company_for_user(db, current_user)
        if response.form.company_id != company.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Response not found.",
            )

        return response

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="User role cannot access responses.",
    )
