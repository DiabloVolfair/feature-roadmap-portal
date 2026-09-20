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
│       ├── context/      # React context providers (e.g. AuthContext)
│       ├── utils/         # Shared utility/helper functions (e.g. stripMarkdownPreview)
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

## Sprint 1B Authentication Completion

Sprint 1B completes the authentication surface on top of Sprint 1A: simulated email verification, a simulated forgot-password/reset-password flow, verification- and role-based access control (`require_verified_user`/`require_admin`), two minimal protected demo routes, and the corresponding frontend route guards, pages, and a four-state Navbar.

### Email Verification (Simulated)

`POST /api/v1/auth/send-verification` requires an authenticated user (via the existing `get_current_user` dependency) and generates a hashed, single-use Email_Verification_Token with a default lifetime of 24 hours, configurable via `EMAIL_VERIFICATION_EXPIRE_HOURS`. `POST /api/v1/auth/verify-email` requires no authentication — the token itself proves ownership of the account — and consumes the token, setting `is_verified=true` on the associated user.

No real email provider is integrated. "Sending" a verification email is simulated: the endpoint simply creates the token record. The raw token value is only ever included in the response body when `APP_ENV=development`; in production it is never exposed.

### Forgot Password / Reset Password (Simulated)

`POST /api/v1/auth/forgot-password` requires no authentication and always returns the identical message "If an account exists, a reset link has been generated." regardless of whether the submitted email matches an existing account, preventing email enumeration. A hashed, single-use Password_Reset_Token (default lifetime 30 minutes, configurable via `PASSWORD_RESET_EXPIRE_MINUTES`) is generated only when a match is found, and — as with email verification — the raw token is only ever exposed in the response when `APP_ENV=development`.

`POST /api/v1/auth/reset-password` requires no authentication, consumes the token, replaces the user's password hash, and clears the user's stored refresh token hash. Since this project follows a single-session-per-user model (one refresh token hash stored per user document), clearing it is sufficient to terminate any active session for that account.

### RBAC: `require_verified_user` / `require_admin`

Sprint 1B adds two new, stricter Auth_Middleware dependencies alongside Sprint 1A's `get_current_user`/`get_current_admin`:

- `require_verified_user` — requires an authenticated user (via `get_current_user`) whose `is_verified` field is `true`.
- `require_admin` — requires an authenticated, verified user (`is_verified=true`) whose `role` field is `"admin"`.

These are additive: the existing `get_current_admin` dependency (which checks `role == "admin"` only, without checking verification) is unchanged and remains available for backward compatibility. Both new dependencies raise HTTP 403 (not 401) for the specific verification/role failure once authentication itself has already succeeded.

### Frontend Session Persistence and Route Guards

`AuthContext`'s existing Sprint 1A startup session check (calling `refresh`, then `getCurrentUser` on success) already exposes `role` and `is_verified` on the `user` object — no changes to `AuthContext` were needed for this sprint. The new `ProtectedRoute` component gates a route on `isAuthenticated` alone and redirects to `/login` when unauthenticated. The new `AdminRoute` component gates a route on being authenticated, verified, and having the `admin` role, all together, redirecting to `/` when any of those conditions fail.

### Auth API / Dashboard API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/auth/send-verification` | Generate a new email verification token for the authenticated user (simulated send). |
| `POST` | `/api/v1/auth/verify-email` | Consume a verification token and mark the associated account as verified. |
| `POST` | `/api/v1/auth/forgot-password` | Generate a password reset token for a matching account (simulated send), with an enumeration-safe response. |
| `POST` | `/api/v1/auth/reset-password` | Consume a reset token, set a new password, and invalidate the account's active session. |
| `GET` | `/api/v1/user/dashboard` | Minimal demo route protected by `require_verified_user`. |
| `GET` | `/api/v1/admin/dashboard` | Minimal demo route protected by `require_admin`. |

### Sprint 1B Environment Variables

- `EMAIL_VERIFICATION_EXPIRE_HOURS` — the email verification token lifetime, in hours (default: `24`).
- `PASSWORD_RESET_EXPIRE_MINUTES` — the password reset token lifetime, in minutes (default: `30`).
- `APP_ENV` — the application environment mode, which gates whether raw verification/reset tokens appear in API responses (defaults to `"production"` in code when unset, as the safe default).

## Sprint 2A Feature CRUD + Feed

Sprint 2A introduces the project's first real domain resource on top of Sprint 0/1A/1B's foundation: full feature-request CRUD (create/read/update/delete) with author/admin authorization, a public paginated feed with search, category/status filtering, and six sort options, together with the matching frontend feed page, feature details page, create/edit modals, and delete confirmation dialog.

### Feature_API Endpoints

| Method | Path | Authentication |
| --- | --- | --- |
| `POST` | `/api/v1/features` | Requires an authenticated user (`get_current_user`). Creates a feature request. |
| `GET` | `/api/v1/features` | Public — no authentication required. Returns the paginated feed. |
| `GET` | `/api/v1/features/{feature_id}` | Public — no authentication required. Returns a single feature request. |
| `PATCH` | `/api/v1/features/{feature_id}` | Requires an authenticated user (`get_current_user`); author-only authorization is enforced server-side. |
| `DELETE` | `/api/v1/features/{feature_id}` | Requires an authenticated user (`get_current_user`); author-or-admin authorization is enforced server-side. |

### Feed_Endpoint Query Parameters

