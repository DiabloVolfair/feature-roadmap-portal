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

## Sprint 1A Authentication

Sprint 1A adds JWT-based authentication on top of the Sprint 0 scaffolding: user registration, login, silent session refresh, logout, and route protection, along with the matching frontend auth service, auth context, working Login/Signup pages, and an authentication-aware Navbar.

### Tokens

- **Access Token** — a JWT containing a `sub` claim (the user's `id`) and a `type` claim of `"access"`. It expires 15 minutes after issuance (`exp` = now + `ACCESS_TOKEN_EXPIRE_MINUTES` minutes). It is returned only in the response body of the login and refresh endpoints and is never set as a cookie; the frontend keeps it in memory only (never in `localStorage`/`sessionStorage`).
- **Refresh Token** — a JWT containing a `sub` claim (the user's `id`) and a `type` claim of `"refresh"`. It expires 7 days after issuance (`exp` = now + `REFRESH_TOKEN_EXPIRE_DAYS` days). It is transmitted exclusively via the httpOnly refresh token cookie and is also persisted on the corresponding user document so it can be validated and rotated.

### Refresh Token Cookie

The refresh token cookie is set with the attributes `httponly=true`, `secure=false` (suitable for local development over HTTP), `samesite=lax`, and `path=/`. Each successful call to the login endpoint or the refresh endpoint replaces the previously issued refresh token with a newly created one (rotation), invalidating the prior token for that user.

### Auth API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/auth/signup` | Create a new user account. |
| `POST` | `/api/v1/auth/login` | Authenticate with email/password and establish a session (returns an access token, sets the refresh token cookie). |
| `POST` | `/api/v1/auth/refresh` | Rotate the session using the refresh token cookie and obtain a new access token. |
| `POST` | `/api/v1/auth/logout` | End the session and clear the refresh token cookie. |
| `GET` | `/api/v1/auth/me` | Return the currently authenticated user (requires a valid access token). |

### Authentication Environment Variables

- `PROJECT_NAME` — the name of the application, used in logging and documentation.
- `API_PREFIX` — the prefix applied to versioned API routes (e.g. `/api/v1`).
- `JWT_SECRET` — the secret key used to sign and verify access tokens.
- `JWT_REFRESH_SECRET` — the secret key used to sign and verify refresh tokens.
- `ACCESS_TOKEN_EXPIRE_MINUTES` — the access token lifetime, in minutes (default: `15`).
- `REFRESH_TOKEN_EXPIRE_DAYS` — the refresh token lifetime, in days (default: `7`).

## Sprint Status

- ✅ **Sprint 0: Foundation Setup — Completed**

  Sprint 0 established the project scaffolding only: the React + Vite frontend and FastAPI backend project structures, environment configuration, a MongoDB Atlas connection lifecycle (no collections or schemas yet), a consistent API response envelope and CORS setup, placeholder pages and routing, and a single end-to-end integration check where the frontend polls the backend's `/api/v1/health` endpoint and displays its connectivity status. No business logic (authentication, feature request CRUD, voting, comments, moderation, or the roadmap board) has been implemented yet — those are planned for later sprints.

- ✅ **Sprint 1A: Authentication Foundation — Completed**

  Sprint 1A implemented JWT-based authentication: user signup/login/refresh/logout, the `get_current_user`/`get_current_admin` route-protection dependencies, and the Me endpoint on the backend, together with the frontend auth service, auth context, working Login/Signup pages, and an authentication-aware Navbar. Feature request CRUD, voting, comments, moderation, the roadmap board, search, filtering, and pagination are not implemented yet — those are planned for later sprints.
