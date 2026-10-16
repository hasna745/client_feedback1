from collections import Counter
from datetime import datetime
import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.companies import get_current_company
from app.core.database import get_db
from app.models import Answer, Company, Form, Question, Response

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

NUMERIC_QUESTION_TYPES = ("rating_5", "rating_10", "nps")
CHOICE_QUESTION_TYPES = ("multiple_choice", "checkbox", "yes_no")
SENTIMENT_LABELS = ("positive", "neutral", "negative")
LATEST_RESPONSE_LIMIT = 5
TOP_KEYWORD_LIMIT = 10


class LatestResponseSummary(BaseModel):
    id: int
    form_id: int
    form_title: str
    client_id: int | None
    submitted_at: datetime
    overall_sentiment_score: float | None
    overall_sentiment_label: str | None


class OverviewAnalytics(BaseModel):
    total_forms: int
    total_responses: int
    active_forms: int
    average_rating: float | None
    sentiment_distribution: dict[str, int]
    latest_responses: list[LatestResponseSummary]


class QuestionRatingAverage(BaseModel):
    question_id: int
    label: str
    type: str
    average_rating: float | None
    response_count: int


class ChoiceCount(BaseModel):
    value: Any
    count: int


class ChoiceQuestionDistribution(BaseModel):
    question_id: int
    label: str
    type: str
    choices: list[ChoiceCount]


class KeywordCount(BaseModel):
    keyword: str
    count: int


class FormAnalytics(BaseModel):
    form_id: int
    title: str
    total_responses: int
    average_rating: list[QuestionRatingAverage]
    choice_distribution: list[ChoiceQuestionDistribution]
    sentiment_distribution: dict[str, int]
    top_keywords: list[KeywordCount]


def normalize_sentiment_label(label: str | None) -> str:
    if label in SENTIMENT_LABELS:
        return label

    return "unknown"


def empty_sentiment_distribution() -> dict[str, int]:
    return {
        "positive": 0,
        "neutral": 0,
        "negative": 0,
        "unknown": 0,
    }


def build_sentiment_distribution(rows: list[tuple[str | None, int]]) -> dict[str, int]:
    distribution = empty_sentiment_distribution()

    for label, count in rows:
        distribution[normalize_sentiment_label(label)] += count

    return distribution


def option_key(value: Any) -> str:
    return json.dumps(value, sort_keys=True, default=str)


def sorted_counts(counter: Counter[str]) -> list[tuple[str, int]]:
    return sorted(counter.items(), key=lambda item: (-item[1], item[0]))


def load_company_form(db: Session, company_id: int, form_id: int) -> Form:
    form = db.scalar(
        select(Form).where(Form.id == form_id, Form.company_id == company_id)
    )

    if form is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found.",
        )

    return form


def count_company_forms(db: Session, company_id: int) -> int:
    return db.scalar(
        select(func.count(Form.id)).where(Form.company_id == company_id)
    ) or 0


def count_company_responses(db: Session, company_id: int) -> int:
    return db.scalar(
        select(func.count(Response.id))
        .select_from(Response)
        .join(Form, Response.form_id == Form.id)
        .where(Form.company_id == company_id)
    ) or 0


def count_active_company_forms(db: Session, company_id: int) -> int:
    return db.scalar(
        select(func.count(Form.id)).where(
            Form.company_id == company_id,
            Form.is_active.is_(True),
        )
    ) or 0


def get_average_company_rating(db: Session, company_id: int) -> float | None:
    average_rating = db.scalar(
        select(func.avg(Answer.value_number))
        .select_from(Answer)
        .join(Question, Answer.question_id == Question.id)
        .join(Response, Answer.response_id == Response.id)
        .join(Form, Response.form_id == Form.id)
        .where(
            Form.company_id == company_id,
            Question.type.in_(NUMERIC_QUESTION_TYPES),
            Answer.value_number.is_not(None),
        )
    )

    return float(average_rating) if average_rating is not None else None


def get_company_sentiment_distribution(
    db: Session,
    company_id: int,
) -> dict[str, int]:
    rows = db.execute(
        select(Response.overall_sentiment_label, func.count(Response.id))
        .select_from(Response)
        .join(Form, Response.form_id == Form.id)
        .where(Form.company_id == company_id)
        .group_by(Response.overall_sentiment_label)
    ).all()

    return build_sentiment_distribution(rows)


def get_latest_company_responses(
    db: Session,
    company_id: int,
) -> list[LatestResponseSummary]:
    rows = db.execute(
        select(
            Response.id,
            Response.form_id,
            Form.title.label("form_title"),
            Response.client_id,
            Response.submitted_at,
            Response.overall_sentiment_score,
            Response.overall_sentiment_label,
        )
        .select_from(Response)
        .join(Form, Response.form_id == Form.id)
        .where(Form.company_id == company_id)
        .order_by(Response.submitted_at.desc(), Response.id.desc())
        .limit(LATEST_RESPONSE_LIMIT)
    ).all()

    return [
        LatestResponseSummary(
            id=row.id,
            form_id=row.form_id,
            form_title=row.form_title,
            client_id=row.client_id,
            submitted_at=row.submitted_at,
            overall_sentiment_score=row.overall_sentiment_score,
            overall_sentiment_label=row.overall_sentiment_label,
        )
        for row in rows
    ]


