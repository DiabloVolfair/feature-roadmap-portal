# Implementation Plan: Sprint 1A - Authentication Foundation

## Overview

This plan builds JWT-based authentication on top of the Sprint 0 scaffolding, following the design's strict layering: Settings → User_Model schemas → Security_Module (bcrypt + JWT) → User_Service (Mongo persistence) → Auth exceptions → Auth_Service (business logic) → Auth_Middleware (request dependencies) → Auth_API routes → main.py wiring, then the mirrored frontend stack: HTTP_Client extension → Frontend_Auth_Service → Auth_Context → LoginPage/SignupPage → Navbar → App wiring, finished by environment/README documentation. Each backend layer is implemented and tested before the layer above it depends on it, and the frontend stack is built the same way so `AuthContext` never has to be retrofitted onto pages built without it. No feature CRUD, voting, comments, moderation, roadmap, search/filter/pagination, or password-reset logic is included, per the Non-Goals in requirements.md.

## Tasks

- [x] 1. Extend backend Settings for authentication configuration
  - [x] 1.1 Extend `Settings` in `backend/app/core/config.py`
    - Add required `project_name` and `api_prefix` string fields loaded from `PROJECT_NAME`/`API_PREFIX`, with a `field_validator` that strips and rejects empty/whitespace-only values
    - _Requirements: 1.1, 1.2, 1.3, 1.5_
  - [x] 1.2 Write unit tests for Settings validation of `PROJECT_NAME`/`API_PREFIX` (extend `backend/tests/test_config.py`)
    - Assert a missing, empty, or whitespace-only `PROJECT_NAME` or `API_PREFIX` raises `ValidationError` at startup and that the error identifies the affected variable name(s); assert valid values load correctly
    - _Requirements: 1.4_

- [x] 2. Implement User_Model schemas
  - [x] 2.1 Implement `backend/app/models/user.py`
    - Define `UserCreate`, `UserLogin`, `UserResponse`, `TokenResponse` Pydantic schemas and a `UserResponse.from_mongo(doc)` classmethod; restrict the persisted `role` field to `"user"`/`"admin"` with a default of `"user"`; document the persisted-document defaults for `is_verified` (`false`), `refresh_token` (`null`), and `created_at`/`updated_at` timestamp behavior
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5_
  - [ ]* 2.2 Write property test for `UserCreate` validation bounds
    - **Property 7: `UserCreate` accepts and rejects based exactly on its stated bounds**
    - **Validates: Requirements 3.1, 3.6**
  - [ ]* 2.3 Write property test for `role` restriction
    - **Property 6: `role` is restricted to exactly two values**
    - **Validates: Requirements 2.6**
  - [ ]* 2.4 Write property test for `UserResponse` secret exposure
    - **Property 8: `UserResponse` never exposes secrets and always reflects the source record**
    - **Validates: Requirements 3.3, 7.3**

- [x] 3. Implement the Security_Module
  - [x] 3.1 Implement `backend/app/core/security.py`
    - `hash_password`/`verify_password` (bcrypt via passlib; reject empty or >72-byte passwords; `verify_password` returns `False` rather than raising on a malformed/non-bcrypt hash); `create_access_token`/`create_refresh_token`/`decode_token(token, token_type)`/`is_expired(exp)`; `TokenDecodeError`/`TokenExpiredError`; distinct secrets per token type read from Settings
    - _Requirements: 1.5, 4.1, 4.2, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.8, 5.9_
  - [ ]* 3.2 Write property test for password hashing round-trip and negative verification
    - **Property 1: Password hashing round-trips, and only for the original password**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.6**
  - [ ]* 3.3 Write property test for JWT encode/decode round-trip and distinct failure signals
    - **Property 2: JWT encode/decode round-trips claims, with distinct expiration vs. decode failure signals**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.8, 5.9**
  - [ ]* 3.4 Write property test for access/refresh token type discrimination
    - **Property 3: Access and refresh tokens are never valid as each other**
    - **Validates: Requirements 5.6, 5.7**
  - [ ]* 3.5 Write property test for `is_expired` purity
    - **Property 4: `is_expired` is a pure function of the timestamp and the current time**
    - **Validates: Requirements 5.4**

