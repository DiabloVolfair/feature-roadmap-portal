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

## Sprint 2B Feature Details, Markdown Editor & UI Polish

Sprint 2B builds a polished Feature Details experience on top of Sprint 2A's `features` collection, `Feature_Service`, and `Feature_API`: an extended Get_Feature_Endpoint response carrying author/ownership/related-feature metadata, a shared, sanitized markdown-rendering pipeline used by both the read-only detail view and a new live editor, a rewritten `FeatureDetailsPage`, a reusable `MarkdownEditor` used by both `CreateFeatureModal` and `EditFeatureModal`, and a set of new presentational components (`AuthorCard`, `StatusTimeline`, `RelatedFeatures`, `ShareButton`, loading skeletons, and a not-found state). The Feed_Endpoint and the Create/Update/Delete_Feature_Endpoint contracts are unchanged.

### `FeatureDetailResponse` Shape

`GET /api/v1/features/{feature_id}` now returns a `FeatureDetailResponse` in place of a plain `FeatureResponse`. It is a superset of `FeatureResponse` — every existing field (`id`, `title`, `description_markdown`, `category`, `status`, `author_id`, `author_name`, `vote_count`, `comment_count`, `created_at`, `updated_at`) is unchanged — plus three additional fields:

- `is_owner` (boolean) — `true` only when the requesting user is authenticated and their `id` matches the feature's `author_id`; `false` for a non-matching authenticated user or an unauthenticated request.
- `is_admin` (boolean) — `true` only when the requesting user is authenticated and their `role` is `"admin"`; `false` otherwise.
- `related_features` — a list of `RelatedFeatureCard` objects (see below), up to 4 entries.

The endpoint resolves the requesting user via `get_optional_current_user` (see below), so it remains publicly accessible without authentication exactly as it was in Sprint 2A — computing `is_owner`/`is_admin` never imposes an authentication or token-validity requirement where none existed before. A request for a `feature_id` that does not match any persisted document still responds with HTTP 404 via `FeatureNotFoundException`, unchanged from Sprint 2A.

`RelatedFeatureCard` is unchanged from its original shape: a lightweight schema containing exactly `id`, `title`, `status`, `category`, `vote_count`, and `created_at` — deliberately omitting `description_markdown`, `author_id`, `author_name`, and `comment_count`, since the `RelatedFeatures` component never displays those fields.

### `get_optional_current_user`

A new Auth_Middleware dependency (`backend/app/middleware/auth.py`) used only by the Get_Feature_Endpoint. Unlike `get_current_user`, it never raises: a missing `Authorization` header, a non-Bearer scheme, a malformed or expired token, a token with the wrong `type` claim, or a `sub` that doesn't resolve to an existing user all resolve identically to "no authenticated user" (`None`), rather than propagating an `AuthException`.

### `get_related_features()` Selection, Exclusion, Ordering, and Cap

`Feature_Service.get_related_features(feature_id, category, limit=4)` powers the `related_features` field:

- **Selection** — only feature request documents whose `category` matches the given `category` are considered.
- **Exclusion** — the feature request document whose `id` equals the given `feature_id` is always excluded from the results, so a feature never lists itself as "related."
- **Ordering** — results are ordered by `created_at` descending (newest first), with `_id` descending as a deterministic tiebreaker for documents sharing an identical `created_at` timestamp.
- **Cap** — at most `limit` documents are returned (4 by default, and never invoked with a value above 4 in this sprint). When fewer than `limit` documents match, only the matching documents are returned — the result is never padded with documents from a different category. When zero documents match, the function returns an empty list, never `None`.

The query reuses the existing `category` and `created_at` indexes established in Sprint 2A; no new index was required.

### Two-Layer Markdown Sanitization

`description_markdown` is user-supplied free text, and this sprint is the first to render it as HTML rather than plain text. Two independent layers work together, deliberately overlapping rather than relying on either one alone:

**Server-side (`Markdown_Sanitizer`, `backend/app/utils/markdown_sanitizer.py`)** — `sanitize_markdown(raw)` strips or neutralizes `<script>`, `<style>`, `<iframe>`, `<object>`, and `<embed>` tags (paired or self-closing), removes `on*` event-handler attributes (e.g. `onclick`), and removes `href`/`src` attribute values using the `javascript:` URI scheme. It is applied at a single shared call site inside `feature_service.py`, so a `description_markdown` value is sanitized identically whether it's being persisted (create/update) or read back (get/feed/related) — no code path can return a differently-sanitized copy of the same field. This is a defense-in-depth layer: a raw API response consumed by something other than the frontend shouldn't depend solely on a specific renderer's configuration for safety.

