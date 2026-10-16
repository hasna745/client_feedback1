from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from typing import Any

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.models import Answer, Company, Form, Question, Response, User  # noqa: E402
from app.services.nlp_service import analyze_text, sentiment_label_from_score  # noqa: E402

PASSWORD = "password123"

BUSINESS_USERS = [
    ("owner@gmail.com", "Olivia Owner", "FeedbackIQ Demo"),
    ("manager@gmail.com", "Marcus Manager", "Nova Retail"),
]
CLIENT_USERS = [
    ("client1@gmail.com", "Client One"),
    ("client2@gmail.com", "Client Two"),
    ("client3@gmail.com", "Client Three"),
    ("client4@gmail.com", "Client Four"),
    ("client5@gmail.com", "Client Five"),
]
DEMO_COMPANY_NAMES = [company_name for *_rest, company_name in BUSINESS_USERS]
DEMO_BUSINESS_EMAILS = [email for email, *_rest in BUSINESS_USERS]
DEMO_CLIENT_EMAILS = [email for email, _name in CLIENT_USERS]


FORM_DEFINITIONS = [
    {
        "company": "FeedbackIQ Demo",
        "title": "Customer Satisfaction Survey",
        "description": "A broad satisfaction pulse for customers after a recent interaction.",
        "questions": [
            {
                "type": "rating_5",
                "label": "How satisfied are you with your overall experience?",
                "required": True,
            },
            {
                "type": "rating_10",
                "label": "How would you rate the value you received?",
                "required": True,
            },
            {
                "type": "nps",
                "label": "How likely are you to recommend us to a colleague?",
                "required": True,
            },
            {
                "type": "multiple_choice",
                "label": "Which part of the experience mattered most?",
                "options": ["Onboarding", "Product quality", "Support", "Pricing"],
                "required": True,
            },
            {
                "type": "checkbox",
                "label": "Which channels did you use?",
                "options": ["Website", "Email", "Live chat", "Phone", "Mobile app"],
                "required": True,
            },
            {
                "type": "yes_no",
                "label": "Did we resolve your need today?",
                "required": True,
            },
            {
                "type": "text",
                "label": "What is one thing we did well?",
                "required": True,
            },
            {
                "type": "long_text",
                "label": "What should we improve next?",
                "required": True,
            },
        ],
    },
    {
        "company": "FeedbackIQ Demo",
        "title": "Product Experience Feedback",
        "description": "Detailed feedback about product usability, value, and feature quality.",
        "questions": [
            {
                "type": "rating_5",
                "label": "How satisfied are you with the product experience?",
                "required": True,
            },
            {
                "type": "rating_10",
                "label": "How easy was the product to use?",
                "required": True,
            },
            {
                "type": "nps",
                "label": "How likely are you to recommend this product?",
                "required": True,
            },
            {
                "type": "multiple_choice",
                "label": "Which product area did you use most?",
                "options": ["Dashboard", "Reports", "Automation", "Integrations"],
                "required": True,
            },
            {
                "type": "checkbox",
                "label": "Which features helped your workflow?",
                "options": ["Analytics", "Notifications", "Exports", "Team access", "Templates"],
                "required": True,
            },
            {
                "type": "yes_no",
                "label": "Did the product help you complete your task?",
                "required": True,
            },
            {
                "type": "text",
                "label": "What feature felt most useful?",
                "required": True,
            },
            {
                "type": "long_text",
                "label": "What would make the product more valuable?",
                "required": True,
            },
        ],
    },
    {
        "company": "Nova Retail",
        "title": "Support Quality Review",
        "description": "A service quality survey for customers who contacted support.",
        "questions": [
            {
                "type": "rating_5",
                "label": "How satisfied were you with the support interaction?",
                "required": True,
            },
            {
                "type": "rating_10",
                "label": "How would you rate the clarity of the answer?",
                "required": True,
            },
            {
                "type": "nps",
                "label": "How likely are you to recommend our support team?",
                "required": True,
            },
            {
                "type": "multiple_choice",
                "label": "What was your support topic?",
                "options": ["Order status", "Returns", "Billing", "Product question"],
                "required": True,
            },
            {
                "type": "checkbox",
                "label": "Which support qualities stood out?",
                "options": ["Speed", "Empathy", "Clarity", "Follow-up", "Accuracy"],
                "required": True,
            },
            {
                "type": "yes_no",
                "label": "Was your issue resolved?",
                "required": True,
            },
            {
                "type": "text",
                "label": "What did the support team do well?",
                "required": True,
            },
            {
                "type": "long_text",
                "label": "How could support improve?",
                "required": True,
            },
        ],
    },
]