- [x] 4. Implement the User_Service
  - [x] 4.1 Implement `backend/app/services/user_service.py`
    - `find_by_email`/`find_by_id`/`email_exists`/`create_user`/`set_refresh_token`; lowercase the `email` argument on every read/write for case-insensitive uniqueness; raise `DuplicateEmailError` on a duplicate-key insert failure
    - _Requirements: 2.2, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_
  - [ ]* 4.2 Write property test for case-insensitive email uniqueness
    - **Property 5: Email uniqueness is case-insensitive**
    - **Validates: Requirements 2.2**
  - [ ]* 4.3 Write unit tests for the User_Service (mocked Motor collection)
    - `find_by_email`/`find_by_id` hit and miss cases; `create_user` success and duplicate-key failure raising `DuplicateEmailError`; `set_refresh_token` matched-id and unmatched-id branches
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 5. Implement Auth exceptions and register the exception handler
  - [x] 5.1 Implement `backend/app/core/exceptions.py`
    - `AuthException` base class carrying `status_code`/`message`/`errors`, and subclasses `InvalidCredentialsException` (401), `UserAlreadyExistsException` (409), `InvalidTokenException` (401), `ExpiredTokenException` (401), `UnauthorizedException` (401 default, overridable status code)
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_
  - [x] 5.2 Register the `AuthException` handler in `backend/app/main.py`
    - Add a single `@app.exception_handler(AuthException)` mapping any subclass instance to `error_response()` using `exc.status_code`/`exc.message`/`exc.errors`, alongside the three exception handlers already registered in Sprint 0
    - _Requirements: 18.8_
  - [ ]* 5.3 Write unit tests for the `AuthException` handler (extend `backend/tests/test_main.py`)
    - Assert a representative instance of each subclass raised from a test route maps to its documented HTTP status and to the `error_response()` envelope shape
    - _Requirements: 18.6, 18.7, 18.8_

- [x] 6. Implement the Auth_Service
  - [x] 6.1 Implement `backend/app/services/auth_service.py`
    - `signup`, `login`, `refresh_session`, `logout`, and the `_issue_tokens` helper, delegating exclusively to `User_Service` and `Security_Module` and raising the Requirement 18 exceptions rather than building envelopes inline
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 10.1, 10.2, 10.3, 10.4, 18.9_
  - [ ]* 6.2 Write property test for login failure indistinguishability
    - **Property 9: Login failure is indistinguishable regardless of cause**
    - **Validates: Requirements 8.2, 8.3**
  - [ ]* 6.3 Write property test for refresh-token rotation invalidating previous tokens
    - **Property 10: Refresh token rotation invalidates every previously issued token for that user**
    - **Validates: Requirements 9.6, 9.7, 19.4, 19.5**
  - [ ]* 6.4 Write property test for logout always clearing the cookie instruction
    - **Property 11: Logout always instructs the client to clear the cookie**
    - **Validates: Requirements 10.2, 10.3, 10.4**
  - [ ]* 6.5 Write unit tests for Auth_Service call ordering
    - `signup` happy path and the duplicate-slips-past-the-precheck race branch (Req 7.5); assert `login`/`refresh_session` create tokens before persisting them and persist the new refresh token before returning it, via mock call-order assertions
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 8.1, 8.4, 8.5, 8.6, 8.7, 8.8, 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 9.8_

- [x] 7. Implement the Auth_Middleware
  - [x] 7.1 Implement `backend/app/middleware/auth.py`
    - `get_current_user` (parse the `Authorization: Bearer` header, decode with `token_type="access"`, check the `type` claim, resolve the user via `User_Service`); `get_current_admin` (`Depends(get_current_user)`, raise `UnauthorizedException(status_code=403)` when `role != "admin"`)
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 16.1, 16.2, 16.3, 16.4, 18.7_
  - [ ]* 7.2 Write unit tests for the Auth_Middleware
    - One test per branch: missing header, non-bearer scheme, malformed token, expired token, wrong `type` claim, unknown `sub`, success (Req 15); propagated failure, non-admin → 403, admin → success (Req 16)
    - _Requirements: 15.3, 15.4, 15.5, 15.6, 15.7, 16.2, 16.3, 16.4_

