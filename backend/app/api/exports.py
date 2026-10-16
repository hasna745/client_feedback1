from datetime import datetime
from contextlib import redirect_stderr, redirect_stdout
from html import escape
from io import StringIO
import csv
import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from fastapi.responses import Response as FastAPIResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.analytics import (
    get_form_rating_averages,
    get_form_sentiment_distribution,
    get_form_top_keywords,
    load_company_form,
)
from app.api.companies import get_current_company
from app.core.database import get_db
from app.models import Answer, Company, Form, Response

router = APIRouter(tags=["exports"])


def format_datetime(value: datetime) -> str:
    return value.isoformat()


def format_json_value(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(value, str):
        return value

    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def format_answer_value(answer: Answer) -> str:
    if answer.value_text is not None:
        return answer.value_text

    if answer.value_number is not None:
        return str(answer.value_number)

    return format_json_value(answer.value_options)


def format_keywords(keywords: Any) -> str:
    if isinstance(keywords, list):
        return ", ".join(str(keyword) for keyword in keywords)

    return format_json_value(keywords)


def csv_filename(form: Form) -> str:
    return f"form_{form.id}_responses.csv"


def pdf_filename(form: Form) -> str:
    return f"form_{form.id}_report.pdf"


def load_form_responses(db: Session, form_id: int) -> list[Response]:
    return list(
        db.scalars(
            select(Response)
            .options(selectinload(Response.answers).selectinload(Answer.question))
            .where(Response.form_id == form_id)
            .order_by(Response.submitted_at.asc(), Response.id.asc())
        )
    )


def build_responses_csv(form: Form, responses: list[Response]) -> str:
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "submitted_at",
            "response_id",
            "overall_sentiment_label",
            "question_label",
            "question_type",
            "answer_value",
            "answer_sentiment_label",
            "keywords",
        ]
    )

    for response in responses:
        for answer in sorted(
            response.answers,
            key=lambda item: (item.question.order, item.question.id),
        ):
            writer.writerow(
                [
                    format_datetime(response.submitted_at),
                    response.id,
                    response.overall_sentiment_label or "",
                    answer.question.label,
                    answer.question.type,
                    format_answer_value(answer),
                    answer.sentiment_label or "",
                    format_keywords(answer.keywords),
                ]
            )

    return output.getvalue()


def html_list(items: list[str]) -> str:
    if not items:
        return "<li>None</li>"

    return "".join(f"<li>{escape(item)}</li>" for item in items)


def build_pdf_html(
    form: Form,
    total_responses: int,
    average_ratings: list[Any],
    sentiment_distribution: dict[str, int],
    top_keywords: list[Any],
) -> str:
    rating_rows = "".join(
        "<tr>"
        f"<td>{escape(rating.label)}</td>"
        f"<td>{escape(rating.type)}</td>"
        f"<td>{rating.average_rating:.2f}</td>"
        f"<td>{rating.response_count}</td>"
        "</tr>"
        for rating in average_ratings
        if rating.average_rating is not None
    )
    if not rating_rows:
        rating_rows = '<tr><td colspan="4">No rating answers yet.</td></tr>'

    sentiment_rows = "".join(
        "<tr>"
        f"<td>{escape(label.title())}</td>"
        f"<td>{count}</td>"
        "</tr>"
        for label, count in sentiment_distribution.items()
    )
    keywords = [
        f"{keyword.keyword} ({keyword.count})"
        for keyword in top_keywords
    ]

    return f"""
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {{
            color: #1f2937;
            font-family: Arial, sans-serif;
            font-size: 12px;
            line-height: 1.45;
          }}
          h1 {{
            color: #111827;
            font-size: 24px;
            margin-bottom: 4px;
          }}
          h2 {{
            border-bottom: 1px solid #d1d5db;
            color: #111827;
            font-size: 16px;
            margin-top: 24px;
            padding-bottom: 6px;
          }}
          .meta {{
            color: #4b5563;
            margin-bottom: 20px;
          }}
          table {{
            border-collapse: collapse;
            margin-top: 8px;
            width: 100%;
          }}
          th, td {{
            border: 1px solid #d1d5db;
            padding: 7px;
            text-align: left;
          }}
          th {{
            background: #f3f4f6;
          }}
          ul {{
            margin-top: 8px;
            padding-left: 20px;
          }}
        </style>
      </head>
      <body>
        <h1>{escape(form.title)}</h1>
        <div class="meta">Form ID: {form.id} | Total responses: {total_responses}</div>

        <h2>Average Ratings</h2>
        <table>
          <thead>
            <tr>
              <th>Question</th>
              <th>Type</th>
              <th>Average</th>
              <th>Responses</th>
            </tr>
          </thead>
          <tbody>{rating_rows}</tbody>
        </table>

        <h2>Sentiment Distribution</h2>
        <table>
          <thead>
            <tr>
              <th>Sentiment</th>
              <th>Responses</th>
            </tr>
          </thead>
          <tbody>{sentiment_rows}</tbody>
        </table>

        <h2>Top Keywords</h2>
        <ul>{html_list(keywords)}</ul>
      </body>
    </html>
    """


