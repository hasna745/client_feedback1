from pathlib import Path
import sys

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import SessionLocal
from app.main import app
from app.models import Answer, Company, Form, Question, Response, User

BUSINESS_A_EMAIL = "verify_analytics_business_a@example.com"
BUSINESS_B_EMAIL = "verify_analytics_business_b@example.com"
CLIENT_EMAIL = "verify_analytics_client@example.com"
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
            "full_name": "Analytics Verification",
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
            "title": "Analytics Survey",
            "description": "Seeded analytics form",
            "questions": [
                {"type": "rating_5", "label": "Satisfaction", "order": 0, "required": True},
                {"type": "nps", "label": "Recommendation", "order": 1, "required": True},
                {
                    "type": "multiple_choice",
                    "label": "Color",
                    "options": ["red", "blue"],
                    "order": 2,
                    "required": True,
                },
                {
                    "type": "checkbox",
                    "label": "Channels",
                    "options": ["email", "sms"],
                    "order": 3,
                    "required": True,
                },
                {"type": "yes_no", "label": "Return", "order": 4, "required": True},
                {"type": "text", "label": "Comment", "order": 5, "required": True},
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_inactive_form(client: TestClient, headers: dict[str, str]) -> None:
    response = client.post(
        "/api/forms",
        headers=headers,
        json={
            "title": "Inactive Analytics Survey",
            "is_active": False,
            "questions": [
                {"type": "text", "label": "Inactive Comment", "order": 0, "required": True}
            ],
        },
    )
    assert response.status_code == 201, response.text


def submit_response(
    client: TestClient,
    headers: dict[str, str],
    form_id: int,
    question_ids: dict[str, int],
    *,
    rating: int,
    nps: int,
    color: str,
    channels: list[str],
    returning: bool,
    comment: str,
) -> None:
    response = client.post(
        f"/api/forms/{form_id}/responses",
        headers=headers,
        json={
            "answers": [
                {"question_id": question_ids["Satisfaction"], "value_number": rating},
                {"question_id": question_ids["Recommendation"], "value_number": nps},
                {"question_id": question_ids["Color"], "value_options": color},
                {"question_id": question_ids["Channels"], "value_options": channels},
                {"question_id": question_ids["Return"], "value_options": returning},
                {"question_id": question_ids["Comment"], "value_text": comment},
            ]
        },
    )
    assert response.status_code == 201, response.text


def get_choice_counts(form_analytics: dict, label: str) -> dict:
    question_distribution = next(
        item for item in form_analytics["choice_distribution"] if item["label"] == label
    )
    return {str(item["value"]).lower(): item["count"] for item in question_distribution["choices"]}


def main() -> None:
    cleanup()

    client = TestClient(app)
    business_a_headers = auth_headers(client, BUSINESS_A_EMAIL, "business")
    business_b_headers = auth_headers(client, BUSINESS_B_EMAIL, "business")
    client_headers = auth_headers(client, CLIENT_EMAIL, "client")

    create_company(client, business_a_headers, "Analytics Co A")
    create_company(client, business_b_headers, "Analytics Co B")

    form = create_form(client, business_a_headers)
    create_inactive_form(client, business_a_headers)
    question_ids = {question["label"]: question["id"] for question in form["questions"]}

    submit_response(
        client,
        client_headers,
        form["id"],
        question_ids,
        rating=5,
        nps=9,
        color="red",
        channels=["email", "sms"],
        returning=True,
        comment="I love the excellent checkout and fast support.",
    )
    submit_response(
        client,
        client_headers,
        form["id"],
        question_ids,
        rating=3,
        nps=7,
        color="blue",
        channels=["email"],
        returning=False,
        comment="Terrible delay and poor support.",
    )

    client_overview = client.get("/api/analytics/overview", headers=client_headers)
    assert client_overview.status_code == 403, client_overview.text

    overview = client.get("/api/analytics/overview", headers=business_a_headers)
    assert overview.status_code == 200, overview.text
    overview_json = overview.json()
    assert overview_json["total_forms"] == 2
    assert overview_json["active_forms"] == 1
    assert overview_json["total_responses"] == 2
    assert overview_json["average_rating"] == 6.0
    assert len(overview_json["latest_responses"]) == 2
    assert overview_json["sentiment_distribution"]["positive"] == 1
    assert overview_json["sentiment_distribution"]["negative"] == 1

    empty_overview = client.get("/api/analytics/overview", headers=business_b_headers)
    assert empty_overview.status_code == 200, empty_overview.text
    assert empty_overview.json()["total_responses"] == 0

    form_analytics = client.get(
        f"/api/analytics/forms/{form['id']}",
        headers=business_a_headers,
    )
    assert form_analytics.status_code == 200, form_analytics.text
    form_json = form_analytics.json()
    assert form_json["total_responses"] == 2
    assert form_json["sentiment_distribution"]["positive"] == 1
    assert form_json["sentiment_distribution"]["negative"] == 1
    assert form_json["top_keywords"]

    rating_averages = {
        item["label"]: item for item in form_json["average_rating"]
    }
    assert rating_averages["Satisfaction"]["average_rating"] == 4.0
    assert rating_averages["Recommendation"]["average_rating"] == 8.0

    color_counts = get_choice_counts(form_json, "Color")
    channel_counts = get_choice_counts(form_json, "Channels")
    return_counts = get_choice_counts(form_json, "Return")
    assert color_counts["red"] == 1
    assert color_counts["blue"] == 1
    assert channel_counts["email"] == 2
    assert channel_counts["sms"] == 1
    assert return_counts["true"] == 1
    assert return_counts["false"] == 1

    isolated_form_analytics = client.get(
        f"/api/analytics/forms/{form['id']}",
        headers=business_b_headers,
    )
    assert isolated_form_analytics.status_code == 404, isolated_form_analytics.text

    cleanup()
    print("Analytics verification passed")


if __name__ == "__main__":
    main()
