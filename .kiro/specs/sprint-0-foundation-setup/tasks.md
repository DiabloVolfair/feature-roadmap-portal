# Implementation Plan: Sprint 0 - Foundation Setup

## Overview

This plan builds the Sprint 0 scaffolding for the Feature Request & Public Roadmap Portal: an independently runnable FastAPI backend and React (Vite) frontend, a MongoDB Atlas connection lifecycle, environment configuration, project documentation, and the end-to-end health-check integration. Backend pieces (config, response envelope, CORS, database connector, health endpoint, app factory) are built bottom-up first since the frontend's health check depends on the exact envelope shape and CORS behavior. The frontend is then bootstrapped, its health-check layer wired to the backend contract, and finally routing/layout tie all pages together. No business logic (auth, feature CRUD, voting, comments, moderation, roadmap board) is included, per the Non-Goals in requirements.md.

## Tasks

- [x] 1. Set up repository scaffolding and environment configuration files
  - [x] 1.1 Create root `.gitignore`
    - Exclude `node_modules`, `.venv`, `__pycache__`, `.env`, `dist`, `build`, and `.DS_Store`
    - _Requirements: 9.6_
  - [x] 1.2 Create `backend/.env.example`
    - Add non-empty placeholder values for `MONGODB_URI`, `DATABASE_NAME`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_EXPIRE_MINUTES` (`15`), `REFRESH_TOKEN_EXPIRE_DAYS` (`7`), and `FRONTEND_URL` (`http://localhost:5173`)
    - _Requirements: 9.1, 9.2, 9.3_
  - [x] 1.3 Create `backend/requirements.txt`
    - Pin exact versions for fastapi, uvicorn, motor, pydantic, pydantic-settings, python-dotenv, passlib[bcrypt], and python-jose, plus hypothesis and pytest/httpx as test dependencies
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 2. Implement backend configuration and response envelope helpers
  - [x] 2.1 Implement Settings configuration in `backend/app/core/config.py`
    - Define the pydantic-settings `BaseSettings` subclass mapping `mongodb_uri`, `database_name`, `jwt_secret`, `jwt_refresh_secret`, `access_token_expire_minutes`, `refresh_token_expire_days`, and `frontend_url` to `.env`
    - _Requirements: 9.4, 9.5, 5.3_
  - [x] 2.2 Implement `success_response()`/`error_response()` in `backend/app/utils/responses.py`
    - _Requirements: 7.1, 7.2_
  - [x] 2.3 Write property test for success envelope shape
    - **Property 1: Success envelope shape is invariant**
    - **Validates: Requirements 7.1**
  - [x] 2.4 Write property test for error envelope shape
    - **Property 2: Error envelope shape is invariant**
    - **Validates: Requirements 7.2**

- [x] 3. Implement CORS configuration
  - [x] 3.1 Implement `configure_cors()` in `backend/app/core/cors.py`
    - Build the allowed-origins list as `[settings.frontend_url] if settings.frontend_url else []` and register `CORSMiddleware` with GET/POST/PUT/PATCH/DELETE/OPTIONS
    - _Requirements: 7.3, 7.4, 7.5_
  - [x] 3.2 Write property test for CORS allow/deny decision
    - **Property 3: CORS allow/deny matches configured origin exactly**
    - **Validates: Requirements 7.3, 7.4, 7.5**

- [x] 4. Implement MongoDB Database_Connector
  - [x] 4.1 Implement `connect_to_mongo()`/`close_mongo_connection()` in `backend/app/db/mongodb.py`
    - Read `MONGODB_URI`/`DATABASE_NAME`, log and raise when missing, create the module-level `AsyncIOMotorClient` with `serverSelectionTimeoutMS=10000`, verify with an `admin.command("ping")`, log startup/shutdown confirmations, and close the client on shutdown without creating any collections/indexes
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_
  - [x] 4.2 Write unit tests for the Database_Connector
    - Using a mocked `AsyncIOMotorClient`, assert `connect_to_mongo` pings once and raises without setting `db` on failure, and assert `close_mongo_connection` calls `client.close()` once
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

