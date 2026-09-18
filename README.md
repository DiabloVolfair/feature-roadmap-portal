# Feature Request & Public Roadmap Portal

A full-stack web application where users can submit feature requests, vote and comment on them, and track their progress on a public roadmap. Admins can moderate submissions and manage the roadmap's status pipeline.

## Tech Stack

**Frontend:** React, Vite, Tailwind CSS

**Backend:** Python, FastAPI, Uvicorn (with MongoDB Atlas via Motor)

## Project Structure

```
feature-roadmap-portal/
├── frontend/
│   └── src/
│       ├── components/   # Shared UI components (Navbar, Layout, BackendStatusCard, ...)
│       ├── pages/        # Route-level pages (HomePage, LoginPage, SignupPage, RoadmapPage, NotFoundPage)
│       ├── services/     # Axios instance and API service modules
│       ├── hooks/        # Custom React hooks (e.g. useHealthCheck)
│       ├── context/      # React context providers (reserved for future sprints)
│       ├── utils/         # Shared utility/helper functions (reserved for future sprints)
│       └── assets/        # Static assets (images, icons, etc.)
└── backend/
    └── app/
        ├── api/          # Versioned API routers (e.g. api/v1)
        ├── core/         # App configuration and cross-cutting setup (settings, CORS)
        ├── db/           # Database connection lifecycle (MongoDB / Motor)
        ├── middleware/   # Custom middleware
        ├── models/       # Data models / schemas
        ├── services/     # Business logic
        └── utils/        # Shared utility/helper functions (e.g. response envelope helpers)
```

## Getting Started

### Prerequisites

- Node.js and npm (for the frontend)
- Python 3.12 (for the backend)
- A MongoDB Atlas cluster and connection string

### Frontend

Install dependencies:

```bash
cd frontend
npm install
```

Create a `.env` file from the example and set the backend URL:

```bash
cp .env.example .env
```

Then edit `frontend/.env` and set `VITE_API_BASE_URL` to the URL where the backend is running (defaults to `http://localhost:8000`).

Start the development server:

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`.

### Backend

Create and activate a virtual environment (recommended), then install dependencies:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # On Windows
# source .venv/bin/activate   # On macOS/Linux

pip install -r requirements.txt
```

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Then edit `backend/.env` and populate the values before starting the server:

- `MONGODB_URI` — your MongoDB Atlas connection string
- `DATABASE_NAME` — the name of the database to use
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — long random secret values used to sign access/refresh tokens
- `ACCESS_TOKEN_EXPIRE_MINUTES` — access token lifetime in minutes (default: `15`)
- `REFRESH_TOKEN_EXPIRE_DAYS` — refresh token lifetime in days (default: `7`)
- `FRONTEND_URL` — the URL of the running frontend, used for CORS (default: `http://localhost:5173`)

Start the development server:

```bash
uvicorn app.main:app --reload
```

The backend will be available at `http://localhost:8000`. You can verify it's running by requesting `GET /api/v1/health`.

## Sprint Status

- ✅ **Sprint 0: Foundation Setup — Completed**

  Sprint 0 established the project scaffolding only: the React + Vite frontend and FastAPI backend project structures, environment configuration, a MongoDB Atlas connection lifecycle (no collections or schemas yet), a consistent API response envelope and CORS setup, placeholder pages and routing, and a single end-to-end integration check where the frontend polls the backend's `/api/v1/health` endpoint and displays its connectivity status. No business logic (authentication, feature request CRUD, voting, comments, moderation, or the roadmap board) has been implemented yet — those are planned for later sprints.