- [x] 8. Implement the Auth_API routes
  - [x] 8.1 Implement `backend/app/api/v1/auth.py`
    - `signup`/`login`/`refresh`/`logout`/`me` async route handlers and a `_cookie_kwargs()` helper (`httponly=true`, `secure=false`, `samesite=lax`, `path=/`), delegating entirely to `Auth_Service`/`get_current_user` with no inline exception handling, password/JWT logic, or direct database queries
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3, 12.4, 12.5, 13.1, 13.2, 13.3, 13.4, 14.1, 14.2, 14.3, 17.1, 17.2, 17.3, 17.4, 19.1, 19.2, 19.3, 19.6, 27.1, 27.2, 27.3, 27.4_
  - [x] 8.2 Wire `auth.router` into `backend/app/api/v1/__init__.py`
    - Include `auth.router` alongside `health.router` so every route resolves under `/api/v1/auth/...`
    - _Requirements: 11.1, 12.1, 13.1, 14.1, 17.1_
  - [ ]* 8.3 Write integration tests for the Auth_API routes (`backend/tests/test_auth_routes.py`)
    - One test per HTTP-status branch across signup/login/refresh/logout/me, with `Auth_Service`/`get_current_user` mocked; assert status code, envelope shape, and Refresh_Token_Cookie presence/absence/attributes (`httponly`, `secure=false`, `samesite=lax`, `path=/`, `max_age`)
    - _Requirements: 11.2, 11.3, 11.4, 11.6, 12.2, 12.3, 12.4, 13.2, 13.3, 14.2, 17.2, 17.3, 17.4, 19.1, 19.2, 19.3, 19.6_

- [x] 9. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Extend the frontend HTTP_Client for authenticated requests
  - [x] 10.1 Extend `frontend/src/services/httpClient.js`
    - Set `withCredentials: true`; add `registerAccessTokenGetter(getter)` and a request interceptor that attaches `Authorization: Bearer <token>` when the registered getter returns a token
    - _Requirements: 19.7, 19.8, 20.6, 21.9_
  - [ ]* 10.2 Write unit test for the httpClient token-getter interceptor
    - Assert a registered getter's current return value is attached as the `Authorization` header on outgoing requests, and that no header is added when the getter returns a falsy value
    - _Requirements: 19.7, 21.9_

- [x] 11. Implement the Frontend_Auth_Service
  - [x] 11.1 Implement `frontend/src/services/authService.js`
    - Thin `signup`/`login`/`logout`/`refresh`/`getCurrentUser` wrappers around `httpClient` calls to `/api/v1/auth/*`, with no `try/catch`, so a rejected `httpClient` call rejects the wrapper's promise unchanged
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.7, 28.4_
  - [ ]* 11.2 Write unit tests for the Frontend_Auth_Service
    - Assert each function calls the correct method/URL/body and resolves with the documented data shape, and that a rejected `httpClient` call rejects the wrapper's promise unchanged
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.7_

- [x] 12. Implement the Auth_Context
  - [x] 12.1 Implement `frontend/src/context/AuthContext.jsx`
    - `AuthProvider` holding `user`/`isAuthenticated`/`loading` state and an `accessTokenRef`; registers the token getter with `httpClient` on mount; runs the startup `refresh` → `getCurrentUser` session check; implements `login`/`logout`/`signup`; exports `useAuth()`
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8, 21.9, 28.5_
  - [ ]* 12.2 Write unit tests for the Auth_Context
    - Table-driven test over the four startup `refresh`/`getCurrentUser` outcome combinations; `login` success and failure; `logout` resetting state regardless of the underlying API outcome; assert the registered token getter reflects the token set by `login` and cleared by `logout`
    - _Requirements: 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8, 21.9_

- [x] 13. Implement the LoginPage
  - [x] 13.1 Implement `frontend/src/pages/LoginPage.jsx`
    - Exported pure `validateLoginForm`/`isValidEmailFormat` functions; email/password/fieldErrors/isSubmitting local state; submit handler that validates first and only then calls `useAuth().login`; success → toast + navigate to HomePage; failure → toast + stay on page; disable the submit control while the call is pending
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 22.8, 28.1, 28.3_
  - [ ]* 13.2 Write property test for LoginPage's email-format validation gate
    - **Property 12: LoginPage's email-format gate is exactly "contains @ and a domain with a dot"**
    - **Validates: Requirements 22.3, 22.4**
  - [ ]* 13.3 Write unit tests for LoginPage
    - Empty-email/empty-password/both-empty validation messages (Req 22.2); submit control disabled while the login call is pending, using a controllable promise (Req 22.5); success toast + navigation; failure toast + stays on page
    - _Requirements: 22.1, 22.2, 22.5, 22.6, 22.7_