RESPONSE_BANK: dict[str, list[dict[str, Any]]] = {
    "Customer Satisfaction Survey": [
        {
            "rating_5": 5,
            "rating_10": 9,
            "nps": 10,
            "multiple_choice": "Support",
            "checkbox": ["Website", "Live chat"],
            "yes_no": True,
            "text": "The team responded quickly and made the process simple.",
            "long_text": "I appreciated the clear communication and the calm handoff between steps. The experience felt polished, helpful, and easy to trust.",
        },
        {
            "rating_5": 4,
            "rating_10": 8,
            "nps": 8,
            "multiple_choice": "Product quality",
            "checkbox": ["Website", "Email"],
            "yes_no": True,
            "text": "The product quality was strong and the guidance was useful.",
            "long_text": "The overall experience was positive. I would like shorter wait times for follow-up emails, but the final answer solved my question well.",
        },
        {
            "rating_5": 3,
            "rating_10": 6,
            "nps": 6,
            "multiple_choice": "Pricing",
            "checkbox": ["Email", "Phone"],
            "yes_no": True,
            "text": "The answer was useful, but it took longer than expected.",
            "long_text": "The service was acceptable and the person helping me was friendly. The main improvement would be clearer status updates while waiting.",
        },
        {
            "rating_5": 2,
            "rating_10": 4,
            "nps": 3,
            "multiple_choice": "Onboarding",
            "checkbox": ["Website", "Email"],
            "yes_no": False,
            "text": "The instructions were confusing and I had to repeat details.",
            "long_text": "I did not feel the issue was understood at first. The team eventually helped, but the onboarding flow should explain the next step more clearly.",
        },
        {
            "rating_5": 5,
            "rating_10": 10,
            "nps": 10,
            "multiple_choice": "Onboarding",
            "checkbox": ["Mobile app", "Live chat"],
            "yes_no": True,
            "text": "The onboarding felt smooth, friendly, and very efficient.",
            "long_text": "Everything was easy to follow. The combination of fast chat support and simple product instructions made the experience excellent.",
        },
        {
            "rating_5": 4,
            "rating_10": 7,
            "nps": 7,
            "multiple_choice": "Support",
            "checkbox": ["Phone", "Email"],
            "yes_no": True,
            "text": "The support agent was patient and professional.",
            "long_text": "My experience was good overall. I would prefer a summary email with the exact next steps after the call to avoid confusion.",
        },
        {
            "rating_5": 1,
            "rating_10": 2,
            "nps": 1,
            "multiple_choice": "Pricing",
            "checkbox": ["Website"],
            "yes_no": False,
            "text": "The pricing information was hard to understand.",
            "long_text": "I left frustrated because the page did not explain the limits clearly. The team should make the pricing tiers and response times easier to compare.",
        },
        {
            "rating_5": 4,
            "rating_10": 8,
            "nps": 8,
            "multiple_choice": "Product quality",
            "checkbox": ["Website", "Mobile app"],
            "yes_no": True,
            "text": "The interface was reliable and easy to navigate.",
            "long_text": "The experience was clean and the product felt dependable. I would only improve the help text for first-time users.",
        },
        {
            "rating_5": 3,
            "rating_10": 5,
            "nps": 5,
            "multiple_choice": "Support",
            "checkbox": ["Live chat"],
            "yes_no": True,
            "text": "The help was fine, but not very detailed.",
            "long_text": "The interaction solved the immediate problem. A more detailed explanation would have helped me avoid asking another question later.",
        },
        {
            "rating_5": 5,
            "rating_10": 9,
            "nps": 9,
            "multiple_choice": "Onboarding",
            "checkbox": ["Website", "Email", "Live chat"],
            "yes_no": True,
            "text": "The whole process felt thoughtful and well organized.",
            "long_text": "I liked how every message matched the previous step. The experience gave me confidence that the company understands customers.",
        },
    ],
    "Product Experience Feedback": [
        {
            "rating_5": 5,
            "rating_10": 9,
            "nps": 9,
            "multiple_choice": "Dashboard",
            "checkbox": ["Analytics", "Exports"],
            "yes_no": True,
            "text": "The dashboard makes performance easy to understand.",
            "long_text": "The product gives a clear view of important activity without feeling crowded. The export workflow also saves time for weekly reporting.",
        },
        {
            "rating_5": 4,
            "rating_10": 8,
            "nps": 8,
            "multiple_choice": "Reports",
            "checkbox": ["Exports", "Templates"],
            "yes_no": True,
            "text": "The report templates are practical and easy to reuse.",
            "long_text": "I liked the structure of the reports. It would be even better if saved filters were more visible when returning to a report.",
        },
        {
            "rating_5": 3,
            "rating_10": 6,
            "nps": 5,
            "multiple_choice": "Integrations",
            "checkbox": ["Notifications", "Team access"],
            "yes_no": True,
            "text": "The integration worked, but setup required trial and error.",
            "long_text": "The product is useful once connected. The setup wizard should provide clearer validation and examples for required fields.",
        },
        {
            "rating_5": 2,
            "rating_10": 4,
            "nps": 3,
            "multiple_choice": "Automation",
            "checkbox": ["Notifications"],
            "yes_no": False,
            "text": "The automation rules were difficult to configure.",
            "long_text": "I expected the automation setup to be faster. The product should explain rule conflicts and provide better defaults for new users.",
        },
        {
            "rating_5": 5,
            "rating_10": 10,
            "nps": 10,
            "multiple_choice": "Automation",
            "checkbox": ["Notifications", "Team access", "Analytics"],
            "yes_no": True,
            "text": "The automation saved our team a lot of manual work.",
            "long_text": "The workflow felt powerful and dependable. Once configured, notifications reached the right people and reduced repeated status checks.",
        },
        {
            "rating_5": 4,
            "rating_10": 7,
            "nps": 7,
            "multiple_choice": "Dashboard",
            "checkbox": ["Analytics", "Team access"],
            "yes_no": True,
            "text": "The product feels organized and fast.",
            "long_text": "The core experience is strong. I would improve the onboarding checklist so teams can learn advanced capabilities sooner.",
        },
        {
            "rating_5": 1,
            "rating_10": 3,
            "nps": 2,
            "multiple_choice": "Reports",
            "checkbox": ["Exports"],
            "yes_no": False,
            "text": "Exports failed twice and created extra work.",
            "long_text": "The product was frustrating during reporting. The export status should be more transparent and failures should include clear recovery guidance.",
        },
        {
            "rating_5": 4,
            "rating_10": 8,
            "nps": 8,
            "multiple_choice": "Integrations",
            "checkbox": ["Notifications", "Team access"],
            "yes_no": True,
            "text": "The integration alerts were very helpful.",
            "long_text": "I appreciated how quickly updates appeared after the integration was connected. Better documentation would make the first setup smoother.",
        },
        {
            "rating_5": 3,
            "rating_10": 6,
            "nps": 6,
            "multiple_choice": "Dashboard",
            "checkbox": ["Analytics"],
            "yes_no": True,
            "text": "The dashboard is useful, but some labels are unclear.",
            "long_text": "The main data is valuable. A few terms need tooltips or examples so new users can interpret the metrics correctly.",
        },
        {
            "rating_5": 5,
            "rating_10": 9,
            "nps": 9,
            "multiple_choice": "Reports",
            "checkbox": ["Analytics", "Exports", "Templates"],
            "yes_no": True,
            "text": "Reporting is polished and saves time.",
            "long_text": "The product helped us prepare a clear update for leadership. The templates and export quality were both excellent.",
        },
    ],
    "Support Quality Review": [
        {
            "rating_5": 5,
            "rating_10": 10,
            "nps": 10,
            "multiple_choice": "Order status",
            "checkbox": ["Speed", "Clarity", "Accuracy"],
            "yes_no": True,
            "text": "The support team answered quickly and clearly.",
            "long_text": "The representative understood the order issue immediately and gave a precise update. The interaction felt professional and reassuring.",
        },
        {
            "rating_5": 4,
            "rating_10": 8,
            "nps": 8,
            "multiple_choice": "Returns",
            "checkbox": ["Empathy", "Clarity"],
            "yes_no": True,
            "text": "The return process was explained with patience.",
            "long_text": "Support made the return policy easy to understand. A faster confirmation email would make the experience even better.",
        },
        {
            "rating_5": 3,
            "rating_10": 6,
            "nps": 5,
            "multiple_choice": "Billing",
            "checkbox": ["Follow-up", "Empathy"],
            "yes_no": True,
            "text": "The billing answer was acceptable but slow.",
            "long_text": "The agent was polite and eventually resolved the issue. I would improve wait times and provide clearer updates while the case is reviewed.",
        },
        {
            "rating_5": 2,
            "rating_10": 4,
            "nps": 3,
            "multiple_choice": "Product question",
            "checkbox": ["Empathy"],
            "yes_no": False,
            "text": "The answer did not fully address my product question.",
            "long_text": "The agent was friendly, but the response felt generic. I needed more specific guidance about the product fit and available alternatives.",
        },
        {
            "rating_5": 5,
            "rating_10": 9,
            "nps": 9,
            "multiple_choice": "Returns",
            "checkbox": ["Speed", "Empathy", "Follow-up"],
            "yes_no": True,
            "text": "The return was handled smoothly and kindly.",
            "long_text": "Support made a stressful situation easy. The follow-up message confirmed every step and the refund timeline was clear.",
        },
        {
            "rating_5": 4,
            "rating_10": 8,
            "nps": 7,
            "multiple_choice": "Order status",
            "checkbox": ["Accuracy", "Clarity"],
            "yes_no": True,
            "text": "The order update was accurate and useful.",
            "long_text": "I received the information I needed. It would help if tracking links were included automatically in the first support response.",
        },
        {
            "rating_5": 1,
            "rating_10": 2,
            "nps": 1,
            "multiple_choice": "Billing",
            "checkbox": ["Follow-up"],
            "yes_no": False,
            "text": "The billing issue was not solved.",
            "long_text": "I had to repeat the same details several times and still did not get a clear answer. The escalation process needs better ownership.",
        },
        {
            "rating_5": 4,
            "rating_10": 7,
            "nps": 7,
            "multiple_choice": "Product question",
            "checkbox": ["Clarity", "Accuracy"],
            "yes_no": True,
            "text": "The product explanation was clear.",
            "long_text": "The answer helped me choose the right item. A comparison table would make this kind of question even easier to resolve.",
        },
        {
            "rating_5": 3,
            "rating_10": 6,
            "nps": 6,
            "multiple_choice": "Returns",
            "checkbox": ["Empathy", "Follow-up"],
            "yes_no": True,
            "text": "The support was polite but a little inconsistent.",
            "long_text": "The case was resolved, but two messages gave different timing expectations. Consistent language would improve confidence.",
        },
        {
            "rating_5": 5,
            "rating_10": 9,
            "nps": 10,
            "multiple_choice": "Order status",
            "checkbox": ["Speed", "Clarity", "Empathy"],
            "yes_no": True,
            "text": "The team was fast, friendly, and precise.",
            "long_text": "This was one of the best support interactions I have had. The answer was immediate, accurate, and easy to act on.",
        },
    ],
}


