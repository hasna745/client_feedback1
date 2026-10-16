from pathlib import Path
import csv
from io import StringIO
import sys

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import SessionLocal
from app.main import app
from app.models import Answer, Company, Form, Question, Response, User

BUSINESS_A_EMAIL = "verify_exports_business_a@example.com"
BUSINESS_B_EMAIL = "verify_exports_business_b@example.com"
CLIENT_EMAIL = "verify_exports_client@example.com"
PASSWORD = "password123"


def cleanup() -> None:
    emails = [BUSINESS_A_EMAIL, BUSINESS_B_EMAIL, CLIENT_EMAIL]

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
            "full_name": "Exports Verification",
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


def create_company(client: TestClient, headers: dict[str, str], name: str) -> None:
    response = client.post("/api/companies", headers=headers, json={"name": name})
    assert response.status_code == 201, response.text


def create_form(client: TestClient, headers: dict[str, str]) -> dict:
    response = client.post(
        "/api/forms",
        headers=headers,
        json={
            "title": "Exports Survey",
            "questions": [
                {"type": "rating_5", "label": "Satisfaction", "order": 0, "required": True},
                {"type": "text", "label": "Comment", "order": 1, "required": True},
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def submit_response(
    client: TestClient,
    headers: dict[str, str],
    form_id: int,
    question_ids: dict[str, int],
) -> None:
    response = client.post(
        f"/api/forms/{form_id}/responses",
        headers=headers,
        json={
            "answers": [
                {"question_id": question_ids["Satisfaction"], "value_number": 5},
                {
                    "question_id": question_ids["Comment"],
                    "value_text": "I love the excellent export experience.",
                },
            ]
        },
    )
    assert response.status_code == 201, response.text


def parse_csv(content: str) -> list[dict[str, str]]:
    return list(csv.DictReader(StringIO(content)))


def main() -> None:
    cleanup()

    client = TestClient(app)
    business_a_headers = auth_headers(client, BUSINESS_A_EMAIL, "business")
    business_b_headers = auth_headers(client, BUSINESS_B_EMAIL, "business")
    client_headers = auth_headers(client, CLIENT_EMAIL, "client")

    create_company(client, business_a_headers, "Exports Co A")
    create_company(client, business_b_headers, "Exports Co B")
    form = create_form(client, business_a_headers)
    question_ids = {question["label"]: question["id"] for question in form["questions"]}
    submit_response(client, client_headers, form["id"], question_ids)

    client_csv = client.get(f"/api/forms/{form['id']}/export/csv", headers=client_headers)
    assert client_csv.status_code == 403, client_csv.text

    other_company_csv = client.get(
        f"/api/forms/{form['id']}/export/csv",
        headers=business_b_headers,
    )
    assert other_company_csv.status_code == 404, other_company_csv.text

    csv_response = client.get(
        f"/api/forms/{form['id']}/export/csv",
        headers=business_a_headers,
    )
    assert csv_response.status_code == 200, csv_response.text
    assert csv_response.headers["content-type"].startswith("text/csv")
    assert "form_" in csv_response.headers["content-disposition"]

    rows = parse_csv(csv_response.text)
    assert len(rows) == 2
    assert {row["question_label"] for row in rows} == {"Satisfaction", "Comment"}
    comment_row = next(row for row in rows if row["question_label"] == "Comment")
    assert comment_row["answer_sentiment_label"] == "positive"
    assert comment_row["keywords"]

    pdf_response = client.get(
        f"/api/forms/{form['id']}/export/pdf",
        headers=business_a_headers,
    )
    assert pdf_response.status_code == 200, pdf_response.text
    assert pdf_response.headers["content-type"] == "application/pdf"
    assert pdf_response.content.startswith(b"%PDF")
    assert len(pdf_response.content) > 100

    other_company_pdf = client.get(
        f"/api/forms/{form['id']}/export/pdf",
        headers=business_b_headers,
    )
    assert other_company_pdf.status_code == 404, other_company_pdf.text

    cleanup()
    print("Exports verification passed")


if __name__ == "__main__":
    main()
