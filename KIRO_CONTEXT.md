# KIRO_CONTEXT.md

## Project

Feature Request & Public Roadmap Portal

## Role

You are the implementation assistant for this project. Never redesign
the architecture. Follow this document as the single source of truth.

## Assessment Goal

Build a Canny/Featurebase-style customer feedback platform where users
submit feature requests, upvote, discuss them, and admins publish a
public roadmap.

Core requirements come from the assessment PDFs.

## Tech Stack

Frontend: - React + Vite - Tailwind CSS - React Router - Axios -
TanStack Query - React Markdown - Sonner

Backend: - Python 3.12 - FastAPI - Uvicorn - Motor (MongoDB Async
Driver) - Pydantic v2 - JWT - bcrypt/passlib

Database: - MongoDB Atlas

## Folder Structure

feature-roadmap-portal/ ├── frontend/ ├── backend/ │ ├── app/ │ │ ├──
api/ │ │ ├── core/ │ │ ├── db/ │ │ ├── middleware/ │ │ ├── models/ │ │
├── services/ │ │ ├── utils/ │ │ └── main.py │ └── requirements.txt ├──
README.md ├── .env.example └── KIRO_CONTEXT.md

## Database Collections

### users

-   name
-   email
-   password_hash
-   role (user/admin)
-   is_verified
-   refresh_token
-   created_at

### features

-   title
-   description_markdown
-   category
-   status
-   author_id
-   votes (array of user IDs)
-   vote_count
-   comment_count
-   timestamps

### comments

-   feature_id
-   parent_comment_id
-   author_id
-   content_markdown
-   timestamps

### password_reset_tokens

-   user_id
-   token
-   expires_at

## Status Flow

under_review planned in_progress completed

Only admins can change status.

## Authentication Rules

Access Token: - JWT - 15 minutes

Refresh Token: - JWT - 7 days - HTTP-only cookie - Rotate on refresh.

Email verification is simulated.

## API Rules

Every response:

{ "success": true, "message": "...", "data": {} }

Errors:

{ "success": false, "message": "...", "errors": \[\] }

## Feature Requirements

1.  Authentication.
2.  Feature CRUD.
3.  Atomic upvotes.
4.  Threaded comments.
5.  Admin moderation.
6.  Public Kanban roadmap.
7.  Debounced search.
8.  Pagination and filters.

## Coding Rules

-   Use async FastAPI routes.
-   Keep business logic in services/.
-   Keep routes thin.
-   Validate with Pydantic.
-   Never hardcode secrets.
-   Use environment variables.

## UI Rules

-   Clean SaaS interface.
-   Responsive.
-   Consistent spacing.
-   Loading skeletons.
-   Empty states.
-   Toast notifications.

## Sprint Workflow

Sprint 0 - Setup only.

Sprint 1 - Authentication.

Sprint 2 - Feature Request CRUD.

Sprint 3 - Voting Engine.

Sprint 4 - Threaded Comments.

Sprint 5 - Admin Dashboard + Kanban.

Sprint 6 - Search, pagination, polish.

Sprint 7 - README, deployment, assessment video.

## Kiro Instructions

Before every task: 1. Read KIRO_CONTEXT.md. 2. Modify only files
relevant to the current sprint. 3. Preserve architecture. 4. Do not
rename folders unless requested. 5. Do not introduce unnecessary
libraries.

## Git Commit Convention

feat: new feature fix: bug fix refactor: code cleanup docs:
documentation style: formatting test: tests

## Definition of Done

-   Project builds successfully.
-   No lint/type errors.
-   Backend endpoint tested.
-   Frontend connected if applicable.
-   Ready for Git commit.