`GET /api/v1/features` accepts:

- `page` — page number, defaults to `1`, minimum `1`.
- `limit` — items per page, defaults to `20`, must be between `1` and `100`; a value above `100` is rejected with `422` rather than silently clamped.
- `category` — repeatable query parameter (e.g. `?category=ui_ux&category=performance`); may be supplied zero or more times.
- `status` — repeatable query parameter, following the same pattern as `category`.
- `sort` — one of the six values documented below, defaults to `newest`.
- `search` — optional free-text string used for MongoDB text search.

### `PaginatedFeatureResponse` Shape

The feed's success response `data` payload has this shape:

```json
{
  "items": [ /* FeatureFeedResponse objects */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total_items": 42,
    "total_pages": 3,
    "has_next": true,
    "has_previous": false
  }
}
```

### The Six `sort` Values

- `newest` — orders by `created_at` descending (newest first).
- `oldest` — orders by `created_at` ascending (oldest first).
- `most_upvoted` — orders by `vote_count` descending.
- `most_discussed` — orders by `comment_count` descending.
- `trending` — orders by `vote_count` descending with `created_at` descending as a tiebreaker. This is a documented Sprint 2A placeholder, not a real trending algorithm (no time-decay or velocity weighting) — a real trending algorithm is deferred to a later sprint.
- `relevance` — orders by MongoDB's text-search relevance score, and is only meaningful when combined with a `search` term. If `sort=relevance` is requested without a `search` term, the feed falls back to ordering by `created_at` descending instead.

An explicit `sort` value always wins over the mere presence of `search` — there is no implicit switch to relevance ordering just because a `search` term is present. To get relevance ordering, `sort=relevance` must be requested explicitly alongside `search`.

### Filter-Combination Semantics

- Multiple `category` values combine with **OR** (a result matches if its category is any one of the given values).
- Multiple `status` values combine with **OR** (a result matches if its status is any one of the given values).
- The `category` and `status` filters combine with **AND** across the two types: when both are provided, a result must match at least one selected category **and** at least one selected status.

### Feature Fields, Categories, and Statuses

A feature request has four possible `category` values (`ui_ux`, `integrations`, `performance`, `general`) and four possible `status` values (`under_review`, `planned`, `in_progress`, `completed`), defaulting to `under_review` on creation. `title` must be 5-120 characters and `description_markdown` must be 20-10,000 characters. A non-admin can never set `status` through the API — `FeatureUpdate` structurally has no `status` field at all, so there's nothing to send even if a client tried.

### Frontend Additions

`HomePage` was rewritten as the public feature feed: a search bar, category/status/sort filter dropdowns, and pagination controls, all synchronized to the URL so a reloaded or shared link preserves the exact feed state being viewed. The new `FeatureDetailsPage` (at `/features/:featureId`) displays a single feature's full data, rendering `description_markdown` as raw, whitespace-preserved plain text rather than fully rendered markdown — full markdown rendering is deferred to a future sprint. `CreateFeatureModal` and `EditFeatureModal` provide the create and author-only edit flows, and a `ConfirmDialog`-backed delete confirmation gates deletion behind an explicit confirmation for the feature's author or an admin.

## Sprint Status

- ✅ **Sprint 0: Foundation Setup — Completed**

  Sprint 0 established the project scaffolding only: the React + Vite frontend and FastAPI backend project structures, environment configuration, a MongoDB Atlas connection lifecycle (no collections or schemas yet), a consistent API response envelope and CORS setup, placeholder pages and routing, and a single end-to-end integration check where the frontend polls the backend's `/api/v1/health` endpoint and displays its connectivity status. No business logic (authentication, feature request CRUD, voting, comments, moderation, or the roadmap board) has been implemented yet — those are planned for later sprints.

- ✅ **Sprint 1A: Authentication Foundation — Completed**

  Sprint 1A implemented JWT-based authentication: user signup/login/refresh/logout, the `get_current_user`/`get_current_admin` route-protection dependencies, and the Me endpoint on the backend, together with the frontend auth service, auth context, working Login/Signup pages, and an authentication-aware Navbar. Feature request CRUD, voting, comments, moderation, the roadmap board, search, filtering, and pagination are not implemented yet — those are planned for later sprints.

- ✅ **Sprint 1B: Authentication Completion — Completed**

  Sprint 1B completed the authentication surface on top of Sprint 1A: simulated email verification, a simulated forgot-password/reset-password flow, the `require_verified_user`/`require_admin` RBAC dependencies, two minimal protected demo routes (`/api/v1/user/dashboard`, `/api/v1/admin/dashboard`), and the corresponding frontend route guards (`ProtectedRoute`, `AdminRoute`), verification/forgot-password/reset-password pages, minimal dashboard pages, and a four-state Navbar. Feature request CRUD, voting, comments, moderation, the roadmap board, search, filtering, and pagination are not implemented yet — those are planned for later sprints.

- ✅ **Sprint 2A: Feature CRUD + Feed — Completed**

  Sprint 2A implemented the project's first domain resource: full feature-request CRUD (create/read/update/delete) with author/admin authorization, a public paginated feed with search, category/status filtering, and six sort options, together with the frontend feed page (search bar, filter dropdowns, pagination), feature detail page, and create/edit/delete UI. Voting, threaded comments, the admin Kanban board, real roadmap logic, optimistic UI, and drag-and-drop are not implemented yet — those are planned for later sprints.
