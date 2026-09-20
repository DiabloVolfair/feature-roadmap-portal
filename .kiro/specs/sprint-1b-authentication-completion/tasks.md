# Implementation Plan: Sprint 1B - Authentication Completion

## Overview

This plan completes the authentication surface on top of Sprint 1A, following the design's layering: Settings extension → Security_Module generalization (opaque-token hashing) → Email_Verification_Token model/service → Password_Reset_Token model/service and schemas → User_Service extension → Auth_Middleware extension (`require_verified_user`/`require_admin`) → Auth_API extension (four new routes) → new Dashboard_API router → backend checkpoint, then the mirrored frontend stack: Frontend_Auth_Service extension → Dashboard_Service → route guards (`ProtectedRoute`/`AdminRoute`) → dashboard pages → verification/forgot-password/reset-password pages → four-state Navbar → route wiring → frontend checkpoint, finished by environment/README documentation. Each backend layer is implemented and tested before the layer above it depends on it, mirroring Sprint 1A's approach. No feature CRUD, voting, comments, moderation, roadmap, search/filter/pagination, real email delivery, or multi-session logic is included, per the Non-Goals in requirements.md. No existing Sprint 1A mechanism (JWT/cookie mechanics, `get_current_user`/`get_current_admin`, the response envelope, the `httpClient` interceptor, `AuthContext`'s token storage) is modified.

## Tasks

- [ ] 1. Extend backend Settings for Sprint 1B configuration
  - [x] 1.1 Extend `Settings` in `backend/app/core/config.py`
    - Add `email_verification_expire_hours: int = 24`, `password_reset_expire_minutes: int = 30`, and `app_env: str = "production"` fields loaded from `EMAIL_VERIFICATION_EXPIRE_HOURS`, `PASSWORD_RESET_EXPIRE_MINUTES`, and `APP_ENV`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x]* 1.2 Write unit tests for the new Settings fields (extend `backend/tests/test_config.py`)
    - Assert each field defaults correctly when its environment variable is unset, and loads correctly when set, following the existing parametrized pattern
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 2. Generalize the Security_Module's opaque-token hashing
  - [x] 2.1 Extend `backend/app/core/security.py`
    - Rename the internal digest helper and add `hash_opaque_token`/`verify_opaque_token`; keep `hash_refresh_token`/`verify_refresh_token` as aliases so no Sprint 1A caller changes
    - _Requirements: 2.2, 5.2, 24.4_
  - [x]* 2.2 Write property test for opaque token hashing round-trip
    - **Property 1: Opaque token hashing round-trips, and only for the original token**
    - **Validates: Requirements 2.1, 2.2, 5.1, 5.2**
  - [x]* 2.3 Write unit test confirming `hash_refresh_token`/`verify_refresh_token` remain callable as aliases
    - Regression guard for Sprint 1A's `user_service.set_refresh_token` call sites
    - _Requirements: 24.4_

- [ ] 3. Implement the Email_Verification_Token model and service
  - [x] 3.1 Implement `backend/app/models/email_verification.py`
    - Document the persisted `email_verification_tokens` document shape (`user_id`, `token_hash`, `expires_at`, `created_at`) as a comment/reference, matching `user.py`'s documentation convention; no Pydantic model needed for the persisted shape
    - _Requirements: 2.1_
  - [x] 3.2 Implement `backend/app/services/email_verification_service.py`
    - `create_verification_token(user_id)` (generate via `secrets.token_urlsafe`, hash via `hash_opaque_token`, persist, return raw value once); `consume_verification_token(raw_token)` (scan-and-verify match, expiry check, resolve user via `User_Service`, mark verified, delete record); raise `InvalidTokenException`/`ExpiredTokenException` on the documented failure branches without deleting expired records
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  - [x]* 3.3 Write property test for opaque token consumption single-use and expiry-distinction behavior
    - **Property 2: Opaque token consumption is single-use, and distinguishes expired from invalid without deleting the expired record**
    - **Validates: Requirements 2.3, 2.4, 2.5, 2.6, 5.4, 5.5, 5.6**
  - [x]* 3.4 Write unit tests for `Email_Verification_Service` (mocked Motor collection)
    - Assert the persisted document never contains a raw token field; assert a token whose associated user no longer exists is rejected as Invalid
    - _Requirements: 2.2, 2.6_