def get_form_sentiment_distribution(db: Session, form_id: int) -> dict[str, int]:
    rows = db.execute(
        select(Response.overall_sentiment_label, func.count(Response.id))
        .where(Response.form_id == form_id)
        .group_by(Response.overall_sentiment_label)
    ).all()

    return build_sentiment_distribution(rows)


def get_form_rating_averages(
    db: Session,
    form_id: int,
) -> list[QuestionRatingAverage]:
    rows = db.execute(
        select(
            Question.id,
            Question.label,
            Question.type,
            func.avg(Answer.value_number),
            func.count(Answer.id),
        )
        .select_from(Question)
        .outerjoin(
            Answer,
            (Answer.question_id == Question.id)
            & (Answer.value_number.is_not(None)),
        )
        .where(
            Question.form_id == form_id,
            Question.type.in_(NUMERIC_QUESTION_TYPES),
        )
        .group_by(Question.id, Question.label, Question.type, Question.order)
        .order_by(Question.order, Question.id)
    ).all()

    return [
        QuestionRatingAverage(
            question_id=row.id,
            label=row.label,
            type=row.type,
            average_rating=float(row[3]) if row[3] is not None else None,
            response_count=row[4],
        )
        for row in rows
    ]


def get_choice_values(value: Any, question_type: str) -> list[Any]:
    if value is None:
        return []

    if question_type == "checkbox":
        return value if isinstance(value, list) else [value]

    return [value]


def get_form_choice_distribution(
    db: Session,
    form_id: int,
) -> list[ChoiceQuestionDistribution]:
    choice_questions = list(
        db.scalars(
            select(Question)
            .where(
                Question.form_id == form_id,
                Question.type.in_(CHOICE_QUESTION_TYPES),
            )
            .order_by(Question.order, Question.id)
        )
    )
    counters = {question.id: Counter() for question in choice_questions}
    values_by_key: dict[tuple[int, str], Any] = {}

    rows = db.execute(
        select(Question.id, Question.type, Answer.value_options)
        .select_from(Answer)
        .join(Question, Answer.question_id == Question.id)
        .where(
            Question.form_id == form_id,
            Question.type.in_(CHOICE_QUESTION_TYPES),
            Answer.value_options.is_not(None),
        )
    ).all()

    for question_id, question_type, value_options in rows:
        for value in get_choice_values(value_options, question_type):
            key = option_key(value)
            counters[question_id][key] += 1
            values_by_key[(question_id, key)] = value

    return [
        ChoiceQuestionDistribution(
            question_id=question.id,
            label=question.label,
            type=question.type,
            choices=[
                ChoiceCount(
                    value=values_by_key[(question.id, key)],
                    count=count,
                )
                for key, count in sorted_counts(counters[question.id])
            ],
        )
        for question in choice_questions
    ]


def get_form_top_keywords(db: Session, form_id: int) -> list[KeywordCount]:
    keyword_counter: Counter[str] = Counter()
    keyword_labels: dict[str, str] = {}
    keyword_rows = db.scalars(
        select(Answer.keywords)
        .select_from(Answer)
        .join(Question, Answer.question_id == Question.id)
        .where(
            Question.form_id == form_id,
            Answer.keywords.is_not(None),
        )
    )

    for keywords in keyword_rows:
        if not isinstance(keywords, list):
            continue

        for keyword in keywords:
            if not isinstance(keyword, str):
                continue

            normalized_keyword = keyword.strip()
            if not normalized_keyword:
                continue

            keyword_key = normalized_keyword.lower()
            keyword_counter[keyword_key] += 1
            keyword_labels.setdefault(keyword_key, normalized_keyword)

    return [
        KeywordCount(keyword=keyword_labels[key], count=count)
        for key, count in sorted_counts(keyword_counter)[:TOP_KEYWORD_LIMIT]
    ]


@router.get("/overview", response_model=OverviewAnalytics)
def read_analytics_overview(
    company: Annotated[Company, Depends(get_current_company)],
    db: Session = Depends(get_db),
) -> OverviewAnalytics:
    return OverviewAnalytics(
        total_forms=count_company_forms(db, company.id),
        total_responses=count_company_responses(db, company.id),
        active_forms=count_active_company_forms(db, company.id),
        average_rating=get_average_company_rating(db, company.id),
        sentiment_distribution=get_company_sentiment_distribution(db, company.id),
        latest_responses=get_latest_company_responses(db, company.id),
    )


@router.get("/forms/{form_id}", response_model=FormAnalytics)
def read_form_analytics(
    form_id: int,
    company: Annotated[Company, Depends(get_current_company)],
    db: Session = Depends(get_db),
) -> FormAnalytics:
    form = load_company_form(db, company.id, form_id)
    total_responses = db.scalar(
        select(func.count(Response.id)).where(Response.form_id == form.id)
    ) or 0

    return FormAnalytics(
        form_id=form.id,
        title=form.title,
        total_responses=total_responses,
        average_rating=get_form_rating_averages(db, form.id),
        choice_distribution=get_form_choice_distribution(db, form.id),
        sentiment_distribution=get_form_sentiment_distribution(db, form.id),
        top_keywords=get_form_top_keywords(db, form.id),
    )