**Client-side (`MarkdownRenderer`, `frontend/src/components/markdown/MarkdownRenderer.jsx`)** — the sole component in the frontend that imports `react-markdown` directly, so the read-only detail view and the `MarkdownEditor`'s live preview always render markdown identically. Its controls are structural rather than pattern-matching-based:
  - It never passes `rehype-raw` into its `react-markdown` configuration, so raw HTML embedded in the markdown source renders as plain text by default — nothing to bypass, as opposed to a sanitization pass that could have a gap.
  - **Link-scheme allow-list** — links produced from markdown syntax (`[text](url)`) are only rendered as `<a href="...">` when the URL's scheme is `http:`, `https:`, or `mailto:` (via the exported `isAllowedHref` helper). Any other scheme, or a relative/scheme-less URL, causes the link to render as plain, non-linked text with the `href` discarded entirely — this closes the gap the server-side sanitizer doesn't cover, since AST-generated links from markdown syntax never pass through raw-HTML sanitization.
  - **Image suppression** — image syntax (`![alt](url)`) never renders an `<img>` element. Only the alt text is rendered, as plain, non-linked text, with the image URL discarded — consistent with "images not implemented yet," and avoiding turning an image into an unintended clickable link.

Both overrides are implemented via `react-markdown`'s component-override configuration (mapping `a` and `img` to `SafeLink`/`SuppressedImage`), the documented AST-level mechanism for this exact case, rather than by pre-processing the raw markdown string.

### Frontend Additions

- **`MarkdownEditor`** (`frontend/src/components/MarkdownEditor.jsx`) — a reusable, controlled `<textarea>` plus a toolbar (Heading 1/2, Bold, Italic, Bullet List, Numbered List, Quote, Code Block, Link, Horizontal Rule, Table), each action implemented as a plain-string insertion via the pure helpers in `frontend/src/components/markdown/toolbarActions.js` — no rich-text-editor library is used. A live-preview toggle (defaulting on) renders the current value through `MarkdownRenderer` in a side-by-side layout at desktop width and a stacked layout at mobile width. Used by both `CreateFeatureModal` and `EditFeatureModal` in place of their Sprint 2A plain textareas, alongside a `CharacterCounter`.
- **`AuthorCard`** (`frontend/src/components/AuthorCard.jsx`) — a pure presentational summary of a feature's author: an initials avatar (or a generic person icon when the name is empty), a role badge (`"user"`/`"admin"`), an optional verified badge, and a "Submitted on [date]" line. Never rendered as a link.
- **`StatusTimeline`** (`frontend/src/components/StatusTimeline.jsx`) — a read-only, four-stage display of the Feature_Status workflow (Under Review → Planned → In Progress → Completed), highlighting the current stage via `aria-current` plus a non-color-dependent visual marker. Renders all four stages even when the `status` prop is missing or invalid, highlighting none in that case.
- **`RelatedFeatures`** (`frontend/src/components/RelatedFeatures.jsx`) — renders the `related_features` array as a row of activatable cards (title, category/status badges via `badgeColors`, vote count), navigating to `/features/{id}` on activation. Renders nothing when the array is empty.
- **`ShareButton`** (`frontend/src/components/ShareButton.jsx`, plus the exported `copyToClipboard` helper) — copies the current feature's URL to the clipboard, preferring the Clipboard API and falling back to a hidden, focused, selected textarea with `document.execCommand("copy")`. Shows exactly one toast per activation (success or error).
- **Skeletons** (`frontend/src/components/skeletons/FeatureDetailsSkeleton.jsx`, `RelatedFeaturesSkeleton.jsx`, `MarkdownContentSkeleton.jsx`) — pulsing placeholders shown while `FeatureDetailsPage`'s underlying query is loading, each approximating the shape of the content it precedes.
- **`FeatureNotFoundState`** (`frontend/src/components/FeatureNotFoundState.jsx`) — a not-found message plus a link back to the feed, rendered by `FeatureDetailsPage` when the Get_Feature_Endpoint responds 404. Distinct from the project-wide `NotFoundPage`, which handles unmatched routes rather than a valid route for a missing resource.

