from pathlib import Path
import sys

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import SessionLocal
from app.main import app
from app.models import Answer, Company, Form, Question, Response, User

BUSINESS_EMAIL = "verify_nlp_business@example.com"
CLIENT_EMAIL = "verify_nlp_client@example.com"
PASSWORD = "password123"


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
            "full_name": "NLP Verification",
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


def main() -> None:
    cleanup()

    client = TestClient(app)
    business_headers = auth_headers(client, BUSINESS_EMAIL, "business")
    client_headers = auth_headers(client, CLIENT_EMAIL, "client")

    response = client.post(
        "/api/companies",
        headers=business_headers,
        json={"name": "NLP Verification Co"},
    )
    assert response.status_code == 201, response.text

    response = client.post(
        "/api/forms",
        headers=business_headers,
        json={
            "title": "NLP Verification Form",
            "questions": [
                {
                    "type": "text",
                    "label": "Short feedback",
                    "order": 0,
                    "required": True,
                },
                {
                    "type": "rating_5",
                    "label": "Rating",
                    "order": 1,
                    "required": True,
                },
            ],
        },
    )
    assert response.status_code == 201, response.text

    form = response.json()
    questions = {question["type"]: question["id"] for question in form["questions"]}

    response = client.post(
        f"/api/forms/{form['id']}/responses",
        headers=client_headers,
        json={
            "answers": [
                {
                    "question_id": questions["text"],
                    "value_text": "I love the fast checkout and excellent support.",
                },
                {
                    "question_id": questions["rating_5"],
                    "value_number": 5,
                },
            ]
        },
    )
    assert response.status_code == 201, response.text

    submitted_response = response.json()
    text_answer = next(
        answer
        for answer in submitted_response["answers"]
        if answer["question"]["type"] == "text"
    )
    rating_answer = next(
        answer
        for answer in submitted_response["answers"]
        if answer["question"]["type"] == "rating_5"
    )

    assert text_answer["sentiment_label"] == "positive"
    assert text_answer["sentiment_score"] is not None
    assert text_answer["keywords"]
    assert rating_answer["sentiment_score"] is None
    assert rating_answer["sentiment_label"] is None
    assert rating_answer["keywords"] is None
    assert submitted_response["overall_sentiment_label"] == "positive"
    assert submitted_response["overall_sentiment_score"] is not None

    cleanup()
    print("NLP verification passed")


if __name__ == "__main__":
    main()
