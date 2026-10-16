from dataclasses import dataclass
from datetime import datetime
from html import escape
import logging
import os

from dotenv import load_dotenv
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

load_dotenv()

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AnswerSummary:
    question_label: str
    answer_value: str
    sentiment_label: str | None = None
    keywords: list[str] | None = None


@dataclass(frozen=True)
class FeedbackNotification:
    recipient_email: str
    form_title: str
    submitted_at: datetime
    overall_sentiment_label: str | None
    answers: list[AnswerSummary]


@dataclass(frozen=True)
class FormInvitation:
    recipient_email: str
    company_name: str
    form_title: str
    form_description: str | None
    form_url: str


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default

    return value.strip().lower() in {"1", "true", "yes", "on"}


def get_smtp_config() -> ConnectionConfig | None:
    server = os.getenv("SMTP_HOST") or os.getenv("MAIL_SERVER")
    port_value = os.getenv("SMTP_PORT") or os.getenv("MAIL_PORT")
    from_email = os.getenv("SMTP_FROM_EMAIL") or os.getenv("MAIL_FROM")

    if not server or not port_value or not from_email:
        return None

    try:
        port = int(port_value)
    except ValueError:
        logger.warning("Invalid SMTP_PORT/MAIL_PORT value; skipping email.")
        return None

    username = os.getenv("SMTP_USERNAME") or os.getenv("MAIL_USERNAME") or ""
    password = os.getenv("SMTP_PASSWORD") or os.getenv("MAIL_PASSWORD") or ""
    ssl_tls = env_bool("SMTP_SSL_TLS", env_bool("MAIL_SSL_TLS", False))
    starttls = env_bool("SMTP_STARTTLS", env_bool("MAIL_STARTTLS", not ssl_tls))

    try:
        return ConnectionConfig(
            MAIL_USERNAME=username,
            MAIL_PASSWORD=password,
            MAIL_FROM=from_email,
            MAIL_FROM_NAME=os.getenv("SMTP_FROM_NAME")
            or os.getenv("MAIL_FROM_NAME")
            or "Feedback Platform",
            MAIL_PORT=port,
            MAIL_SERVER=server,
            MAIL_STARTTLS=starttls,
            MAIL_SSL_TLS=ssl_tls,
            USE_CREDENTIALS=bool(username and password),
            VALIDATE_CERTS=env_bool("SMTP_VALIDATE_CERTS", True),
        )
    except Exception:
        logger.exception("Invalid SMTP configuration; skipping email.")
        return None


def is_email_configured() -> bool:
    return get_smtp_config() is not None


def format_submitted_at(value: datetime) -> str:
    return value.isoformat()


def format_answer_summary(answer: AnswerSummary) -> str:
    parts = [f"{answer.question_label}: {answer.answer_value}"]

    if answer.sentiment_label:
        parts.append(f"sentiment: {answer.sentiment_label}")

    if answer.keywords:
        parts.append(f"keywords: {', '.join(answer.keywords[:5])}")

    return " | ".join(parts)


def build_plain_body(notification: FeedbackNotification) -> str:
    answer_lines = "\n".join(
        f"- {format_answer_summary(answer)}"
        for answer in notification.answers
    )

    return (
        "New feedback response received.\n\n"
        f"Form: {notification.form_title}\n"
        f"Submitted at: {format_submitted_at(notification.submitted_at)}\n"
        f"Overall sentiment: {notification.overall_sentiment_label or 'N/A'}\n\n"
        "Answers:\n"
        f"{answer_lines or '- No answers'}"
    )


def build_html_body(notification: FeedbackNotification) -> str:
    answer_items = "".join(
        f"<li>{escape(format_answer_summary(answer))}</li>"
        for answer in notification.answers
    )

    return f"""
    <html>
      <body>
        <h2>New feedback response received</h2>
        <p><strong>Form:</strong> {escape(notification.form_title)}</p>
        <p><strong>Submitted at:</strong> {escape(format_submitted_at(notification.submitted_at))}</p>
        <p><strong>Overall sentiment:</strong> {escape(notification.overall_sentiment_label or "N/A")}</p>
        <h3>Answers</h3>
        <ul>{answer_items or "<li>No answers</li>"}</ul>
      </body>
    </html>
    """


async def send_feedback_response_notification(
    notification: FeedbackNotification,
) -> None:
    config = get_smtp_config()
    if config is None:
        return

    try:
        message = MessageSchema(
            subject=f"New feedback response: {notification.form_title}",
            recipients=[notification.recipient_email],
            body=build_html_body(notification),
            alternative_body=build_plain_body(notification),
            subtype=MessageType.html,
        )
        await FastMail(config).send_message(message)
    except Exception:
        logger.exception("Failed to send feedback response notification.")


def build_invitation_plain_body(invitation: FormInvitation) -> str:
    description = (
        f"\n\nAbout this form:\n{invitation.form_description}"
        if invitation.form_description
        else ""
    )
    return (
        f"{invitation.company_name} invited you to submit feedback.\n\n"
        f"Form: {invitation.form_title}"
        f"{description}\n\n"
        f"Open the form here:\n{invitation.form_url}"
    )


def build_invitation_html_body(invitation: FormInvitation) -> str:
    description = (
        f"<p>{escape(invitation.form_description)}</p>"
        if invitation.form_description
        else ""
    )
    return f"""
    <html>
      <body>
        <h2>{escape(invitation.company_name)} invited you to submit feedback</h2>
        <p><strong>Form:</strong> {escape(invitation.form_title)}</p>
        {description}
        <p>
          <a href="{escape(invitation.form_url)}">Open feedback form</a>
        </p>
      </body>
    </html>
    """


async def send_form_invitation(invitation: FormInvitation) -> None:
    config = get_smtp_config()
    if config is None:
        return

    try:
        message = MessageSchema(
            subject=f"Feedback request: {invitation.form_title}",
            recipients=[invitation.recipient_email],
            body=build_invitation_html_body(invitation),
            alternative_body=build_invitation_plain_body(invitation),
            subtype=MessageType.html,
        )
        await FastMail(config).send_message(message)
    except Exception:
        logger.exception("Failed to send form invitation.")