def clear_demo_data(db: Session) -> None:
    demo_owner_ids = select(User.id).where(User.email.in_(DEMO_BUSINESS_EMAILS))
    demo_company_ids = select(Company.id).where(
        or_(
            Company.owner_id.in_(demo_owner_ids),
            Company.name.in_(DEMO_COMPANY_NAMES),
        )
    )
    demo_form_ids = select(Form.id).where(Form.company_id.in_(demo_company_ids))
    demo_response_ids = select(Response.id).where(Response.form_id.in_(demo_form_ids))

    db.execute(delete(Answer).where(Answer.response_id.in_(demo_response_ids)))
    db.execute(delete(Response).where(Response.id.in_(demo_response_ids)))
    db.execute(delete(Question).where(Question.form_id.in_(demo_form_ids)))
    db.execute(delete(Form).where(Form.id.in_(demo_form_ids)))
    db.execute(delete(Company).where(Company.id.in_(demo_company_ids)))
    db.flush()


def upsert_user(db: Session, *, email: str, full_name: str, role: str) -> User:
    user = db.scalar(select(User).where(User.email == email))
    password_hash = get_password_hash(PASSWORD)

    if user is None:
        user = User(
            email=email,
            password_hash=password_hash,
            role=role,
            full_name=full_name,
        )
        db.add(user)
    else:
        user.password_hash = password_hash
        user.role = role
        user.full_name = full_name

    db.flush()
    return user