- [x] 14. Implement the SignupPage
  - [x] 14.1 Implement `frontend/src/pages/SignupPage.jsx`
    - Exported pure `validateSignupForm` function; name/email/password/confirmPassword/fieldErrors local state; submit handler that validates first and only then calls the Frontend_Auth_Service's `signup`; success → toast with the exact text "Account created successfully. Email verification pending.", navigate to LoginPage, no auto-authentication; failure → toast + stay on page
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 28.2, 28.3_
  - [ ]* 14.2 Write property test for SignupPage's field-bound validation gate
    - **Property 13: SignupPage calls `signup` if and only if every field independently satisfies its bound**
    - **Validates: Requirements 23.2, 23.3**
  - [ ]* 14.3 Write unit tests for SignupPage
    - One test per invalid-field case in Req 23.2; exact success toast text match + navigation to `/login` + no auth-state change; failure toast + stays on page
    - _Requirements: 23.1, 23.2, 23.4, 23.5_

- [x] 15. Update the Navbar for authentication state
  - [x] 15.1 Extend `frontend/src/components/Navbar.jsx`
    - Render the Login/Signup links while `loading` is false and `isAuthenticated` is false; render the user's `name` and a Logout control while `loading` is false and `isAuthenticated` is true; render neither while `loading` is true; the Logout control calls `useAuth().logout`; no dropdown menu markup
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5_
  - [ ]* 15.2 Write unit tests for Navbar authentication states (extend `frontend/src/components/Navbar.test.jsx`)
    - Mock `useAuth()` for the three `loading`/`isAuthenticated` combinations; assert the Logout control calls `logout`; assert no dropdown element renders
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5_

- [x] 16. Wire the AuthProvider into the application
  - [x] 16.1 Update `frontend/src/App.jsx` to wrap `Routes` in `AuthProvider`
    - `AuthProvider` wraps `Routes` (not the reverse) so `Navbar`, `LoginPage`, and `SignupPage` can call `useAuth()`
    - _Requirements: 21.1_
  - [ ]* 16.2 Update routing tests for the AuthProvider wrapper
    - Assert each existing route still renders its expected page heading with `AuthProvider` mounted (mocking `authService.refresh`/`getCurrentUser` as needed)
    - _Requirements: 21.1, 21.2_

- [x] 17. Update the environment example file
  - [x] 17.1 Update `backend/.env.example`
    - Add `PROJECT_NAME` and `API_PREFIX` placeholder lines; keep `ACCESS_TOKEN_EXPIRE_MINUTES=15` and `REFRESH_TOKEN_EXPIRE_DAYS=7`; leave the six Sprint 0 variables unchanged
    - _Requirements: 25.1, 25.2, 25.3, 25.4_

- [x] 18. Write README Sprint 1A Authentication documentation
  - [x] 18.1 Update `README.md`
    - Add a "Sprint 1A Authentication" section describing the Access_Token/Refresh_Token JWT claims and expirations, the Refresh_Token_Cookie attributes and rotation behavior, each Auth_API endpoint with its method and path, the `PROJECT_NAME`/`API_PREFIX`/`JWT_SECRET`/`JWT_REFRESH_SECRET`/`ACCESS_TOKEN_EXPIRE_MINUTES`/`REFRESH_TOKEN_EXPIRE_DAYS` environment variables; update the Sprint Status section to mark Sprint 1A completed
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6_

- [x] 19. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; they cover property tests, unit tests, and integration-style tests only.
- Property tests (2.2-2.4, 3.2-3.5, 4.2, 6.2-6.4, 13.2, 14.2) each validate exactly one Correctness Property from design.md (Properties 1-13) and use Hypothesis (backend, `max_examples=100`) or fast-check (frontend, `numRuns: 100`).
- Backend tests use pytest + Hypothesis + httpx/FastAPI `TestClient`, mirroring Sprint 0's conventions; frontend tests use Vitest + React Testing Library + fast-check, matching the design's Testing Strategy.
- Checkpoints (9, 19) give natural points to validate the backend and full stack respectively before moving on.
- No feature CRUD, voting, comments, moderation, roadmap, search/filtering/pagination, or password-reset logic is included, per the Non-Goals in requirements.md.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "5.1", "10.1", "17.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.2", "4.1", "5.2", "11.1"] },
    { "id": 2, "tasks": ["2.3", "3.3", "4.2", "5.3", "6.1", "7.1", "10.2", "11.2", "12.1"] },
    { "id": 3, "tasks": ["2.4", "3.4", "4.3", "6.2", "7.2", "8.1", "12.2", "13.1", "14.1", "15.1"] },
    { "id": 4, "tasks": ["3.5", "6.3", "8.2", "13.2", "14.2", "15.2"] },
    { "id": 5, "tasks": ["6.4", "8.3", "13.3", "14.3", "16.1"] },
    { "id": 6, "tasks": ["6.5", "16.2"] },
    { "id": 7, "tasks": ["18.1"] }
  ]
}
```
