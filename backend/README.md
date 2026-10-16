# Customer Feedback Platform Backend

FastAPI backend for a multi-tenant customer feedback platform. Business users create companies, build feedback forms, review responses, view analytics, export reports, and receive email notifications. Client users submit feedback to active forms.

## Features

- JWT authentication with business and client roles
- Company ownership and tenant-scoped business access
- Form builder with multiple question types
- Feedback response submission with answer validation
- VADER sentiment analysis and YAKE keyword extraction for text answers
- Analytics overview and per-form analytics
- CSV and PDF exports
- Optional email notifications for new responses
- Alembic migrations for PostgreSQL

## Setup

Create and activate a virtual environment from the `backend` directory:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Create a local environment file:

```powershell
Copy-Item .env.example .env
```

Update `.env` with your local values. The app also has local development fallbacks for `DATABASE_URL` and `JWT_SECRET_KEY`, but real deployments should always set both explicitly.

## PostgreSQL

Create the database used by the default local `DATABASE_URL`:

```sql
CREATE DATABASE feedback_db;
```

Default local connection string:

```text
postgresql://postgres:postgres123@localhost:5432/feedback_db
```

If your PostgreSQL user, password, host, port, or database name differs, update `DATABASE_URL` in `.env`.

## Environment Variables

Required for production:

```text
DATABASE_URL
JWT_SECRET_KEY
CORS_ORIGINS
```

Optional SMTP settings for email notifications:

```text
SMTP_HOST
SMTP_PORT
SMTP_USERNAME
SMTP_PASSWORD
SMTP_FROM_EMAIL
SMTP_FROM_NAME
SMTP_STARTTLS
SMTP_SSL_TLS
SMTP_VALIDATE_CERTS
```

Email sending is skipped safely when SMTP host, port, or from address is missing. The service also accepts equivalent `MAIL_*` variable names used by `fastapi-mail`.

## Migrations

Run all migrations:

```powershell
.\venv\Scripts\alembic.exe upgrade head
```

Create a new migration after model changes:

```powershell
.\venv\Scripts\alembic.exe revision --autogenerate -m "describe_change"
```

Check the current migration:

```powershell
.\venv\Scripts\alembic.exe current
```

## Run The Server

From the `backend` directory:

```powershell
.\venv\Scripts\uvicorn.exe app.main:app --reload
```

Then open:

```text
http://localhost:8000/docs
```

## Main API Endpoints

Authentication:

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
```

Companies:

```text
POST  /api/companies
GET   /api/companies/me
PATCH /api/companies/me
```

Forms:

```text
POST   /api/forms
GET    /api/forms
GET    /api/forms/{id}
PUT    /api/forms/{id}
DELETE /api/forms/{id}
PATCH  /api/forms/{id}/toggle-active
```

Responses:

```text
POST /api/forms/{form_id}/responses
GET  /api/forms/{form_id}/responses
GET  /api/responses/me
GET  /api/responses/{id}
```

Analytics:

```text
GET /api/analytics/overview
GET /api/analytics/forms/{form_id}
```

Exports:

```text
GET /api/forms/{form_id}/export/csv
GET /api/forms/{form_id}/export/pdf
```

Health check:

```text
GET /api/test-db
```

## Verification Scripts

The `scripts` directory contains safe verification scripts that create temporary records and clean them up:

```powershell
.\venv\Scripts\python.exe scripts\verify_nlp.py
.\venv\Scripts\python.exe scripts\verify_analytics.py
.\venv\Scripts\python.exe scripts\verify_exports.py
.\venv\Scripts\python.exe scripts\verify_email_notifications.py
```

## Demo Seed Data

After running migrations, seed a realistic demo workspace with business users, client users, forms, questions, responses, NLP sentiment, and keywords:

```powershell
py scripts/seed_demo_data.py
```

The seed is idempotent for the included demo companies and accounts. It recreates the demo company data and prints the demo login accounts when finished.

## PDF Export Note

PDF export uses WeasyPrint when its native runtime dependencies are available. On Windows, WeasyPrint may require GTK/Pango libraries. If those native libraries are missing, this project falls back to a small built-in PDF renderer so the export endpoint still returns a valid PDF.