- [ ] 4. Implement the Password_Reset_Token model, service, and request schemas
  - [x] 4.1 Implement `backend/app/models/password_reset.py`
    - Document the persisted `password_reset_tokens` document shape (`user_id`, `token_hash`, `expires_at`, `created_at`), mirroring `email_verification.py`
    - _Requirements: 5.1_
  - [x] 4.2 Add `VerifyEmailRequest`, `ForgotPasswordRequest`, and `PasswordResetRequest` schemas to `backend/app/models/user.py`
    - `VerifyEmailRequest { token: str }`; `ForgotPasswordRequest { email: EmailStr }`; `PasswordResetRequest { token: str, new_password: str[8,128] }`, reusing `UserCreate`'s existing password bounds rather than defining new ones
    - _Requirements: 4.1, 6.1, 7.1, 7.2_
  - [x] 4.3 Implement `backend/app/services/password_reset_service.py`
    - `create_reset_token(user_id)` (same shape as `create_verification_token`, using `password_reset_expire_minutes`); `consume_reset_token(raw_token, new_password)` (scan-and-verify match, expiry check, resolve user, hash and persist the new password via `User_Service.set_password_hash`, clear the user's refresh token hash via `User_Service.set_refresh_token(user_id, None)`, delete the record)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
  - [x]* 4.4 Write property test for password reset bound validation
    - **Property 6: `PasswordResetRequest` accepts and rejects based exactly on its stated password bound**
    - **Validates: Requirements 7.2**
  - [x]* 4.5 Write property test for password reset side effects
    - **Property 3: Successful password reset replaces the password hash and invalidates the refresh session**
    - **Validates: Requirements 5.3**
  - [x]* 4.6 Write unit tests for `Password_Reset_Service` (mocked Motor collection)
    - Assert the persisted document never contains a raw token field; assert a token whose associated user no longer exists is rejected as Invalid
    - _Requirements: 5.2, 5.6_

- [ ] 5. Extend the User_Service with verification and password-replacement operations
  - [x] 5.1 Extend `backend/app/services/user_service.py`
    - Add `mark_verified(user_id)` and `set_password_hash(user_id, password_hash)`, each following the existing `set_refresh_token` matched/unmatched-id pattern exactly
    - _Requirements: 2.3, 5.3_
  - [x]* 5.2 Write unit tests for `mark_verified` and `set_password_hash`
    - Matched-id and unmatched-id branches for each, mirroring `set_refresh_token`'s existing test shape
    - _Requirements: 2.3, 5.3_

- [ ] 6. Extend the Auth_Middleware with verification and admin dependencies
  - [x] 6.1 Extend `backend/app/middleware/auth.py`
    - Add `require_verified_user` (`Depends(get_current_user)`, raise `UnauthorizedException(status_code=403)` when `is_verified` is not `true`) and `require_admin` (`Depends(get_current_user)`, raise `UnauthorizedException(status_code=403)` when `is_verified` is not `true` or `role != "admin"`); leave `get_current_admin` unchanged
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3, 10.4, 10.5_
  - [x]* 6.2 Write property test for the two new dependencies' gating conditions
    - **Property 7: `require_verified_user` and `require_admin` reject based exactly on their stated conditions, propagating upstream failures unchanged**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3, 10.4**
  - [x]* 6.3 Write unit test confirming `get_current_admin`'s existing Sprint 1A test suite still passes unmodified
    - Regression guard for Requirement 10.5
    - _Requirements: 10.5_

- [ ] 7. Implement the four new Auth_API routes
  - [x] 7.1 Extend `backend/app/api/v1/auth.py`
    - Add `send_verification` (`Depends(get_current_user)`, already-verified short-circuit, `app_env`-gated token in `data`), `verify_email` (no auth dependency, delegates to `Email_Verification_Service`), `forgot_password` (no auth dependency, single unconditional `success_response(...)` call with `app_env`-gated `data`), and `reset_password` (no auth dependency, delegates to `Password_Reset_Service`)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.1, 7.3, 7.4, 7.5, 7.6, 7.7, 8.3, 24.1, 24.2_
  - [x]* 7.2 Write property test for environment-gated raw token exposure
    - **Property 4: A raw opaque token appears in a response if and only if the environment is development and a token was actually created this call**
    - **Validates: Requirements 3.4, 3.5, 6.5, 6.6, 6.7**
  - [x]* 7.3 Write property test for forgot-password response-wording indistinguishability
    - **Property 5: Forgot-password responses are worded identically regardless of account existence**
    - **Validates: Requirements 6.4**
  - [x]* 7.4 Write integration tests for the four new Auth_API routes (extend `backend/tests/test_auth_routes.py`)
    - One test per HTTP-status branch (`send-verification` 200 verified/not-verified, `verify-email` 200/401, `forgot-password` 200, `reset-password` 200/401/422), with the service layer mocked; a test confirming `verify-email`/`forgot-password`/`reset-password` succeed with no `Authorization` header
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3, 7.1, 7.3, 7.4, 7.5, 7.6_

- [ ] 8. Implement the Dashboard_API and wire it in
  - [x] 8.1 Implement `backend/app/api/v1/dashboard.py`
    - `GET /user/dashboard` (`Depends(require_verified_user)`, returns `success_response("Dashboard retrieved.", {"message": "Welcome to your dashboard."})`) and `GET /admin/dashboard` (`Depends(require_admin)`, returns `success_response("Dashboard retrieved.", {"message": "Welcome Admin."})`)
    - _Requirements: 11.1, 11.2, 11.5, 12.1, 12.2, 12.5, 24.1, 24.2_
  - [x] 8.2 Wire `dashboard.router` into `backend/app/api/v1/__init__.py`
    - Include `dashboard.router` alongside `health.router` and `auth.router` so the routes resolve to `/api/v1/user/dashboard` and `/api/v1/admin/dashboard`
    - _Requirements: 11.1, 12.1_
  - [x]* 8.3 Write integration tests for the Dashboard_API routes (`backend/tests/test_dashboard_routes.py`)
    - One test per branch for each route (200 with exact message, 401, 403), with `require_verified_user`/`require_admin` mocked/overridden
    - _Requirements: 11.2, 11.3, 11.4, 12.2, 12.3, 12.4_

- [ ] 9. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Extend the Frontend_Auth_Service and add the Dashboard_Service
  - [x] 10.1 Extend `frontend/src/services/authService.js`
    - Add thin `sendVerification`, `verifyEmail(token)`, `forgotPassword(email)`, `resetPassword(token, newPassword)` wrappers with no `try/catch`, matching the existing five functions' contract
    - _Requirements: 17.2, 18.2, 19.3, 25.1_
  - [x] 10.2 Implement `frontend/src/services/dashboardService.js`
    - `getUserDashboard()` and `getAdminDashboard()` thin wrappers around `httpClient` calls to `/api/v1/user/dashboard` and `/api/v1/admin/dashboard`
    - _Requirements: 16.5, 25.2_
  - [x]* 10.3 Write unit tests for the four new `authService` functions and the two `dashboardService` functions
    - Assert each calls the correct method/URL/body and resolves/rejects with the documented shape, mirroring the existing five `authService` tests
    - _Requirements: 17.2, 18.2, 19.3, 16.5_

- [ ] 11. Implement the ProtectedRoute and AdminRoute components
  - [x] 11.1 Implement `frontend/src/components/ProtectedRoute.jsx`
    - Export a pure `selectProtectedRouteOutcome({ loading, isAuthenticated })` decision function returning `"loading"`, `"children"`, or `"redirect-login"`; render a loading state, `children`, or `<Navigate to="/login" />` based on its result
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_
  - [x] 11.2 Implement `frontend/src/components/AdminRoute.jsx`
    - Export a pure `selectAdminRouteOutcome({ loading, isAuthenticated, is_verified, role })` decision function returning `"loading"`, `"children"`, or `"redirect-home"`; render a loading state, `children`, or `<Navigate to="/" />` based on its result
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_
  - [x]* 11.3 Write property test for `ProtectedRoute`'s decision function
    - **Property 8: `ProtectedRoute` renders exactly one of three states as a pure function of `loading` and `isAuthenticated`**
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5**
  - [x]* 11.4 Write property test for `AdminRoute`'s decision function
    - **Property 9: `AdminRoute` renders exactly one of three states as a pure function of `loading`, `isAuthenticated`, `is_verified`, and `role`**
    - **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5**
  - [x]* 11.5 Write unit tests for `ProtectedRoute`/`AdminRoute` rendering
    - One rendering test per branch confirming `<Navigate>` targets `/login` and `/` respectively, and that `children` renders on the permitted branch
    - _Requirements: 14.4, 15.4, 15.5_

- [ ] 12. Implement the minimal DashboardPage and AdminDashboardPage
  - [x] 12.1 Implement `frontend/src/pages/DashboardPage.jsx`
    - Call `dashboardService.getUserDashboard()` on mount; render its `message` on success, a "please verify your email" state on a 403 response, and a generic error state otherwise
    - _Requirements: 16.1, 16.2, 16.4_
  - [x] 12.2 Implement `frontend/src/pages/AdminDashboardPage.jsx`
    - Call `dashboardService.getAdminDashboard()` on mount; render its `message` on success and a generic error state otherwise
    - _Requirements: 16.3, 16.4_
  - [x]* 12.3 Write unit tests for `DashboardPage` and `AdminDashboardPage`
    - Success-message rendering; `DashboardPage`'s 403 → "please verify" inline state; a generic-error state for any other rejection
    - _Requirements: 16.1, 16.2, 16.3_

- [ ] 13. Implement the VerifyEmailPage
  - [x] 13.1 Implement `frontend/src/pages/VerifyEmailPage.jsx`
    - Read `token` from `useSearchParams()`; call `authService.verifyEmail(token)` if and only if `token` is present and non-empty after trimming; on success, show a success state, toast, and navigate to `/login` after a two-second delay; on failure or a missing token, show a failure state without navigating
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_
  - [x]* 13.2 Write property test for VerifyEmailPage's token-presence gate
    - **Property 10: `VerifyEmailPage` calls the Verify_Email_Endpoint if and only if a non-empty `token` query parameter is present**
    - **Validates: Requirements 17.1, 17.5**
  - [x]* 13.3 Write unit tests for VerifyEmailPage
    - Success state → toast + delayed navigation (fake timers); failure state → toast, no navigation
    - _Requirements: 17.3, 17.4_

- [ ] 14. Implement the ForgotPasswordPage
  - [x] 14.1 Implement `frontend/src/pages/ForgotPasswordPage.jsx`
    - Exported pure `validateForgotPasswordForm({ email })` function reusing the existing `isValidEmailFormat` rule; submit handler validates first and only then calls `authService.forgotPassword(email)`; success → toast with the exact text "If an account exists, a reset link has been generated."; failure → error toast, stay on page
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_
  - [x]* 14.2 Write property test for ForgotPasswordPage's validation gate
    - **Property 11: `ForgotPasswordPage` calls the Forgot_Password_Endpoint if and only if the submitted email is non-empty and validly formatted**
    - **Validates: Requirements 18.2, 18.3**
  - [x]* 14.3 Write unit tests for ForgotPasswordPage
    - Empty/invalid-email validation message; exact success toast text match regardless of whether the mocked response includes a `token` field; non-account-related failure → error toast, stays on page
    - _Requirements: 18.3, 18.4, 18.5_

- [ ] 15. Implement the ResetPasswordPage
  - [x] 15.1 Implement `frontend/src/pages/ResetPasswordPage.jsx`
    - Read `token` from `useSearchParams()`; exported pure `validateResetPasswordForm({ newPassword, confirmPassword })` function; submit handler validates first and only then calls `authService.resetPassword(token, newPassword)`; success → toast, navigate to `/login`; failure → error toast, stay on page
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_
  - [x]* 15.2 Write property test for ResetPasswordPage's validation gate
    - **Property 12: `ResetPasswordPage` calls the Reset_Password_Endpoint if and only if the new password is at least 8 characters and the confirmation matches**
    - **Validates: Requirements 19.2, 19.3**
  - [x]* 15.3 Write unit tests for ResetPasswordPage
    - Short-password/mismatched-confirmation validation messages; success → toast + navigation to `/login`; failure → error toast, stays on page
    - _Requirements: 19.2, 19.4, 19.5_

- [ ] 16. Update the Navbar for four authentication states
  - [x] 16.1 Extend `frontend/src/components/Navbar.jsx`
    - Export a pure `selectNavbarState({ loading, isAuthenticated, is_verified, role })` function returning `"loading"`, `"guest"`, `"unverified"`, `"verified-user"`, or `"admin"`; render Guest links, a Verify Email control + Dashboard link, a Dashboard link + Logout, or a Dashboard link + Admin Panel link + Logout based on the returned state; the Verify Email control calls `authService.sendVerification`; no dropdown markup
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6_
  - [x]* 16.2 Write property test for the Navbar's state-selection function
    - **Property 13: The Navbar's state-selection function picks exactly one of four states as a pure function of authentication, verification, and role**
    - **Validates: Requirements 20.1, 20.2, 20.3, 20.4, 20.5, 20.6**
  - [x]* 16.3 Write unit tests for Navbar authentication states (extend `frontend/src/components/Navbar.test.jsx`)
    - One rendering test per of the five `selectNavbarState` outcomes asserting the documented controls appear/don't appear; a test asserting the Verify Email control calls `sendVerification`; a structural test asserting no dropdown element renders in any state
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6_

- [ ] 17. Wire the new routes into the application
  - [x] 17.1 Update `frontend/src/App.jsx`
    - Add `/forgot-password`, `/reset-password`, `/verify-email` (public), `/dashboard` (wrapped in `ProtectedRoute`), and `/admin` (wrapped in `AdminRoute`) routes inside the existing `Layout`; leave `/`, `/login`, `/signup`, `/roadmap` unchanged
    - _Requirements: 14.1, 15.1, 16.1, 16.3, 17.1, 18.1, 19.1_
  - [x]* 17.2 Update routing tests for the new routes
    - Assert each new route renders its expected page heading/state, mocking `authService`/`dashboardService` as needed
    - _Requirements: 14.1, 15.1, 17.1, 18.1, 19.1_

- [ ] 18. Checkpoint - Ensure all frontend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 19. Update the environment example file
  - [x] 19.1 Update `backend/.env.example`
    - Add `EMAIL_VERIFICATION_EXPIRE_HOURS=24`, `PASSWORD_RESET_EXPIRE_MINUTES=30`, and `APP_ENV=development` placeholder lines; leave all Sprint 0/1A variables unchanged
    - _Requirements: 22.1, 22.2_

- [ ] 20. Write README Sprint 1B Authentication Completion documentation
  - [x] 20.1 Update `README.md`
    - Add a "Sprint 1B Authentication Completion" section describing the simulated email verification flow, the simulated forgot-password/reset-password flow, the `require_verified_user`/`require_admin` dependencies and their distinction from `get_current_user`/`get_current_admin`, frontend session persistence and route-guard behavior, each new Auth_API/Dashboard_API endpoint with its method and path, and the `EMAIL_VERIFICATION_EXPIRE_HOURS`/`PASSWORD_RESET_EXPIRE_MINUTES`/`APP_ENV` environment variables; update the Sprint Status section to mark Sprint 1B completed
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5_

- [ ] 21. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; they cover property tests, unit tests, and integration-style tests only.
- Property tests (2.2, 3.3, 4.4, 4.5, 6.2, 7.2, 7.3, 11.3, 11.4, 13.2, 14.2, 15.2, 16.2) each validate exactly one Correctness Property from design.md (Properties 1-13) and use Hypothesis (backend, `max_examples=100`) or fast-check (frontend, `numRuns: 100`), matching Sprint 1A's tooling.
- Backend tests use pytest + Hypothesis + httpx/FastAPI `TestClient`, mirroring Sprint 1A's conventions; frontend tests use Vitest + React Testing Library + fast-check, matching the design's Testing Strategy.
- Checkpoints (9, 18, 21) give natural points to validate the backend, frontend, and full stack respectively before moving on.
- No existing Sprint 1A mechanism (JWT/cookie mechanics, `get_current_user`/`get_current_admin`'s existing behavior, the response envelope, the `httpClient` refresh-and-retry interceptor, `AuthContext`'s token storage) is modified by any task in this plan.
- No feature CRUD, voting, comments, moderation, roadmap, search/filtering/pagination, real email delivery, or multi-session logic is included, per the Non-Goals in requirements.md.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "4.1", "4.2", "5.1", "6.1", "10.1", "10.2", "11.1", "11.2"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.2", "4.3", "4.4", "5.2", "6.2", "8.1", "10.3", "11.3", "11.4", "12.1", "12.2", "13.1", "14.1", "15.1", "16.1"] },
    { "id": 2, "tasks": ["2.3", "3.3", "6.3", "7.1", "8.2", "11.5", "12.3", "13.2", "14.2", "15.2", "16.2", "17.1"] },
    { "id": 3, "tasks": ["3.4", "4.6", "7.2", "8.3", "13.3", "14.3", "15.3", "16.3", "17.2"] },
    { "id": 4, "tasks": ["4.5", "7.3"] },
    { "id": 5, "tasks": ["7.4", "19.1", "20.1"] }
  ]
}
```

Wave rationale: Wave 0 covers setup/infra with no intra-sprint dependencies (Settings, Security_Module generalization, the two new token models, `user.py` schema additions, User_Service extension, Auth_Middleware extension, the Frontend_Auth_Service/Dashboard_Service extensions, and the two route-guard components). Waves 1-4 advance services → routes → wiring → tests in dependency order; wave 5 finishes with the last integration test batch plus the environment file and README, documented after implementation is complete, matching Sprint 1A's convention. Tasks that would otherwise share a wave but write to the same file are separated: `test_security.py` (2.2 vs 2.3), `test_email_verification_service.py`/`test_password_reset_service.py` (3.3, which covers both files for Property 2, is kept apart from 3.4, 4.5, and 4.6, each of which also touches one of those two files), `test_auth_middleware.py` (6.2 vs 6.3), `test_auth_routes.py` (7.2, 7.3, and 7.4 each get their own wave), `ProtectedRoute.test.jsx`/`AdminRoute.test.jsx` (11.3/11.4 vs 11.5, which covers both files), and each page's own `*.test.jsx` (13.2 vs 13.3, 14.2 vs 14.3, 15.2 vs 15.3, 16.2 vs 16.3).