`FeatureDetailsPage` was rewritten to compose all of the above — breadcrumb, title, status/category badges, `AuthorCard`, dates, `MarkdownRenderer`-rendered content, `ShareButton`, ownership-gated Edit/Delete buttons, `StatusTimeline`, `RelatedFeatures`, and the voting/comments placeholders — fetching its data exclusively via the unmodified `useFeature(featureId)` hook.

## Sprint 3 Atomic Voting Engine

Sprint 3 implements the end-to-end voting system on top of Sprint 2A/2B's `features` collection, `Feature_Service`, and `Feature_API`: an atomic `toggle_vote` service function, a `has_voted` field threaded through the feed and detail read responses via `get_optional_current_user`, two new API routes (vote and vote-status), and a React Query optimistic-UI vote stack with rollback, cache sync, and a guest `LoginRequiredModal`. The Feed_Endpoint's pagination structure and the Create/Update/Delete_Feature_Endpoint contracts are unchanged.

### Atomic `toggle_vote` Design

`Feature_Service.toggle_vote(feature_id, user_id)` uses a single conditional `find_one_and_update` per branch — no two-step read-then-write:

- **Add-vote branch** — filter `{_id: feature_id, votes: {$ne: user_id}}` with update `{$addToSet: {votes: user_id}, $inc: {vote_count: 1}}`, returning the post-update document (`return_document=AFTER`).
- **Remove-vote branch** — filter `{_id: feature_id, votes: user_id}` with update `{$pull: {votes: user_id}, $inc: {vote_count: -1}}`, returning the post-update document.

The branch is chosen from a preliminary read (via the existing `find_by_id`) that determines whether the requesting user's id is already in the `votes` array.

**Invariant:** `vote_count == len(votes)` is maintained atomically. Because `$addToSet` and `$pull` are both applied in the same write that increments/decrements `vote_count`, no intermediate state can break this invariant, and the set semantics of `$addToSet` guarantee no duplicate user id can appear in the `votes` array even under concurrent requests.

**Lost-race / defensive case:** If the conditional filter matches nothing on a document that is known to exist (the preliminary read succeeded), a concurrent write already toggled the vote in the same direction. `toggle_vote` raises `AlreadyVotedException` (HTTP 409) in this case, which propagates through the existing `@app.exception_handler(FeatureException)` family handler — no additional `main.py` registration is needed. `VoteFailedException` (HTTP 500) is reserved for unexpected write failures.

`toggle_vote` returns `{"voted": bool, "vote_count": int}` derived from the post-update document.

### `has_voted` Read-Response Enhancement

Sprint 2B's `get_optional_current_user` dependency (which returns the authenticated user or `None` for unauthenticated or invalid-token requests) is now threaded into both read responses:

- **`FeatureFeedResponse`** — gains a `has_voted: bool = False` field. Its `from_mongo(doc, *, current_user=None)` classmethod populates it via the shared helper `viewer_has_voted(doc, current_user)` (`current_user is not None and str(current_user["_id"]) in doc.get("votes", [])`). The Feed_Endpoint adds a `get_optional_current_user` dependency so each item in the feed carries the correct value for the requesting user.
- **`FeatureDetailResponse`** — gains `has_voted: bool = False` alongside the existing `is_owner`/`is_admin`/`related_features`. Its `from_mongo` already accepted `current_user`; it now additionally populates `has_voted`. The Get_Feature_Endpoint already used `get_optional_current_user`, so no route change beyond passing the value through is needed.

The raw `votes` array is never exposed in any response schema.

### Vote API Endpoints

| Method | Path | Authentication | Description |
| --- | --- | --- | --- |
| `POST` | `/api/v1/features/{feature_id}/vote` | `require_verified_user` | Toggle the authenticated user's vote on a feature. Returns `{voted, vote_count}`. |
| `GET` | `/api/v1/features/{feature_id}/vote-status` | `require_verified_user` | Return the current vote status for the authenticated user. Returns `{has_voted, vote_count}`. |

**Vote_Endpoint** (`POST /api/v1/features/{feature_id}/vote`):
- Requires a valid access token for a verified user (401 for missing/invalid token, 403 for unverified).
- Delegates to `feature_service.toggle_vote(feature_id, current_user["_id"])`.
- On success: `200 {"success": true, "message": "Vote updated.", "data": {"voted": bool, "vote_count": int}}`.
- `feature_id` not found: `404`.
- Lost-race: `409 {"success": false, "message": ..., "errors": [...]}` via the `FeatureException` family handler.

