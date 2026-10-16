from pathlib import Path
import os
import sys
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import SessionLocal
from app.main import app
from app.models import Answer, Company, Form, Question, Response, User
import app.services.email_service as email_service

BUSINESS_EMAIL = "verify_email_business@example.com"
CLIENT_EMAIL = "verify_email_client@example.com"
PASSWORD = "password123"
SMTP_ENV_KEYS = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USERNAME",
    "SMTP_PASSWORD",
    "SMTP_FROM_EMAIL",
    "SMTP_FROM_NAME",
    "SMTP_STARTTLS",
    "SMTP_SSL_TLS",
    "SMTP_VALIDATE_CERTS",
    "MAIL_SERVER",
    "MAIL_PORT",
    "MAIL_USERNAME",
    "MAIL_PASSWORD",
    "MAIL_FROM",
    "MAIL_FROM_NAME",
    "MAIL_STARTTLS",
    "MAIL_SSL_TLS",
]


class FakeFastMail:
    sent_messages: list[dict[str, Any]] = []

    def __init__(self, config: Any) -> None:
        self.config = config

    async def send_message(self, message: Any) -> None:
        self.sent_messages.append(
            {
                "config": self.config,
                "message": message,
            }
        )


def clear_smtp_env() -> None:
    for key in SMTP_ENV_KEYS:
        os.environ.pop(key, None)


def configure_smtp_env() -> None:
    os.environ["SMTP_HOST"] = "localhost"
    os.environ["SMTP_PORT"] = "1025"
    os.environ["SMTP_FROM_EMAIL"] = "noreply@example.com"
    os.environ["SMTP_FROM_NAME"] = "Feedback Platform"
    os.environ["SMTP_STARTTLS"] = "false"
    os.environ["SMTP_SSL_TLS"] = "false"


def cleanup() -> None:
    emails = [BUSINESS_EMAIL, CLIENT_EMAIL]

    with SessionLocal() as db:
        user_ids = db.scalars(select(User.id).where(User.email.in_(emails))).all()
        if user_ids:
            company_ids = db.scalars(
                select(Company.id).where(Company.owner_id.in_(user_ids))
            ).all()
            response_ids = db.scalars(
                select(Response.id).where(Response.client_id.in_(user_ids))
            ).all()

            if company_ids:
                form_ids = db.scalars(
                    select(Form.id).where(Form.company_id.in_(company_ids))
                ).all()
                if form_ids:
                    response_ids += db.scalars(
                        select(Response.id).where(Response.form_id.in_(form_ids))
                    ).all()
                    db.execute(delete(Answer).where(Answer.response_id.in_(response_ids or [-1])))
                    db.execute(delete(Response).where(Response.id.in_(response_ids or [-1])))
                    db.execute(delete(Question).where(Question.form_id.in_(form_ids)))
                    db.execute(delete(Form).where(Form.id.in_(form_ids)))

                db.execute(delete(Company).where(Company.id.in_(company_ids)))

        db.execute(delete(User).where(User.email.in_(emails)))
        db.commit()


def auth_headers(client: TestClient, email: str, role: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "full_name": "Email Verification",
            "role": role,
        },
    )
    assert response.status_code == 201, response.text

    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text

    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def create_seed_data(client: TestClient) -> tuple[dict[str, str], int, int]:
    business_headers = auth_headers(client, BUSINESS_EMAIL, "business")
    client_headers = auth_headers(client, CLIENT_EMAIL, "client")

    response = client.post(
        "/api/companies",
        headers=business_headers,
        json={
            "name": "Email Notification Co",
            "notification_email": "alerts@example.com",
            "notify_on_response": True,
        },
    )
    assert response.status_code == 201, response.text

    response = client.post(
        "/api/forms",
        headers=business_headers,
        json={
            "title": "Email Notification Survey",
            "questions": [
                {"type": "text", "label": "Comment", "order": 0, "required": True},
                {"type": "rating_5", "label": "Rating", "order": 1, "required": True},
            ],
        },
    )
    assert response.status_code == 201, response.text

    form = response.json()
    question_ids = {question["label"]: question["id"] for question in form["questions"]}
    return client_headers, form["id"], question_ids["Comment"], question_ids["Rating"]


def submit_feedback(
    client: TestClient,
    client_headers: dict[str, str],
    form_id: int,
    comment_question_id: int,
    rating_question_id: int,
    comment: str,
) -> None:
    response = client.post(
        f"/api/forms/{form_id}/responses",
        headers=client_headers,
        json={
            "answers": [
                {"question_id": comment_question_id, "value_text": comment},
                {"question_id": rating_question_id, "value_number": 5},
            ]
        },
    )
    assert response.status_code == 201, response.text


def main() -> None:
    original_fast_mail = email_service.FastMail
    original_env = {key: os.environ.get(key) for key in SMTP_ENV_KEYS}

    try:
        cleanup()
        clear_smtp_env()
        email_service.FastMail = FakeFastMail
        FakeFastMail.sent_messages.clear()

        client = TestClient(app)
        client_headers, form_id, comment_question_id, rating_question_id = create_seed_data(client)

        submit_feedback(
            client,
            client_headers,
            form_id,
            comment_question_id,
            rating_question_id,
            "I love the email notification workflow.",
        )
        assert len(FakeFastMail.sent_messages) == 0

        configure_smtp_env()
        submit_feedback(
            client,
            client_headers,
            form_id,
            comment_question_id,
            rating_question_id,
            "Excellent support and fast feedback handling.",
        )
        assert len(FakeFastMail.sent_messages) == 1

        message = FakeFastMail.sent_messages[0]["message"]
        assert [recipient.email for recipient in message.recipients] == [
            "alerts@example.com"
        ]
        assert "Email Notification Survey" in message.subject
        assert "Overall sentiment" in message.body
        assert "Excellent support" in message.body

        print("Email notification verification passed")
    finally:
        cleanup()
        email_service.FastMail = original_fast_mail
        clear_smtp_env()
        for key, value in original_env.items():
            if value is not None:
                os.environ[key] = value


if __name__ == "__main__":
    main()
