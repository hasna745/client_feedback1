# Feedback Platform Frontend

React 18 + Vite + TypeScript frontend for the Customer Feedback Platform backend.

The UI uses Tailwind CSS, shadcn-style local components, React Router, TanStack
Query, Axios, React Hook Form, Zod, Recharts, react-wordcloud, lucide-react,
toast notifications, loading skeletons, and responsive dashboard layouts.

## Setup

Install dependencies from the `frontend` directory:

```powershell
npm.cmd install
```

Start the Vite dev server:

```powershell
npm.cmd run dev
```

Open:

```text
http://localhost:5173
```

The API client uses:

```text
http://localhost:8000
```

Make sure the FastAPI backend is running and that its `CORS_ORIGINS` includes `http://localhost:5173`.

## Available Scripts

```powershell
npm.cmd run dev
npm.cmd run build
npm.cmd run preview
```

## Pages

- `/login`
- `/register`
- `/business`
- `/company`
- `/forms`
- `/forms/new`
- `/forms/:id/edit`
- `/forms/:id`
- `/responses/:id`
- `/analytics`
- `/submit`
- `/responses`

Business routes require a business user. Client routes require a client user.
The shared response detail route is protected for both roles and relies on the
backend for tenant-safe access.
