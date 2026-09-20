# PROJECT_SPEC.md

# Feature Request & Public Roadmap Portal

**Technical Assessment -- Master Project Specification**

Version: 1.0

------------------------------------------------------------------------

## 1. Project Overview

Build a Canny / Featurebase inspired customer feedback platform.

Users can: - Submit feature requests. - Upvote ideas. - Participate in
threaded discussions. - View a public roadmap.

Admins can: - Moderate content. - Change feature status. - Publish
roadmap updates.

------------------------------------------------------------------------

## 2. Goals

Primary goal is to complete all assessment requirements with clean
architecture, working APIs, professional UI and documentation.

------------------------------------------------------------------------

## 3. Technology Stack

### Frontend

-   React + Vite
-   Tailwind CSS
-   React Router
-   Axios
-   TanStack Query
-   React Markdown
-   Sonner Toasts

### Backend

-   Python 3.12
-   FastAPI
-   Uvicorn
-   Motor (Async MongoDB)
-   Pydantic v2
-   JWT
-   Passlib + bcrypt

### Database

MongoDB Atlas

------------------------------------------------------------------------

## 4. User Roles

### User

-   Signup/Login.
-   Submit requests.
-   Upvote.
-   Comment.
-   Edit/Delete own comments.

### Admin

Everything a User can do plus: - Update feature status. - Delete any
comment. - Moderate roadmap.

------------------------------------------------------------------------

## 5. Pages

1.  Landing / Feature Feed
2.  Login
3.  Signup
4.  Forgot Password
5.  Reset Password
6.  Feature Details
7.  Public Roadmap
8.  Admin Dashboard
9.  User Profile (optional stretch goal)

------------------------------------------------------------------------

## 6. UI Components

Reusable components: - Navbar - Sidebar (Admin) - Feature Card - Vote
Button - Status Badge - Markdown Viewer - Comment Thread - Search Bar -
Filter Dropdown - Pagination - Toast Notifications - Skeleton Loader -
Empty State

------------------------------------------------------------------------

## 7. Feature Workflow

User creates feature.

Default status: under_review

Admin moves feature through: under_review → planned → in_progress →
completed

Roadmap automatically reflects backend status.

------------------------------------------------------------------------

## 8. Categories

Allowed categories: - UI/UX - Integrations - Performance - General

Validation required.

------------------------------------------------------------------------

## 9. Database Design

### users

id name email password_hash role is_verified refresh_token created_at

### features

id title description_markdown category status author_id votes\[\]
vote_count comment_count created_at updated_at

Indexes: - title text - description text - category - status -
vote_count

### comments

id feature_id parent_comment_id author_id content_markdown created_at
updated_at

Supports threaded replies.

### password_reset_tokens

id user_id token expires_at

------------------------------------------------------------------------

## 10. Authentication Specification

Access Token - JWT - 15 minutes

Refresh Token - JWT - 7 days - HTTP-only cookie - Token rotation

Email verification is simulated.

Password reset is simulated.

------------------------------------------------------------------------

## 11. RBAC Rules

### User

GET features POST feature POST comment POST vote

### Admin

PATCH feature status DELETE any comment DELETE any feature (optional)

------------------------------------------------------------------------

## 12. API Contract

### Auth

POST /auth/signup POST /auth/login POST /auth/refresh POST /auth/logout
POST /auth/forgot-password POST /auth/reset-password

### Features

GET /features GET /features/{id} POST /features PATCH /features/{id}
DELETE /features/{id}

### Votes

POST /features/{id}/vote

### Comments

GET /features/{id}/comments POST /features/{id}/comments PATCH
/comments/{id} DELETE /comments/{id}

### Admin

PATCH /admin/features/{id}/status

------------------------------------------------------------------------

## 13. Response Format

Success

{ "success": true, "message": "...", "data": {} }

Error

{ "success": false, "message": "...", "errors": \[\] }

------------------------------------------------------------------------

## 14. Frontend Architecture

src/ pages/ components/ hooks/ services/ context/ utils/ types/

Business logic belongs inside hooks/services.

------------------------------------------------------------------------

## 15. Backend Architecture

app/ api/ services/ models/ middleware/ db/ core/ utils/

Routes remain thin. Business logic goes into services.

------------------------------------------------------------------------

## 16. Sprint Plan

Sprint 0 Project setup.

Sprint 1 Authentication.

Sprint 2 Feature CRUD.

Sprint 3 Voting Engine.

Sprint 4 Comments.

Sprint 5 Admin + Kanban.

Sprint 6 Search, filters, pagination, polish.

Sprint 7 Deployment + README + Video preparation.

------------------------------------------------------------------------

## 17. Coding Standards

-   Async FastAPI.
-   Pydantic validation.
-   Environment variables only.
-   Reusable components.
-   No duplicated logic.
-   Clear error handling.

------------------------------------------------------------------------

## 18. Testing Checklist

Sprint complete only when: - Backend starts successfully. - Frontend
starts successfully. - MongoDB connected. - API tested. - UI tested. -
Git commit created.

------------------------------------------------------------------------

## 19. Assessment Deliverables

Repository contains: - Source Code - README - .env.example - API
Documentation - Project Video - Public GitHub Repository

------------------------------------------------------------------------

## 20. Definition of Done

Every sprint must: - Compile without errors. - Preserve architecture. -
Pass manual testing. - Be ready for Git commit.

This document is the permanent implementation blueprint for the project.

### Authentication Architecture (Final)

Authentication is completed in two stages.

**Sprint 1A**

* Signup/Login
* JWT Access Token
* Refresh Token Rotation
* Password Hashing
* Auth Context
* Axios Refresh Interceptor

**Sprint 1B**

* Email Verification Simulation
* Password Reset
* Forgot Password
* RBAC
* Protected Routes
* Session Persistence