- [x] 5. Implement the Health_Endpoint and API router aggregation
  - [x] 5.1 Implement `backend/app/api/v1/health.py` and `backend/app/api/v1/__init__.py`
    - Register the async `GET /health` route returning `success_response("Backend is running.", {"status": "healthy", "version": "1.0.0"})`, and aggregate it into `api_router`
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 6.1, 6.2, 6.3_
  - [x] 5.2 Write unit tests for the Health_Endpoint
    - Assert GET returns 200 with the exact expected body, and assert POST/PUT/PATCH/DELETE each return 405
    - _Requirements: 6.1, 6.2, 6.4_

- [x] 6. Implement the backend app factory, lifespan, and error handling
  - [x] 6.1 Implement `backend/app/main.py` app factory and lifespan
    - Create the single `FastAPI()` instance with an `asynccontextmanager` lifespan that calls `connect_to_mongo()` before `yield` and `close_mongo_connection()` after, mount `configure_cors(app)`, and include `api_router` under `/api/v1`
    - _Requirements: 5.1, 5.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_
  - [x] 6.2 Implement exception handlers in `backend/app/main.py`
    - Register handlers for `RequestValidationError` (422), `StarletteHTTPException` (passthrough status), and catch-all `Exception` (500), each returning `error_response(...)`
    - _Requirements: 7.2, 6.4_
  - [x] 6.3 Write unit tests for exception handlers and settings validation
    - Assert each exception handler returns the correct status and envelope shape, and assert that unsetting each required Settings field raises `ValidationError` at startup
    - _Requirements: 9.5, 7.2_