def escape_pdf_text(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .replace("\r", " ")
    )


def wrap_pdf_line(text: str, max_length: int = 92) -> list[str]:
    words = text.split()
    if not words:
        return [""]

    lines: list[str] = []
    current_line = words[0]

    for word in words[1:]:
        if len(current_line) + len(word) + 1 > max_length:
            lines.append(current_line)
            current_line = word
        else:
            current_line = f"{current_line} {word}"

    lines.append(current_line)
    return lines


def build_pdf_text_lines(
    form: Form,
    total_responses: int,
    average_ratings: list[Any],
    sentiment_distribution: dict[str, int],
    top_keywords: list[Any],
) -> list[str]:
    lines = [
        f"Feedback Report: {form.title}",
        f"Form ID: {form.id}",
        f"Total responses: {total_responses}",
        "",
        "Average Ratings",
    ]

    if average_ratings:
        for rating in average_ratings:
            average = (
                f"{rating.average_rating:.2f}"
                if rating.average_rating is not None
                else "N/A"
            )
            lines.append(
                f"- {rating.label} ({rating.type}): {average} from {rating.response_count} responses"
            )
    else:
        lines.append("- No rating questions.")

    lines.extend(["", "Sentiment Distribution"])
    for label, count in sentiment_distribution.items():
        lines.append(f"- {label.title()}: {count}")

    lines.extend(["", "Top Keywords"])
    if top_keywords:
        for keyword in top_keywords:
            lines.append(f"- {keyword.keyword}: {keyword.count}")
    else:
        lines.append("- None")

    wrapped_lines: list[str] = []
    for line in lines:
        wrapped_lines.extend(wrap_pdf_line(line))

    return wrapped_lines


def build_simple_pdf(lines: list[str]) -> bytes:
    escaped_lines = [escape_pdf_text(line) for line in lines]
    text_commands = ["BT", "/F1 11 Tf", "50 780 Td", "14 TL"]

    for index, line in enumerate(escaped_lines):
        if index == 0:
            text_commands.append(f"({line}) Tj")
        else:
            text_commands.append(f"T* ({line}) Tj")

    text_commands.append("ET")
    stream = "\n".join(text_commands).encode("latin-1", errors="replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n"
        + stream
        + b"\nendstream",
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]

    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode("ascii"))
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")

    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))

    pdf.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(pdf)


def render_pdf_report(
    form: Form,
    total_responses: int,
    average_ratings: list[Any],
    sentiment_distribution: dict[str, int],
    top_keywords: list[Any],
) -> bytes:
    html = build_pdf_html(
        form=form,
        total_responses=total_responses,
        average_ratings=average_ratings,
        sentiment_distribution=sentiment_distribution,
        top_keywords=top_keywords,
    )

    try:
        with redirect_stdout(StringIO()), redirect_stderr(StringIO()):
            from weasyprint import HTML

            return HTML(string=html).write_pdf()
    except Exception:
        return build_simple_pdf(
            build_pdf_text_lines(
                form=form,
                total_responses=total_responses,
                average_ratings=average_ratings,
                sentiment_distribution=sentiment_distribution,
                top_keywords=top_keywords,
            )
        )


@router.get("/api/forms/{form_id}/export/csv")
def export_form_responses_csv(
    form_id: int,
    company: Annotated[Company, Depends(get_current_company)],
    db: Session = Depends(get_db),
) -> FastAPIResponse:
    form = load_company_form(db, company.id, form_id)
    responses = load_form_responses(db, form.id)
    csv_content = build_responses_csv(form, responses)

    return FastAPIResponse(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{csv_filename(form)}"',
        },
    )


@router.get("/api/forms/{form_id}/export/pdf")
def export_form_report_pdf(
    form_id: int,
    company: Annotated[Company, Depends(get_current_company)],
    db: Session = Depends(get_db),
) -> FastAPIResponse:
    form = load_company_form(db, company.id, form_id)
    responses = load_form_responses(db, form.id)
    average_ratings = get_form_rating_averages(db, form.id)
    sentiment_distribution = get_form_sentiment_distribution(db, form.id)
    top_keywords = get_form_top_keywords(db, form.id)
    pdf_content = render_pdf_report(
        form=form,
        total_responses=len(responses),
        average_ratings=average_ratings,
        sentiment_distribution=sentiment_distribution,
        top_keywords=top_keywords,
    )

    return FastAPIResponse(
        content=pdf_content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{pdf_filename(form)}"',
        },
    )