**Vote_Status_Endpoint** (`GET /api/v1/features/{feature_id}/vote-status`):
- Requires a valid access token for a verified user (same 401/403 rules).
- Resolves the feature via `find_by_id` (raises `FeatureNotFoundException` on a miss).
- Returns `{"has_voted": bool, "vote_count": int}` from the feature document.

Both handlers are thin (no inline db/authz/error logic). The Create/Update/Delete route handlers are unmodified.

### Frontend Optimistic-UI Flow

#### `featureVoteService.js`

`frontend/src/services/featureVoteService.js` exports a `featureVoteService` object with two methods, both using the shared `httpClient`:
- `toggleVote(featureId)` — `POST /api/v1/features/{featureId}/vote`, resolves to `data.data` (`{voted, vote_count}`).
- `getVoteStatus(featureId)` — `GET /api/v1/features/{featureId}/vote-status`, resolves to `{has_voted, vote_count}`.

`featureService.js` is not modified.

#### Pure Optimistic Helpers (`voteAnimation.js`)

`frontend/src/components/voteAnimation.js` provides three pure, side-effect-free helpers:
- `applyOptimisticVote(feature)` — flips `has_voted` and adjusts `vote_count` by `+1`/`-1`, clamped at zero.
- `applyOptimisticVoteToPage(page, featureId)` — maps a feed page's `items`, transforming only the entry matching `featureId`.
- `prefersReducedMotion()` — reads `matchMedia("(prefers-reduced-motion: reduce)")`.

#### `useFeatureVote` Hook

`frontend/src/hooks/useFeatureVote.js` exports `useToggleVote(featureId)`, a React Query mutation:

- **`mutationFn`** — calls `featureVoteService.toggleVote(featureId)`.
- **`onMutate`** — cancels in-flight queries for `["feature", featureId]` and `["features"]`, snapshots the detail entry and every `["features", ...]` page via `getQueriesData`, then writes optimistic updates into those cache entries via `setQueryData` using `applyOptimisticVote`/`applyOptimisticVoteToPage`. Returns the snapshot context for rollback.
- **`onError`** — restores the snapshots from the context returned by `onMutate` and fires a single Sonner error toast.
- **`onSettled`** — invalidates both `["feature", featureId]` and `["features"]` keys so the next background fetch brings in the server-authoritative state. No immediate synchronous full refetch is triggered.

The hook does not import `useSearchParams` or any feed-query-param utilities. `useFeatures.js`' exported signatures and query keys are not modified.

#### `LoginRequiredModal`

`frontend/src/components/LoginRequiredModal.jsx` is a `role="dialog"` `aria-modal` modal displayed only when `isOpen`. It shows the message `Log in to vote for feature requests.` and three actions:
- **Login** — navigates to `/login` on explicit activation.
- **Sign Up** — navigates to `/signup` on explicit activation.
- **Cancel** — calls `onClose` and casts no vote.

No navigation occurs on open.

#### `VoteButton`

`frontend/src/components/VoteButton.jsx` composes the vote stack into a single reusable component. It exports a pure `selectVoteButtonState({isAuthenticated, isVerified, hasVoted, isPending})` helper that maps inputs to one of four states (`loading`, `guest`, `active`, `inactive`). The component:
- Reads `useAuth()` for `isAuthenticated`/`isVerified`.
- Uses `useToggleVote(featureId)` for `isPending`/`mutate`.
- Renders the arrow icon + `voteCount`, replacing the icon with a spinner while pending.
- Sets `aria-pressed={hasVoted}`.
- On guest activation: opens `LoginRequiredModal` (no vote cast).
- On verified activation: calls `mutate()`.
- Is `disabled` and ignores clicks while pending (double-click guard).
- Applies hand-rolled scale/color/count-transition CSS classes only when `prefersReducedMotion()` returns false — no animation library.