- [x] 7. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Bootstrap frontend application tooling and providers
  - [x] 8.1 Scaffold the Vite + React project with Tailwind CSS
    - Create `frontend/` with `package.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, `index.html`, and the `src/` directories `components`, `pages`, `services`, `hooks`, `context`, `utils`, and `assets` (empty placeholders with `.gitkeep` where noted in the design)
    - Verify the dev server starts and a production build completes without errors
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.9_
  - [x] 8.2 Configure the Axios HTTP_Client in `frontend/src/services/httpClient.js`
    - Single configured instance with `baseURL` from `VITE_API_BASE_URL` and `timeout: 5000`
    - _Requirements: 1.6_
  - [x] 8.3 Configure `QueryClientProvider` and `Toaster` in `frontend/src/main.jsx`
    - Mount a single TanStack Query provider and a single Sonner `<Toaster />` at the component tree root
    - _Requirements: 1.7, 1.8_

- [x] 9. Implement the health check service layer
  - [x] 9.1 Implement `frontend/src/services/healthService.js`
    - `fetchHealth()` performing `GET /api/v1/health` via `httpClient`, and the pure `mapHealthState({ isLoading, isError, data })` function returning `"checking" | "connected" | "disconnected"`
    - _Requirements: 4.3, 4.5, 12.1, 12.4, 13.3_
  - [x] 9.2 Write unit test for `mapHealthState`
    - Table-driven test over `{isLoading, isError, data.success}` combinations asserting the resulting state string
    - _Requirements: 4.4, 4.5, 12.2, 12.3, 12.4_
  - [x] 9.3 Implement `frontend/src/hooks/useHealthCheck.js`
    - Wrap `fetchHealth` in a TanStack Query `useQuery` with `retry: false` and `refetchInterval: 10000`
    - _Requirements: 12.1, 12.2, 13.4_

- [x] 10. Implement the BackendStatusCard component
  - [x] 10.1 Implement `frontend/src/components/BackendStatusCard.jsx`
    - Render `"checking"` as a neutral/pending indicator, `"connected"` as "🟢 Backend Connected", and `"disconnected"` as "🔴 Backend Offline" based on `mapHealthState(...)`
    - _Requirements: 4.4, 12.2, 12.3, 12.4_
  - [x] 10.2 Write unit tests for BackendStatusCard
    - Given a mocked `useHealthCheck` return value, assert the correct text renders for each of the three states
    - _Requirements: 12.2, 12.3, 12.4_

- [x] 11. Implement the HomePage
  - [x] 11.1 Implement `frontend/src/pages/HomePage.jsx`
    - Compose the project title, a description under 200 characters, `<BackendStatusCard />` driven by `useHealthCheck`, and a static "Feature feed coming soon" placeholder with no feature-card component
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.7, 13.3_
  - [x] 11.2 Write unit tests for HomePage content
    - Assert the title, description length constraint, and the "coming soon" placeholder render without any feature-card component
    - _Requirements: 4.1, 4.2, 4.6, 4.7_

- [x] 12. Implement placeholder pages
  - [x] 12.1 Implement `LoginPage.jsx`, `SignupPage.jsx`, `RoadmapPage.jsx`, and `NotFoundPage.jsx` in `frontend/src/pages/`
    - Each renders only a heading containing "Login", "Signup", "Roadmap", or "Not Found" respectively, with no business logic
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

- [x] 13. Implement Layout and Navbar
  - [x] 13.1 Implement `frontend/src/components/Layout.jsx`
    - Render `<Navbar />` followed by `<Outlet />`, applying the shared light background, dark text, typography, and spacing across every page, and avoiding horizontal scroll/overlap from 320px to 1920px
    - _Requirements: 3.1, 3.4, 3.7_
  - [x] 13.2 Implement `frontend/src/components/Navbar.jsx`
    - Display the application name and exactly four links (Home, Login, Signup, Roadmap); manage `isMobileMenuOpen` boolean state that hides links below 768px until toggled
    - _Requirements: 3.2, 3.3, 3.5, 3.6_
  - [x] 13.3 Write unit tests for Navbar
    - Assert exactly four links render, and that activating the toggle expands/collapses the link list
    - _Requirements: 3.2, 3.3, 3.6_

- [x] 14. Wire routing
  - [x] 14.1 Implement the Router in `frontend/src/App.jsx`
    - Define nested routes under `Layout`: `/` → `HomePage`, `/login` → `LoginPage`, `/signup` → `SignupPage`, `/roadmap` → `RoadmapPage`, and a catch-all `*` → `NotFoundPage`
    - _Requirements: 2.1, 2.2, 1.5_
  - [x] 14.2 Write unit tests for routing
    - Assert each defined path renders the expected page heading and an undefined path renders the NotFound heading
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Write project documentation
  - [x] 16.1 Write `README.md`
    - State the project name and tech stack (React, Vite, Tailwind CSS; Python, FastAPI, Uvicorn); document the `frontend/src/` and `backend/app/` directory structures; document install/run commands for both apps; document creating `backend/.env` from `.env.example`; include a Sprint Status section marking Sprint 0 as completed
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; they cover property tests, unit tests, and integration-style tests only.
- Property tests (2.3, 2.4, 3.2) each validate exactly one Correctness Property from design.md and use Hypothesis with `max_examples=100`.
- Backend tests use pytest + httpx/FastAPI `TestClient`; frontend tests use Vitest + React Testing Library, matching the design's Testing Strategy.
- Checkpoints (7, 15) give natural points to validate the backend and full stack respectively before moving on.
- No authentication, feature CRUD, voting, comments, moderation, or Kanban roadmap logic is included, per the Non-Goals in requirements.md.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "8.1"] },
    { "id": 2, "tasks": ["3.1", "4.1", "2.3", "2.4", "5.1", "8.2", "8.3", "12.1", "13.1", "13.2"] },
    { "id": 3, "tasks": ["3.2", "4.2", "5.2", "6.1", "9.1", "13.3"] },
    { "id": 4, "tasks": ["6.2", "9.2", "9.3"] },
    { "id": 5, "tasks": ["6.3", "10.1"] },
    { "id": 6, "tasks": ["10.2", "11.1"] },
    { "id": 7, "tasks": ["11.2", "14.1"] },
    { "id": 8, "tasks": ["14.2"] },
    { "id": 9, "tasks": ["16.1"] }
  ]
}
```