def create_companies(db: Session, business_users: dict[str, User]) -> dict[str, Company]:
    companies: dict[str, Company] = {}

    for email, _full_name, company_name in BUSINESS_USERS:
        company = Company(
            owner_id=business_users[email].id,
            name=company_name,
            description=(
                "Demo workspace with realistic feedback forms, responses, "
                "sentiment labels, and keyword extraction."
            ),
            notification_email=email,
            notify_on_response=True,
        )
        db.add(company)
        db.flush()
        companies[company_name] = company

    return companies


def create_forms(db: Session, companies: dict[str, Company]) -> list[Form]:
    forms: list[Form] = []

    for definition in FORM_DEFINITIONS:
        form = Form(
            company_id=companies[definition["company"]].id,
            title=definition["title"],
            description=definition["description"],
            is_active=True,
        )
        form.questions = [
            Question(
                type=question["type"],
                label=question["label"],
                options=question.get("options"),
                order=order,
                required=question["required"],
            )
            for order, question in enumerate(definition["questions"])
        ]
        db.add(form)
        db.flush()
        forms.append(form)

    return forms


def answer_for_question(question: Question, response_data: dict[str, Any]) -> Answer:
    if question.type in {"rating_5", "rating_10", "nps"}:
        return Answer(
            question_id=question.id,
            value_number=float(response_data[question.type]),
        )

    if question.type in {"text", "long_text"}:
        text_value = str(response_data[question.type])
        analysis = analyze_text(text_value)
        return Answer(
            question_id=question.id,
            value_text=text_value,
            sentiment_score=analysis["sentiment_score"],
            sentiment_label=analysis["sentiment_label"],
            keywords=analysis["keywords"],
        )

    if question.type == "multiple_choice":
        return Answer(
            question_id=question.id,
            value_options=response_data["multiple_choice"],
        )

    if question.type == "checkbox":
        return Answer(
            question_id=question.id,
            value_options=response_data["checkbox"],
        )

    if question.type == "yes_no":
        return Answer(
            question_id=question.id,
            value_options=response_data["yes_no"],
        )

    raise ValueError(f"Unsupported question type: {question.type}")