`VoteButton` is rendered in `FeatureCard`'s metadata region (wired to `feature.id`/`feature.vote_count`/`feature.has_voted`) and in `FeatureDetailsPage`'s header (wired to the `FeatureDetailResponse`'s `vote_count`/`has_voted`). Neither component triggers a manual refetch on vote — the cache sync in `useToggleVote` is the sole update mechanism.

## Sprint 4 Threaded Discussions Engine

Sprint 4 adds a full threaded comment system on top of Sprint 2A/2B's `features` collection and Sprint 3's optimistic-UI vote stack.

### Comments Collection and Tree Algorithm

Comments are stored in a dedicated `comments` collection. Each document carries 12 fields: `_id`, `feature_id`, `parent_comment_id` (`null` for top-level), `author_id`, `author_name`, `author_role`, `author_is_verified`, `content_markdown`, `reply_count`, `is_deleted`, `created_at`, and `updated_at`.

`build_comment_tree(docs)` converts an already-sorted flat list into a nested tree:

1. A single pass builds an `id_map` (id → node) and a `depth_map` (id → computed depth).
2. Top-level comments (`parent_comment_id is None`) are attached to the root list.
3. Replies whose parent sits at depth < 3 are attached normally. Replies whose parent would be at depth 3 (or deeper) are instead attached to the nearest depth-3 ancestor, preserving tree position without exceeding the depth limit.
4. Input order (oldest-first by `created_at`) is preserved at every level — siblings are never re-sorted inside the algorithm.
5. Soft-deleted nodes are included unchanged; the tree never drops them.

Maximum depth is 3 (depth 0 = top-level). Excess-depth replies are flattened to the nearest depth-3 ancestor rather than rejected.

### Comment_API Routes

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/v1/features/{feature_id}/comments` | `require_verified_user` | Create a top-level comment. Returns 201 with `CommentResponse`. |
| `GET` | `/api/v1/features/{feature_id}/comments` | Public | Fetch the comment tree for a feature. Returns a list of `CommentTreeResponse`. |
| `POST` | `/api/v1/comments/{comment_id}/reply` | `require_verified_user` | Reply to a comment. Returns 201 with `CommentResponse`. |
| `PATCH` | `/api/v1/comments/{comment_id}` | `get_current_user` | Edit a comment (author only). Returns 200 with updated `CommentResponse`. |
| `DELETE` | `/api/v1/comments/{comment_id}` | `get_current_user` | Soft-delete a comment (author or admin). Returns 200 with tombstoned `CommentResponse`. |

The `comments.py` router uses prefix `/comments`; the two feature-scoped comment routes live in `features.py`.

### Soft Delete Strategy

Deletion is always a soft delete — hard deletion is never used. `delete_comment` sets `is_deleted=True`, `content_markdown="[deleted]"`, and `author_name="[deleted]"` on the comment document in a single `$set` write, then atomically decrements `comment_count` on the parent feature (idempotent: already-deleted comments do not decrement the counter a second time). The comment's position in the tree is preserved so that its replies remain fully visible. The tombstone state is rendered by `CommentCard` with dimmed styling and no action buttons.

### Markdown in Comments

`sanitize_markdown` is applied to `content_markdown` at write-time (both `create_comment` and `update_comment`), reusing the exact same `Markdown_Sanitizer` utility introduced in Sprint 2B — no new sanitization pipeline. On the frontend, `CommentCard` renders `content_markdown` through the existing `MarkdownRenderer` component, again unchanged from Sprint 2B.

### Reply Depth Limit

The maximum allowed rendering depth is 3 (depth 0 = top-level, depth 3 = deepest visible nesting). `build_comment_tree()` enforces this entirely in the read path: a reply whose parent sits at depth 3 is re-parented to the nearest depth-3 ancestor rather than dropped or errored. No write-time rejection occurs — `ReplyDepthExceededException` (HTTP 422) is defined but not raised by the current service logic, leaving it available for future stricter enforcement.

### Optimistic Updates

`useCreateComment`, `useReplyToComment`, `useUpdateComment`, and `useDeleteComment` all follow the same three-phase lifecycle:

- **`onMutate`** — cancels in-flight queries, snapshots the current cache, builds an optimistic comment via the pure `buildOptimisticComment` helper, and writes it into the `["comments", featureId]` cache via `insertOptimisticComment` (for creates/replies) or `applyTreeUpdate` (for edits/deletes).
- **`onError`** — restores the snapshot from the context returned by `onMutate` and fires a Sonner error toast.
- **`onSettled`** — invalidates `["comments", featureId]`, and synchronises `comment_count` on `["feature", featureId]` / `["features"]` so the header count stays accurate without a full page refresh.

The delete mutation additionally decrements `comment_count` in the feature detail and feed caches optimistically, mirroring the server-side atomic decrement. Rollback on failure restores the full prior `comment_count` via the snapshot.

## Sprint 5A — Admin Kanban Board

Sprint 5A adds a drag-and-drop admin Kanban board on top of Sprint 4's threaded discussions, letting admins move feature requests between the four status columns from a single `/admin/board` page.

### Admin Board API Endpoints

| Method | Path | Authentication | Description |
| --- | --- | --- | --- |
| `GET` | `/api/v1/admin/features/board` | `require_admin` | Return all feature requests grouped into the four status columns, sorted by `vote_count` desc then `created_at` desc. |
| `PATCH` | `/api/v1/admin/features/{feature_id}/status` | `require_admin` | Update a feature's status. Returns the updated `FeatureResponse`. |

`BoardFeatureCard` omits `description_markdown` and `votes` from each card. `BoardResponse` has four typed list fields (`under_review`, `planned`, `in_progress`, `completed`). `AdminStatusUpdate` carries a single `status: FeatureStatus` field.

### Status Transition Rules

All cross-status moves are allowed (e.g. `under_review → completed`). A same-to-same move (e.g. `planned → planned`) is rejected with **HTTP 400** via `InvalidStatusTransitionException`. The existing `FeatureException` handler in `main.py` covers the new exception — no additional handler registration is needed.

### Frontend Route

`/admin/board` — rendered by `AdminBoardPage`, protected by `AdminRoute` (requires authenticated, verified, and `role == "admin"`). Wired as a sibling to the existing `path="admin"` route inside the `Layout` route in `App.jsx`.

### New Dependencies

| Package | Pinned Version |
| --- | --- |
| `@dnd-kit/core` | `6.3.1` |
| `@dnd-kit/sortable` | `10.0.0` |

### Cache Synchronization

Drag-and-drop moves use optimistic UI via the pure helper `applyOptimisticMove(board, featureId, targetStatus)`:

- **`onMutate`** — cancels `["adminBoard"]` queries, snapshots the cache, moves the card optimistically (remove from all columns, prepend to target column).
- **`onError`** — restores the snapshot and fires a Sonner error toast.
- **`onSettled`** — invalidates `["adminBoard"]`, patches `["feature", featureId]` to update the `status` field in place, and invalidates `["features"]` so the public feed reflects the change.

## Sprint 5B — Public Roadmap

Sprint 5B adds a publicly accessible roadmap page on top of Sprint 5A's admin board, sharing the same `features` collection but exposing only three of the four status columns to guests.

### Roadmap API Endpoint

| Method | Path | Authentication | Description |
| --- | --- | --- | --- |
| `GET` | `/api/v1/roadmap` | **None — public** | Return all non-`under_review` features grouped into `planned`, `in_progress`, and `completed` columns, sorted by `vote_count` desc then `created_at` desc. |

The response envelope's `data` payload is a `RoadmapResponse` object with three typed list fields:

```json
{
  "planned":     [ /* RoadmapCard objects */ ],
  "in_progress": [ /* RoadmapCard objects */ ],
  "completed":   [ /* RoadmapCard objects */ ]
}
```

Each `RoadmapCard` carries exactly eight fields: `id`, `title`, `category`, `status`, `vote_count`, `comment_count`, `author_name`, `created_at`. It deliberately omits the admin-only fields `description_markdown`, `votes`, `author_id`, `is_owner`, and `is_admin`.

Features with `status="under_review"` are silently excluded — they never appear in any column.

### Relationship with the Admin Board

Both the roadmap endpoint and the admin board endpoint query the same `features` collection. The differences are:

| Dimension | Admin Board (`/api/v1/admin/features/board`) | Public Roadmap (`/api/v1/roadmap`) |
| --- | --- | --- |
| Auth | `require_admin` | None |
| Columns | 4 (`under_review`, `planned`, `in_progress`, `completed`) | 3 (`planned`, `in_progress`, `completed`) |
| Schema | `BoardFeatureCard` / `BoardResponse` | `RoadmapCard` / `RoadmapResponse` |
| Interactivity | Drag-and-drop status moves | Read-only |

`RoadmapCard` and `BoardFeatureCard` are intentionally kept as separate Pydantic classes so each can evolve independently.

### Frontend Route and Components

- **`/roadmap`** — public route rendered by the rewritten `RoadmapPage.jsx` (replaces the Sprint 0 stub). No authentication required; accessible from the existing Navbar "Roadmap" link.

| Component | File | Description |
| --- | --- | --- |
| `RoadmapPage` | `frontend/src/pages/RoadmapPage.jsx` | Orchestrates `useRoadmap`, `RoadmapHeader`, and three `RoadmapColumn` instances. Shows loading skeletons, an error state with a Retry button, and a status legend. |
| `RoadmapHeader` | `frontend/src/components/RoadmapHeader.jsx` | Purely presentational. Renders the "Public Roadmap" heading, description, and per-status counts (`totalPlanned`, `totalInProgress`, `totalCompleted` props). |
| `RoadmapColumn` | `frontend/src/components/RoadmapColumn.jsx` | Renders a single status column: a heading with a count badge, a scrollable card list, and a dashed-border empty state when no features are present. No `useSortable` / DnD. |
| `RoadmapFeatureCard` | `frontend/src/components/RoadmapFeatureCard.jsx` | Renders one `RoadmapCard`. Displays title, category/status badges, vote and comment counts, author name, creation date, and a "View Details →" link to `/features/{id}`. No drag handle, no status-change control. |

### React Query Cache Key

The roadmap query uses the isolated key `["roadmap"]`, keeping it fully separate from the feed cache (`["features"]`) and the admin board cache (`["adminBoard"]`). The Retry button on the error state calls `queryClient.invalidateQueries({ queryKey: ["roadmap"] })`.

### "View on Roadmap →" Link

`FeatureDetailsPage` gains an additive "View on Roadmap →" `<Link to="/roadmap">` rendered only when `feature.status !== "under_review"`. When the status is `"under_review"`, nothing is rendered. The link is placed in the breadcrumb/navigation area near the `StatusTimeline`.

### Read-Only Guarantees

- No authentication is required or checked on `GET /api/v1/roadmap`.
- The frontend components contain no drag handles, no `useSortable`, and no status-change controls.
- Guests can view all three columns; they cannot modify any feature's status.

## Sprint Status

- ✅ **Sprint 0: Foundation Setup — Completed**

  Sprint 0 established the project scaffolding only: the React + Vite frontend and FastAPI backend project structures, environment configuration, a MongoDB Atlas connection lifecycle (no collections or schemas yet), a consistent API response envelope and CORS setup, placeholder pages and routing, and a single end-to-end integration check where the frontend polls the backend's `/api/v1/health` endpoint and displays its connectivity status. No business logic (authentication, feature request CRUD, voting, comments, moderation, or the roadmap board) has been implemented yet — those are planned for later sprints.

- ✅ **Sprint 1A: Authentication Foundation — Completed**

  Sprint 1A implemented JWT-based authentication: user signup/login/refresh/logout, the `get_current_user`/`get_current_admin` route-protection dependencies, and the Me endpoint on the backend, together with the frontend auth service, auth context, working Login/Signup pages, and an authentication-aware Navbar. Feature request CRUD, voting, comments, moderation, the roadmap board, search, filtering, and pagination are not implemented yet — those are planned for later sprints.

- ✅ **Sprint 1B: Authentication Completion — Completed**

  Sprint 1B completed the authentication surface on top of Sprint 1A: simulated email verification, a simulated forgot-password/reset-password flow, the `require_verified_user`/`require_admin` RBAC dependencies, two minimal protected demo routes (`/api/v1/user/dashboard`, `/api/v1/admin/dashboard`), and the corresponding frontend route guards (`ProtectedRoute`, `AdminRoute`), verification/forgot-password/reset-password pages, minimal dashboard pages, and a four-state Navbar. Feature request CRUD, voting, comments, moderation, the roadmap board, search, filtering, and pagination are not implemented yet — those are planned for later sprints.

- ✅ **Sprint 2A: Feature CRUD + Feed — Completed**

  Sprint 2A implemented the project's first domain resource: full feature-request CRUD (create/read/update/delete) with author/admin authorization, a public paginated feed with search, category/status filtering, and six sort options, together with the frontend feed page (search bar, filter dropdowns, pagination), feature detail page, and create/edit/delete UI. Voting, threaded comments, the admin Kanban board, real roadmap logic, optimistic UI, and drag-and-drop are not implemented yet — those are planned for later sprints.

- ✅ **Sprint 2B: Feature Details, Markdown Editor & UI Polish — Completed**

  Sprint 2B built a polished Feature Details experience on top of Sprint 2A: an extended Get_Feature_Endpoint response (`FeatureDetailResponse`) carrying `is_owner`/`is_admin`/`related_features`, a `get_related_features()` service helper, a two-layer markdown sanitization approach (server-side `Markdown_Sanitizer` plus a structural, client-side `MarkdownRenderer` with a link-scheme allow-list and image suppression), a rewritten `FeatureDetailsPage`, a reusable `MarkdownEditor` shared by `CreateFeatureModal`/`EditFeatureModal`, and new presentational components (`AuthorCard`, `StatusTimeline`, `RelatedFeatures`, `ShareButton`, loading skeletons, `FeatureNotFoundState`). Voting, threaded comments, the admin Kanban board, real roadmap logic, optimistic UI, and drag-and-drop are not implemented yet — those are planned for later sprints.

- ✅ **Sprint 3: Atomic Voting Engine — Completed**

  Sprint 3 implemented the end-to-end voting system: an atomic `toggle_vote` service function backed by conditional `find_one_and_update` writes, a `has_voted` read field threaded through both the feed and detail responses via `get_optional_current_user`, two new API routes, and a React Query optimistic-UI vote stack with rollback, cache sync, and a guest modal. Threaded comments, the admin Kanban board, real roadmap logic, and drag-and-drop are not implemented yet — those are planned for later sprints.

- ✅ **Sprint 4: Threaded Discussions Engine — Completed**

  Sprint 4 implemented the full threaded comment system: a `comments` collection with `build_comment_tree()` (flat-list → nested tree, max depth 3, excess-depth flattening, oldest-first ordering), five Comment_API routes (create, tree fetch, reply, edit, soft-delete), soft-delete tombstoning (`is_deleted=True`, `content_markdown="[deleted]"`, `author_name="[deleted]"`) with tree position preserved, `sanitize_markdown` reused at write-time, `MarkdownRenderer` reused in `CommentCard`, and a React Query optimistic-UI stack (`buildOptimisticComment`, `insertOptimisticComment`/`applyTreeUpdate`, `onMutate`/`onError`/`onSettled` lifecycle) with `comment_count` cache sync and Sonner rollback toasts. The admin Kanban board, real roadmap logic, and drag-and-drop are not implemented yet — those are planned for later sprints.

- ✅ **Sprint 5A: Admin Kanban Board — Completed**

  Sprint 5A implemented the drag-and-drop admin Kanban board: `InvalidStatusTransitionException`/`AdminPermissionException`/`StatusUpdateFailedException` exception types, `BoardFeatureCard`/`BoardResponse`/`AdminStatusUpdate` Pydantic schemas, `validate_status_transition`/`get_board`/`update_feature_status` service functions (all cross-status moves allowed; same-to-same rejected with HTTP 400), two new admin API routes (`GET /api/v1/admin/features/board`, `PATCH /api/v1/admin/features/{feature_id}/status`), `adminBoardService.js`, `useAdminBoard`/`useUpdateFeatureStatus` hooks with `applyOptimisticMove`-based optimistic UI and three-key cache invalidation (`["adminBoard"]`/`["feature", id]`/`["features"]`), `KanbanFeatureCard` (drag handle, badges, vote/comment counts), `KanbanColumn` (`useDroppable`, empty state, `isOver` highlight, independent scroll), and `AdminBoardPage` (`DndContext`/`DragOverlay`, board statistics, loading/error states, Manual Refresh). The `/admin/board` route is protected by `AdminRoute`. New dependencies: `@dnd-kit/core@6.3.1` and `@dnd-kit/sortable@10.0.0` (exact-pinned).

- ✅ **Sprint 5B: Public Roadmap — Completed**

  Sprint 5B added the publicly accessible roadmap on top of Sprint 5A's admin board: `RoadmapCard`/`RoadmapResponse` Pydantic schemas (separate from `BoardFeatureCard`/`BoardResponse` so each can evolve independently), `get_public_roadmap()` service function (queries the same `features` collection, groups into three columns, silently excludes `under_review`), new `GET /api/v1/roadmap` endpoint (no authentication), `roadmapService.js`, `useRoadmap` hook (query key `["roadmap"]`, isolated from feed and admin board caches), and four new frontend components: `RoadmapFeatureCard` (read-only card with title, badges, vote/comment counts, author, date, and "View Details →" link — no drag handle), `RoadmapColumn` (scrollable column with count badge and empty state), `RoadmapHeader` (presentational heading with per-status counts), and a fully rewritten `RoadmapPage` (loading skeletons, error state with Retry, three-column grid, status legend). An additive "View on Roadmap →" link was added to `FeatureDetailsPage` for features with status other than `under_review`. The `/roadmap` route requires no authentication and is readable by any guest.