def apply_overall_sentiment(response: Response) -> None:
    scores = [
        answer.sentiment_score
        for answer in response.answers
        if answer.sentiment_score is not None
    ]

    if not scores:
        response.overall_sentiment_score = None
        response.overall_sentiment_label = None
        return

    score = sum(scores) / len(scores)
    response.overall_sentiment_score = score
    response.overall_sentiment_label = sentiment_label_from_score(score)


def create_responses(db: Session, forms: list[Form], clients: list[User]) -> int:
    now = datetime.now(timezone.utc)
    created_count = 0

    for form in forms:
        response_rows = RESPONSE_BANK[form.title]

        for index, response_data in enumerate(response_rows):
            response = Response(
                form_id=form.id,
                client_id=clients[(created_count + index) % len(clients)].id,
                submitted_at=now - timedelta(days=created_count, hours=index),
            )
            response.answers = [
                answer_for_question(question, response_data)
                for question in sorted(form.questions, key=lambda item: item.order)
            ]
            apply_overall_sentiment(response)
            db.add(response)
            created_count += 1

    db.flush()
    return created_count


def seed_demo_data() -> None:
    with SessionLocal() as db:
        clear_demo_data(db)

        business_users = {
            email: upsert_user(db, email=email, full_name=full_name, role="business")
            for email, full_name, _company_name in BUSINESS_USERS
        }
        clients = [
            upsert_user(db, email=email, full_name=full_name, role="client")
            for email, full_name in CLIENT_USERS
        ]
        companies = create_companies(db, business_users)
        forms = create_forms(db, companies)
        response_count = create_responses(db, forms, clients)

        db.commit()

    print("\nDemo data seeded successfully.")
    print(f"Companies created: {len(DEMO_COMPANY_NAMES)}")
    print(f"Forms created: {len(FORM_DEFINITIONS)}")
    print(f"Responses created: {response_count}")
    print("\nDemo business accounts:")
    for email in DEMO_BUSINESS_EMAILS:
        print(f"  {email} / {PASSWORD}")
    print("\nDemo client accounts:")
    for email in DEMO_CLIENT_EMAILS:
        print(f"  {email} / {PASSWORD}")


if __name__ == "__main__":
    seed_demo_data()
