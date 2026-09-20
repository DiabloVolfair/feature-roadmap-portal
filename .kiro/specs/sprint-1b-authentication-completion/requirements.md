# Requirements Document

## Introduction

This specification covers Sprint 1B of the Feature Request & Public Roadmap Portal: authentication completion. Sprint 1A delivered JWT-based signup, login, session refresh, logout, and route protection (`get_current_user`/`get_current_admin`), plus the frontend `AuthContext`, `LoginPage`, `SignupPage`, and an authentication-aware `Navbar`. This sprint completes the authentication surface on top of that foundation: simulated email verification, a simulated forgot-password/reset-password flow, role- and verification-based access control (RBAC) for two minimal protected demo routes, and the corresponding frontend integration (`ProtectedRoute`, `AdminRoute`, verification/forgot-password/reset-password pages, minimal dashboard pages, and a Navbar that reflects four distinct authentication states).

This spec preserves the Sprint 1A architecture exactly: strict layering (routes → services → `Security_Module`/`User_Service`), `Auth_Context` as the sole in-memory Access_Token store, the existing response envelope, the `AuthException` family and its single handler, the existing Refresh_Token_Cookie mechanics, and the existing `HTTP_Client` refresh-and-retry interceptor. None of those mechanisms are redesigned, replaced, or touched beyond what this sprint explicitly adds.

This spec covers email verification, password reset, RBAC, and their frontend integration only. It does not cover feature request CRUD, voting, threaded comments, admin moderation of content, the public Kanban roadmap, or search/filtering/pagination — those are addressed in later sprints (see Non-Goals).

## Glossary

- **Backend_Application**: The FastAPI application located in `backend/app/` (established in Sprint 0, extended in Sprint 1A).
- **Frontend_Application**: The React + Vite single-page application located in `frontend/src/` (established in Sprint 0, extended in Sprint 1A).
- **Settings**: The Pydantic settings object defined in `backend/app/core/config.py`.
- **Security_Module**: The module `backend/app/core/security.py` (established in Sprint 1A), responsible for password hashing, JWT creation/decoding, and Refresh_Token hashing. Extended in this sprint with a generalized opaque-token hashing capability reused for the Email_Verification_Token and the Password_Reset_Token.
- **User_Service**: The module `backend/app/services/user_service.py` (established in Sprint 1A), the sole module permitted to read from or write to the `users` collection. Extended in this sprint with functions to mark a user verified and to replace a user's stored password hash.
- **Auth_Service**: The module `backend/app/services/auth_service.py` (established in Sprint 1A). Unmodified by this sprint except where explicitly stated.
- **Auth_Middleware**: The module `backend/app/middleware/auth.py`, exposing `get_current_user` and `get_current_admin` (established in Sprint 1A) and, as of this sprint, `require_verified_user` and `require_admin`.
- **Email_Verification_Token**: An opaque, single-use, time-limited token issued by the Email_Verification_Service to prove control of a user's account for the purpose of setting `is_verified` to `true`. Represented at rest as a document in the `email_verification_tokens` collection containing a hash of the token, the associated user's `id`, an `expires_at` timestamp, and a `created_at` timestamp.
- **Email_Verification_Service**: The new module `backend/app/services/email_verification_service.py`, the sole module permitted to read from or write to the `email_verification_tokens` collection.
- **Send_Verification_Endpoint**: The new Auth_API route handler for `POST /api/v1/auth/send-verification`.
- **Verify_Email_Endpoint**: The new Auth_API route handler for `POST /api/v1/auth/verify-email`.
- **Password_Reset_Token**: An opaque, single-use, time-limited token issued by the Password_Reset_Service to prove control of a user's account for the purpose of setting a new password. Represented at rest as a document in the `password_reset_tokens` collection containing a hash of the token, the associated user's `id`, an `expires_at` timestamp, and a `created_at` timestamp.
- **Password_Reset_Service**: The new module `backend/app/services/password_reset_service.py`, the sole module permitted to read from or write to the `password_reset_tokens` collection.
- **Forgot_Password_Endpoint**: The new Auth_API route handler for `POST /api/v1/auth/forgot-password`.
- **Reset_Password_Endpoint**: The new Auth_API route handler for `POST /api/v1/auth/reset-password`.
- **Require_Verified_User**: The new Auth_Middleware dependency `require_verified_user`, requiring a resolved, authenticated user whose `is_verified` field is `true`.
- **Require_Admin**: The new Auth_Middleware dependency `require_admin`, requiring a resolved, authenticated, verified user whose `role` field is `"admin"`.
- **User_Dashboard_Endpoint**: The new route handler for `GET /api/v1/user/dashboard`, protected by Require_Verified_User.
- **Admin_Dashboard_Endpoint**: The new route handler for `GET /api/v1/admin/dashboard`, protected by Require_Admin.
- **ProtectedRoute**: The new component `frontend/src/components/ProtectedRoute.jsx`, gating a route on authentication state alone.
- **AdminRoute**: The new component `frontend/src/components/AdminRoute.jsx`, gating a route on authenticated, verified, and admin state together.
- **Dashboard_Service**: The new module `frontend/src/services/dashboardService.js`, wrapping HTTP_Client calls to the User_Dashboard_Endpoint and the Admin_Dashboard_Endpoint.
- **DashboardPage**: The new component `frontend/src/pages/DashboardPage.jsx`, a minimal page rendered at `/dashboard` that calls the Dashboard_Service and displays the User_Dashboard_Endpoint's message.
- **AdminDashboardPage**: The new component `frontend/src/pages/AdminDashboardPage.jsx`, a minimal page rendered at `/admin` that calls the Dashboard_Service and displays the Admin_Dashboard_Endpoint's message.
- **VerifyEmailPage**: The new component `frontend/src/pages/VerifyEmailPage.jsx`, rendered at `/verify-email`.
- **ForgotPasswordPage**: The new component `frontend/src/pages/ForgotPasswordPage.jsx`, rendered at `/forgot-password`.
- **ResetPasswordPage**: The new component `frontend/src/pages/ResetPasswordPage.jsx`, rendered at `/reset-password`.
- **Auth_Context**, **Frontend_Auth_Service**, **HTTP_Client**, **Navbar**, **LoginPage**, **SignupPage**, **Access_Token**, **Refresh_Token**, **Refresh_Token_Cookie**, **Auth_API**: Established in Sprint 1A; unchanged in meaning here.
- **App_Environment**: The new `app_env` Settings field, loaded from the `APP_ENV` environment variable, taking the value `"development"` or `"production"`.

## Requirements

### Backend Configuration

#### Requirement 1: Sprint 1B Configuration Values

**User Story:** As a developer, I want the new time limits and environment mode loaded from environment variables, so that no sprint-specific value is hardcoded in the Backend_Application.

##### Acceptance Criteria

1. THE Settings SHALL load `email_verification_expire_hours` as an integer from the `EMAIL_VERIFICATION_EXPIRE_HOURS` environment variable, defaulting to `24` when unset.
2. THE Settings SHALL load `password_reset_expire_minutes` as an integer from the `PASSWORD_RESET_EXPIRE_MINUTES` environment variable, defaulting to `30` when unset.
3. THE Settings SHALL load `app_env` as a string from the `APP_ENV` environment variable, defaulting to `"production"` when unset, so that omitting `APP_ENV` never accidentally enables development-only response fields.
4. THE Email_Verification_Service and Password_Reset_Service SHALL read `email_verification_expire_hours` and `password_reset_expire_minutes` exclusively from Settings, and SHALL NOT define either lifetime as a literal in source code.
5. THE Send_Verification_Endpoint and Forgot_Password_Endpoint SHALL read `app_env` exclusively from Settings to decide whether a raw token is included in a response, and SHALL NOT define the environment-gating condition as a literal comparison against an imported environment variable elsewhere in the Backend_Application.

### Email Verification

#### Requirement 2: Email_Verification_Token Persistence

**User Story:** As a developer, I want a dedicated persistence layer for verification tokens, so that no other module accesses the `email_verification_tokens` collection directly.

##### Acceptance Criteria

1. THE Email_Verification_Service SHALL provide a function that creates a new Email_Verification_Token for a given user `id`, generating the raw token value using Python's `secrets` module, persisting only a hash of the raw token together with the user's `id`, a `created_at` timestamp, and an `expires_at` timestamp set to the current time plus `email_verification_expire_hours` hours, and returning the raw token value to its caller exactly once.
2. THE Email_Verification_Service SHALL hash the raw token before persistence using the same digest-then-bcrypt hashing approach already established in the Security_Module for the Refresh_Token, and SHALL NOT persist the raw token value.
3. THE Email_Verification_Service SHALL provide a function that, given a raw token value, locates the matching unexpired Email_Verification_Token record by comparing the presented value against the persisted hash, marks that user's record as verified via the User_Service, and deletes the matched Email_Verification_Token record so the same raw token value cannot be consumed a second time.
4. IF no persisted Email_Verification_Token record's hash matches the presented raw token value, THEN THE Email_Verification_Service SHALL signal an Invalid Token failure and SHALL NOT modify any user document.
5. IF a persisted Email_Verification_Token record's hash matches the presented raw token value but that record's `expires_at` timestamp is in the past, THEN THE Email_Verification_Service SHALL signal an Expired Token failure, SHALL NOT modify any user document, and SHALL NOT delete the expired record as a side effect of this failure path.
6. IF the Email_Verification_Token record's associated user `id` no longer identifies an existing user, THEN THE Email_Verification_Service SHALL signal an Invalid Token failure and SHALL NOT modify any user document.
7. THE Auth_API, Auth_Service, and Auth_Middleware SHALL access Email_Verification_Token data exclusively through the Email_Verification_Service, and SHALL NOT issue MongoDB queries directly against the `email_verification_tokens` collection.

#### Requirement 3: Send Verification Endpoint

**User Story:** As a logged-in user, I want to request an email verification token for my own account, so that I can complete the (simulated) email verification flow.

##### Acceptance Criteria

1. THE Send_Verification_Endpoint SHALL accept `POST` requests to `/api/v1/auth/send-verification`, requiring an authenticated user resolved via the `get_current_user` dependency before executing route logic.
2. WHEN the Send_Verification_Endpoint is invoked by an authenticated user whose `is_verified` field is `false`, THE Send_Verification_Endpoint SHALL use the Email_Verification_Service to create a new Email_Verification_Token for that user, simulate sending a verification email (no real email provider integration; creating the token record constitutes the simulated send), and respond with HTTP status 200 and a success envelope.
3. IF the authenticated user's `is_verified` field is already `true`, THEN THE Send_Verification_Endpoint SHALL respond with HTTP status 200 and a success envelope indicating the account is already verified, and SHALL NOT create a new Email_Verification_Token.
4. WHERE the App_Environment is `"development"`, THE Send_Verification_Endpoint's success envelope SHALL include the raw verification token value in the `data` field when a new Email_Verification_Token was created in this request.
5. WHERE the App_Environment is `"production"`, THE Send_Verification_Endpoint's response SHALL NOT include the raw verification token value anywhere in the response body, regardless of any other condition.
6. THE Send_Verification_Endpoint SHALL be implemented as an asynchronous FastAPI route handler that delegates token creation to the Email_Verification_Service and contains no direct token hashing or database logic.

#### Requirement 4: Verify Email Endpoint

**User Story:** As a user who received a verification link, I want to complete verification using only the token from that link, so that I do not need to already be logged in in every circumstance the link might be opened.

##### Acceptance Criteria

1. THE Verify_Email_Endpoint SHALL accept `POST` requests to `/api/v1/auth/verify-email` with a request body containing a `token` field, and SHALL NOT require an authenticated session or an `Authorization` header, because the presented token itself is the proof of account ownership for this endpoint.
2. WHEN the Verify_Email_Endpoint receives a request whose `token` matches an unexpired, unused Email_Verification_Token, THE Verify_Email_Endpoint SHALL use the Email_Verification_Service to mark the associated user's `is_verified` field `true` via the User_Service, consume the token so it cannot be used again, and respond with HTTP status 200 and a success envelope.
3. IF the Verify_Email_Endpoint receives a request whose `token` does not match any persisted Email_Verification_Token (including a token that was already consumed by a prior successful call), THEN THE Verify_Email_Endpoint SHALL respond with HTTP status 401 and an error envelope.
4. IF the Verify_Email_Endpoint receives a request whose `token` matches a persisted Email_Verification_Token that has expired, THEN THE Verify_Email_Endpoint SHALL respond with HTTP status 401 and an error envelope.
5. THE Verify_Email_Endpoint SHALL be implemented as an asynchronous FastAPI route handler that delegates token validation and consumption to the Email_Verification_Service and contains no direct token hashing or database logic.

### Password Reset

#### Requirement 5: Password_Reset_Token Persistence

**User Story:** As a developer, I want a dedicated persistence layer for password reset tokens, so that no other module accesses the `password_reset_tokens` collection directly.

##### Acceptance Criteria

1. THE Password_Reset_Service SHALL provide a function that creates a new Password_Reset_Token for a given user `id`, generating the raw token value using Python's `secrets` module, persisting only a hash of the raw token together with the user's `id`, a `created_at` timestamp, and an `expires_at` timestamp set to the current time plus `password_reset_expire_minutes` minutes, and returning the raw token value to its caller exactly once.
2. THE Password_Reset_Service SHALL hash the raw token before persistence using the same digest-then-bcrypt hashing approach already established in the Security_Module for the Refresh_Token, and SHALL NOT persist the raw token value.
3. THE Password_Reset_Service SHALL provide a function that, given a raw token value and a new plaintext password, locates the matching unexpired Password_Reset_Token record by comparing the presented value against the persisted hash, hashes the new password via the Security_Module, replaces the associated user's stored password hash via the User_Service, clears that user's persisted Refresh_Token hash via the User_Service, and deletes the matched Password_Reset_Token record so the same raw token value cannot be consumed a second time.
4. IF no persisted Password_Reset_Token record's hash matches the presented raw token value, THEN THE Password_Reset_Service SHALL signal an Invalid Token failure and SHALL NOT modify any user document.
5. IF a persisted Password_Reset_Token record's hash matches the presented raw token value but that record's `expires_at` timestamp is in the past, THEN THE Password_Reset_Service SHALL signal an Expired Token failure, SHALL NOT modify any user document, and SHALL NOT delete the expired record as a side effect of this failure path.
6. IF the Password_Reset_Token record's associated user `id` no longer identifies an existing user, THEN THE Password_Reset_Service SHALL signal an Invalid Token failure and SHALL NOT modify any user document.
7. THE Auth_API, Auth_Service, and Auth_Middleware SHALL access Password_Reset_Token data exclusively through the Password_Reset_Service, and SHALL NOT issue MongoDB queries directly against the `password_reset_tokens` collection.

#### Requirement 6: Forgot Password Endpoint

**User Story:** As a user who forgot my password, I want to request a password reset without revealing whether my email is registered, so that the system does not leak account existence to an attacker.

##### Acceptance Criteria

1. THE Forgot_Password_Endpoint SHALL accept `POST` requests to `/api/v1/auth/forgot-password` with a request body containing an `email` field, and SHALL NOT require an authenticated session.
2. WHEN the Forgot_Password_Endpoint is invoked with an email that matches an existing user, THE Forgot_Password_Endpoint SHALL use the Password_Reset_Service to create a new Password_Reset_Token for that user.
3. WHEN the Forgot_Password_Endpoint is invoked with an email that does not match an existing user, THE Forgot_Password_Endpoint SHALL NOT create a Password_Reset_Token and SHALL NOT query the User_Service for any purpose other than the existence check itself.
4. THE Forgot_Password_Endpoint SHALL respond with HTTP status 200 and a success envelope whose `message` field is identical in wording regardless of whether the submitted email matched an existing user, so that the response message alone never reveals account existence.
5. WHERE the App_Environment is `"development"` and the submitted email matched an existing user, THE Forgot_Password_Endpoint's success envelope SHALL include the raw reset token value in the `data` field.
6. WHERE the App_Environment is `"development"` and the submitted email did not match an existing user, THE Forgot_Password_Endpoint's success envelope SHALL NOT include a raw reset token value in the `data` field, so that the presence or absence of the token field is the only development-mode signal of account existence, and this signal SHALL NOT be present at all when the App_Environment is `"production"`.
7. WHERE the App_Environment is `"production"`, THE Forgot_Password_Endpoint's response SHALL NOT include the raw reset token value anywhere in the response body under any condition.
8. THE Forgot_Password_Endpoint SHALL be implemented as an asynchronous FastAPI route handler that delegates token creation to the Password_Reset_Service and contains no direct token hashing or database logic.

#### Requirement 7: Reset Password Endpoint

**User Story:** As a user with a password reset link, I want to set a new password using the token from that link, so that I can regain access to my account.

##### Acceptance Criteria

1. THE Reset_Password_Endpoint SHALL accept `POST` requests to `/api/v1/auth/reset-password` with a request body containing a `token` field and a `new_password` field, and SHALL NOT require an authenticated session.
2. THE Reset_Password_Endpoint's request body schema SHALL validate `new_password` against the same 8-128 character bounds already defined on the `UserCreate` schema's `password` field, rather than defining a new set of bounds for this endpoint.
3. WHEN the Reset_Password_Endpoint receives a request whose `token` matches an unexpired, unused Password_Reset_Token, THE Reset_Password_Endpoint SHALL use the Password_Reset_Service to hash and persist `new_password` as the associated user's password hash, clear that user's persisted Refresh_Token hash so any existing session is invalidated, consume the token so it cannot be used again, and respond with HTTP status 200 and a success envelope.
4. IF the Reset_Password_Endpoint receives a request whose `token` does not match any persisted Password_Reset_Token (including a token that was already consumed by a prior successful call), THEN THE Reset_Password_Endpoint SHALL respond with HTTP status 401 and an error envelope, and SHALL NOT modify any user document.
5. IF the Reset_Password_Endpoint receives a request whose `token` matches a persisted Password_Reset_Token that has expired, THEN THE Reset_Password_Endpoint SHALL respond with HTTP status 401 and an error envelope, and SHALL NOT modify any user document.
6. IF the Reset_Password_Endpoint receives a request body whose `new_password` violates the bounds defined in criterion 2, THEN THE Reset_Password_Endpoint SHALL respond with HTTP status 422 and an error envelope.
7. THE Reset_Password_Endpoint SHALL be implemented as an asynchronous FastAPI route handler that delegates token validation, password hashing, and session invalidation to the Password_Reset_Service and contains no direct token hashing, password hashing, or database logic.

### Authentication Cleanup

#### Requirement 8: Session Termination Guarantees

**User Story:** As a security-conscious developer, I want the logout and password-reset flows to reliably terminate sessions, so that a compromised or changed credential cannot be used to maintain an old session.

##### Acceptance Criteria

1. THE Logout_Endpoint SHALL continue to clear the authenticated user's persisted Refresh_Token hash on every invocation, exactly as established in Sprint 1A; this sprint introduces no change to that behavior and it SHALL NOT regress.
2. WHEN the Reset_Password_Endpoint successfully resets a user's password, THE Backend_Application SHALL treat clearing that single user's persisted Refresh_Token hash as the complete and sufficient mechanism for terminating that user's active session, because the User_Model persists exactly one Refresh_Token hash per user (a single-active-session model) rather than a per-device session list; this is a documented architectural constraint carried over unchanged from Sprint 1A, not a gap to be closed with a multi-session mechanism in this sprint.
3. THE Send_Verification_Endpoint SHALL require an authenticated user resolved via the `get_current_user` dependency, as stated in Requirement 3.1, so that only a user's own logged-in session can request a verification token for that account.

### RBAC Middleware

#### Requirement 9: Verified-User Dependency

**User Story:** As a developer, I want a reusable dependency that restricts a route to verified users, so that future verified-only routes can enforce this consistently.

##### Acceptance Criteria

1. THE Auth_Middleware SHALL provide a `require_verified_user` dependency that first resolves the current user by invoking `get_current_user`.
2. IF `get_current_user` raises an authentication failure while resolving the current user, THEN `require_verified_user` SHALL propagate that failure resulting in the same HTTP status and error envelope defined for `get_current_user` in Sprint 1A, without evaluating the `is_verified` field.
3. IF the resolved user's `is_verified` field is not `true`, THEN THE Auth_Middleware SHALL raise an Unauthorized failure resulting in HTTP status 403 and an error envelope, reusing the existing `UnauthorizedException` with its overridable status code rather than introducing a new exception type.
4. WHEN the resolved user's `is_verified` field is `true`, THE Auth_Middleware SHALL provide that user to the requesting route handler.

#### Requirement 10: Admin Dependency for Verified Administrators

**User Story:** As a developer, I want a reusable dependency that restricts a route to verified administrators, so that this sprint's admin-only demo route enforces both role and verification together.

##### Acceptance Criteria

1. THE Auth_Middleware SHALL provide a `require_admin` dependency that first resolves the current user by invoking `get_current_user`.
2. IF `get_current_user` raises an authentication failure while resolving the current user, THEN `require_admin` SHALL propagate that failure resulting in the same HTTP status and error envelope defined for `get_current_user` in Sprint 1A, without evaluating `is_verified` or `role`.
3. IF the resolved user's `is_verified` field is not `true`, OR the resolved user's `role` field is not `"admin"`, THEN THE Auth_Middleware SHALL raise an Unauthorized failure resulting in HTTP status 403 and an error envelope, reusing the existing `UnauthorizedException`.
4. WHEN the resolved user's `is_verified` field is `true` and `role` field is `"admin"`, THE Auth_Middleware SHALL provide that user to the requesting route handler.
5. THE `require_admin` dependency SHALL be introduced as an additive dependency distinct from the existing `get_current_admin` dependency (which checks `role == "admin"` only, without checking `is_verified`); this sprint SHALL NOT modify `get_current_admin`'s existing behavior, and `require_admin` is documented as the stricter dependency intended for routes that must guarantee both verification and role, starting with the Admin_Dashboard_Endpoint introduced in this sprint.

### Protected Test Routes

#### Requirement 11: User Dashboard Endpoint

**User Story:** As a verified user, I want a minimal protected endpoint I can call to confirm my session grants verified-user access, so that role-based access control can be demonstrated and tested.

##### Acceptance Criteria

1. THE User_Dashboard_Endpoint SHALL accept `GET` requests to `/api/v1/user/dashboard`, requiring a verified, authenticated user resolved via the `require_verified_user` dependency before executing route logic.
2. WHEN the User_Dashboard_Endpoint is invoked by a verified, authenticated user, THE User_Dashboard_Endpoint SHALL respond with HTTP status 200 and a success envelope whose `data` field contains a `message` field with the exact text "Welcome to your dashboard.", consistent with the existing convention that the envelope's top-level `message` field carries a generic description of the result (e.g. "Dashboard retrieved.") while endpoint-specific payload content is carried in `data`.
3. IF the `require_verified_user` dependency raises a failure because the user is not authenticated, THEN THE User_Dashboard_Endpoint SHALL respond with HTTP status 401 and an error envelope.
4. IF the `require_verified_user` dependency raises a failure because the authenticated user's `is_verified` field is not `true`, THEN THE User_Dashboard_Endpoint SHALL respond with HTTP status 403 and an error envelope.
5. THE User_Dashboard_Endpoint SHALL be implemented as a minimal demonstration route containing no business logic beyond delegating authorization to `require_verified_user` and returning the fixed message described in criterion 2.

#### Requirement 12: Admin Dashboard Endpoint

**User Story:** As an administrator, I want a minimal protected endpoint I can call to confirm my session grants administrator access, so that role-based access control can be demonstrated and tested.

##### Acceptance Criteria

1. THE Admin_Dashboard_Endpoint SHALL accept `GET` requests to `/api/v1/admin/dashboard`, requiring a verified, authenticated administrator resolved via the `require_admin` dependency before executing route logic.
2. WHEN the Admin_Dashboard_Endpoint is invoked by a verified, authenticated administrator, THE Admin_Dashboard_Endpoint SHALL respond with HTTP status 200 and a success envelope whose `data` field contains a `message` field with the exact text "Welcome Admin.", following the same envelope convention described in Requirement 11.2.
3. IF the `require_admin` dependency raises a failure because the user is not authenticated, THEN THE Admin_Dashboard_Endpoint SHALL respond with HTTP status 401 and an error envelope.
4. IF the `require_admin` dependency raises a failure because the authenticated user is not both verified and an administrator, THEN THE Admin_Dashboard_Endpoint SHALL respond with HTTP status 403 and an error envelope.
5. THE Admin_Dashboard_Endpoint SHALL be implemented as a minimal demonstration route containing no business logic beyond delegating authorization to `require_admin` and returning the fixed message described in criterion 2.

### Frontend Session Persistence

#### Requirement 13: Confirmation of Existing Session Persistence

**User Story:** As a frontend developer, I want confirmation that session persistence across a page reload already works and already exposes verification and role data, so that the new route-guard components can rely on it without additional plumbing.

##### Acceptance Criteria

1. THE Auth_Context SHALL continue to perform its Sprint 1A startup session check (calling the Frontend_Auth_Service's `refresh` function and, only on success, its `getCurrentUser` function) on every Frontend_Application load, exactly as established in Sprint 1A; this sprint introduces no change to that startup behavior and it SHALL NOT regress.
2. THE `user` object exposed by the Auth_Context SHALL continue to include the `role` and `is_verified` fields exactly as returned by the Me_Endpoint's `UserResponse`, established in Sprint 1A, so that ProtectedRoute and AdminRoute can read authentication, verification, and role state directly from `useAuth()` without any additional Auth_Context change in this sprint.

### Frontend Route Guards

#### Requirement 14: ProtectedRoute Component

**User Story:** As a user, I want routes that require login to redirect me to the login page when I am not logged in, so that I cannot view pages meant only for authenticated users.

##### Acceptance Criteria

1. THE ProtectedRoute component SHALL accept child content to render when access is permitted.
2. WHILE the Auth_Context reports `loading` as true, THE ProtectedRoute component SHALL render a loading state and SHALL NOT render its child content or redirect.
3. WHILE the Auth_Context reports `loading` as false and `isAuthenticated` as true, THE ProtectedRoute component SHALL render its child content.
4. WHILE the Auth_Context reports `loading` as false and `isAuthenticated` as false, THE ProtectedRoute component SHALL redirect to the LoginPage and SHALL NOT render its child content.
5. THE ProtectedRoute component SHALL gate access on `isAuthenticated` alone and SHALL NOT additionally require `is_verified` or a specific `role`; a route that also requires verification enforces that requirement through the corresponding Backend_Application endpoint's authorization dependency and the requesting page's own handling of a resulting 403 response, as established in Requirement 17.

#### Requirement 15: AdminRoute Component

**User Story:** As an administrator, I want an admin-only route guard that checks role and verification together, so that non-administrators and unverified administrators cannot reach admin-only pages.

##### Acceptance Criteria

1. THE AdminRoute component SHALL accept child content to render when access is permitted.
2. WHILE the Auth_Context reports `loading` as true, THE AdminRoute component SHALL render a loading state and SHALL NOT render its child content or redirect.
3. WHILE the Auth_Context reports `loading` as false, `isAuthenticated` as true, `user.is_verified` as true, and `user.role` as `"admin"`, THE AdminRoute component SHALL render its child content.
4. WHILE the Auth_Context reports `loading` as false and any of `isAuthenticated`, `user.is_verified`, or `user.role === "admin"` does not hold, THE AdminRoute component SHALL redirect to HomePage and SHALL NOT render its child content.
5. THE AdminRoute component's redirect target SHALL be HomePage rather than LoginPage, distinguishing its behavior from ProtectedRoute's redirect target, because a logged-in but non-administrator user should land on a normal page rather than being sent back to a login form.

### Dashboard Pages

#### Requirement 16: Minimal Dashboard Pages

**User Story:** As a developer, I want minimal frontend pages backing the new `/dashboard` and `/admin` routes, so that those routes render meaningful content rather than an empty page.

##### Acceptance Criteria

1. THE DashboardPage component SHALL call the Dashboard_Service's user-dashboard function on mount and render the `message` value from the User_Dashboard_Endpoint's `data` field once the call resolves.
2. IF the DashboardPage's call to the Dashboard_Service fails with an HTTP 403 response, THEN THE DashboardPage SHALL render a message indicating the account is not yet verified, rather than an unhandled error state.
3. THE AdminDashboardPage component SHALL call the Dashboard_Service's admin-dashboard function on mount and render the `message` value from the Admin_Dashboard_Endpoint's `data` field once the call resolves.
4. THE DashboardPage and AdminDashboardPage components SHALL contain no business logic beyond calling the Dashboard_Service and rendering its resolved message or a failure state, consistent with these routes' role as minimal demonstration pages rather than real feature functionality.
5. THE Dashboard_Service SHALL provide functions that call the User_Dashboard_Endpoint and the Admin_Dashboard_Endpoint using HTTP_Client, and SHALL be implemented as a module distinct from the Frontend_Auth_Service, so that the Frontend_Auth_Service remains scoped exclusively to the Auth_API as established in Sprint 1A.

### Email Verification Page

#### Requirement 17: Verify Email Page

**User Story:** As a user who clicked a verification link, I want a page that completes verification using the link's token, so that I can confirm my account without manually calling an API.

##### Acceptance Criteria

1. THE VerifyEmailPage SHALL read a `token` value from its route's URL query string.
2. WHEN the VerifyEmailPage mounts with a non-empty `token` value, THE VerifyEmailPage SHALL call the Verify_Email_Endpoint via the Frontend_Auth_Service with that token.
3. WHEN the Verify_Email_Endpoint call succeeds, THE VerifyEmailPage SHALL display a success state, display a success Toast_Notifier notification, and navigate to LoginPage after a two-second delay so the user has time to read the success state before being redirected.
4. IF the Verify_Email_Endpoint call fails, THEN THE VerifyEmailPage SHALL display a failure state describing the failure and SHALL NOT navigate away automatically.
5. IF the VerifyEmailPage mounts with an empty or missing `token` value, THEN THE VerifyEmailPage SHALL display a failure state without calling the Verify_Email_Endpoint.

### Forgot Password Page

#### Requirement 18: Forgot Password Page

**User Story:** As a user who forgot my password, I want a page to request a password reset by email, so that I can regain access to my account.

##### Acceptance Criteria

1. THE ForgotPasswordPage SHALL render a single email input field and a submit control.
2. WHEN a user submits the ForgotPasswordPage form with a non-empty, validly formatted email, THE ForgotPasswordPage SHALL call the Forgot_Password_Endpoint via the Frontend_Auth_Service with that email.
3. IF a user submits the ForgotPasswordPage form with an empty or invalidly formatted email, THEN THE ForgotPasswordPage SHALL display a validation message and SHALL NOT call the Forgot_Password_Endpoint.
4. WHEN the Forgot_Password_Endpoint call succeeds, THE ForgotPasswordPage SHALL display a Toast_Notifier notification with the exact text "If an account exists, a reset link has been generated.", matching the endpoint's identical-response-regardless-of-existence behavior defined in Requirement 6.4.
5. IF the Forgot_Password_Endpoint call fails for a reason other than the account-existence case covered by criterion 4 (e.g. a network or validation failure), THEN THE ForgotPasswordPage SHALL display an error Toast_Notifier notification and SHALL remain on the page.

### Reset Password Page

#### Requirement 19: Reset Password Page

**User Story:** As a user with a password reset link, I want a page to set a new password using the link's token, so that I can regain access to my account.

##### Acceptance Criteria

1. THE ResetPasswordPage SHALL render a New Password input field, a Confirm Password input field, and a submit control, and SHALL read a `token` value from its route's URL query string.
2. IF a user submits the ResetPasswordPage form with a New Password shorter than 8 characters, or a Confirm Password that does not match the New Password, THEN THE ResetPasswordPage SHALL display a validation message identifying the failing field, mirroring the validation pattern already established by SignupPage's pure validator functions, and SHALL NOT call the Reset_Password_Endpoint.
3. WHEN a user submits the ResetPasswordPage form with a New Password of at least 8 characters matching its Confirm Password, THE ResetPasswordPage SHALL call the Reset_Password_Endpoint via the Frontend_Auth_Service with the URL's `token` value and the New Password.
4. WHEN the Reset_Password_Endpoint call succeeds, THE ResetPasswordPage SHALL display a success Toast_Notifier notification and navigate to LoginPage.
5. IF the Reset_Password_Endpoint call fails, THEN THE ResetPasswordPage SHALL display an error Toast_Notifier notification describing the failure and SHALL remain on the page.

### Navbar

#### Requirement 20: Four-State Navbar

**User Story:** As a user, I want the navigation bar to reflect my exact authentication and verification status, so that I always know what actions are available to me.

##### Acceptance Criteria

1. WHILE the Auth_Context reports `loading` as false and `isAuthenticated` as false, THE Navbar SHALL display the Login and Signup navigation links, exactly as established in Sprint 1A (Guest state).
2. WHILE the Auth_Context reports `loading` as false, `isAuthenticated` as true, and `user.is_verified` as false, THE Navbar SHALL display a Verify Email control and a Dashboard navigation link (Logged-in-but-unverified state).
3. WHILE the Auth_Context reports `loading` as false, `isAuthenticated` as true, `user.is_verified` as true, and `user.role` as `"user"`, THE Navbar SHALL display a Dashboard navigation link and the Logout control established in Sprint 1A (Verified user state).
4. WHILE the Auth_Context reports `loading` as false, `isAuthenticated` as true, `user.is_verified` as true, and `user.role` as `"admin"`, THE Navbar SHALL display a Dashboard navigation link, an Admin Panel navigation link, and the Logout control (Admin state).
5. WHILE the Auth_Context reports `loading` as true, THE Navbar SHALL display neither the Guest links nor any authenticated-state controls, exactly as established in Sprint 1A.
6. THE Navbar SHALL NOT render a profile dropdown menu in this sprint, exactly as established in Sprint 1A; the four states in criteria 1-4 SHALL each be rendered as flat elements.

### Toast Notifications

#### Requirement 21: Sprint 1B Toast Coverage

**User Story:** As a user, I want clear success and error feedback for every new action introduced in this sprint, so that I understand the outcome of email verification, password reset, and access-control failures.

##### Acceptance Criteria

1. THE Frontend_Application SHALL display a success Toast_Notifier notification when email verification succeeds, when a password reset succeeds, and when the existing signup and logout flows complete, using the Sonner integration already established in Sprint 1A.
2. THE Frontend_Application SHALL display an error Toast_Notifier notification when a Dashboard_Service or Frontend_Auth_Service call fails with an HTTP 401 or HTTP 403 status, other than the DashboardPage's own inline not-yet-verified state described in Requirement 16.2.
3. THE VerifyEmailPage and ResetPasswordPage SHALL display an error Toast_Notifier notification describing an invalid or expired token when the corresponding endpoint responds with HTTP status 401.

### Environment Variables

#### Requirement 22: Environment Variable Updates

**User Story:** As a developer, I want the example environment file updated for this sprint's configuration additions, so that the project remains configurable without exposing real secrets.

##### Acceptance Criteria

1. THE `backend/.env.example` file SHALL continue to contain exactly one `KEY=VALUE` line for each environment variable established in Sprint 0 and Sprint 1A, unchanged.
2. THE `backend/.env.example` file SHALL add exactly one `KEY=VALUE` line for each of `EMAIL_VERIFICATION_EXPIRE_HOURS` (set to `24`), `PASSWORD_RESET_EXPIRE_MINUTES` (set to `30`), and `APP_ENV` (set to `development`).
3. THE Repository_Root's git history SHALL NOT contain a committed `.env` file, and SHALL NOT contain any file assigning `EMAIL_VERIFICATION_EXPIRE_HOURS`, `PASSWORD_RESET_EXPIRE_MINUTES`, or `APP_ENV` a value other than the placeholder value present in the current `backend/.env.example` file.

### Documentation

#### Requirement 23: README Sprint 1B Documentation

**User Story:** As a new contributor, I want the README to explain the completed authentication system, so that I can understand and run the full authentication flow without additional guidance.

##### Acceptance Criteria

1. THE README.md file SHALL contain a "Sprint 1B Authentication Completion" section, matching the structure of the existing "Sprint 1A Authentication" section.
2. THE "Sprint 1B Authentication Completion" section SHALL describe the simulated email verification flow, the simulated forgot-password/reset-password flow, the `require_verified_user` and `require_admin` dependencies and their distinction from `get_current_user`/`get_current_admin`, and the frontend session persistence and route-guard behavior.
3. THE "Sprint 1B Authentication Completion" section SHALL list each new Auth_API endpoint together with its HTTP method and path (`POST /api/v1/auth/send-verification`, `POST /api/v1/auth/verify-email`, `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password`, `GET /api/v1/user/dashboard`, `GET /api/v1/admin/dashboard`).
4. THE "Sprint 1B Authentication Completion" section SHALL document the `EMAIL_VERIFICATION_EXPIRE_HOURS`, `PASSWORD_RESET_EXPIRE_MINUTES`, and `APP_ENV` environment variables, stating for each variable a one-sentence description of its purpose.
5. THE README.md file SHALL update its Sprint Status section to indicate that Sprint 1B is completed.

### Cross-Cutting Standards

#### Requirement 24: Backend Coding Standards

**User Story:** As a maintainer, I want the new authentication code to follow the project's architectural conventions, so that future sprints can extend it without accumulating inconsistency.

##### Acceptance Criteria

1. THE Send_Verification_Endpoint, Verify_Email_Endpoint, Forgot_Password_Endpoint, Reset_Password_Endpoint, User_Dashboard_Endpoint, and Admin_Dashboard_Endpoint route handlers SHALL be implemented as asynchronous FastAPI functions.
2. THE route handlers listed in criterion 1 SHALL contain only request parsing, dependency wiring, invoking Email_Verification_Service/Password_Reset_Service/User_Service functions, and formatting the returned result into a response, and SHALL NOT catch service-layer exceptions to construct error envelopes inline, perform token hashing, issue direct database queries, or implement business validation beyond Pydantic schema validation.
3. THE Backend_Application SHALL NOT modify the existing JWT-based Access_Token/Refresh_Token mechanics, the existing Refresh_Token_Cookie attributes, the existing `get_current_user`/`get_current_admin` dependencies' existing behavior, or the existing response envelope shape as part of this sprint.
4. THE Email_Verification_Service and Password_Reset_Service SHALL reuse the Security_Module's existing digest-then-bcrypt hashing approach for their respective opaque tokens rather than introducing a new hashing scheme, and SHALL reuse the existing `InvalidTokenException`/`ExpiredTokenException`/`UnauthorizedException` exception types rather than introducing new exception classes, consistent with Requirement 18 of Sprint 1A.

#### Requirement 25: Frontend Coding Standards

**User Story:** As a maintainer, I want the new frontend authentication code to follow the project's architectural conventions, so that authentication concerns stay isolated from page rendering.

##### Acceptance Criteria

1. THE VerifyEmailPage, ForgotPasswordPage, and ResetPasswordPage components SHALL contain form rendering and validation logic only, and SHALL delegate all Auth_API calls to the Frontend_Auth_Service.
2. THE DashboardPage and AdminDashboardPage components SHALL contain rendering logic only, and SHALL delegate all dashboard-endpoint calls to the Dashboard_Service.
3. THE Frontend_Application SHALL NOT modify the existing HTTP_Client refresh-and-retry interceptor, the existing `registerAccessTokenGetter`/`registerAccessTokenSetter`/`registerAuthFailureHandler` mechanism, or the existing Auth_Context token-storage behavior as part of this sprint.
4. THE Frontend_Application SHALL NOT store the Email_Verification_Token, the Password_Reset_Token, the Access_Token, or the Refresh_Token in `localStorage` or `sessionStorage` at any point in the verification, forgot-password, or reset-password flows.

## Non-Goals (Out of Scope for This Spec)

The following are explicitly excluded from Sprint 1B and are deferred to later sprints:

- Feature request CRUD (create, read, update, delete of feature requests).
- Voting on feature requests.
- Threaded comments.
- Admin dashboard and content moderation UI beyond the minimal `/admin` demonstration page and `Admin_Dashboard_Endpoint` defined in this spec.
- Public Kanban roadmap board and status transitions.
- Search, filtering, and pagination.
- Real email delivery of any kind (verification and password reset remain fully simulated; no email provider is integrated).
- A multi-device/multi-session model; the User_Model continues to persist exactly one Refresh_Token hash per user, as documented in Requirement 8.2.
- A profile dropdown menu.
- Rate limiting or throttling of the Send_Verification_Endpoint or Forgot_Password_Endpoint.
- Deployment configuration and production infrastructure.
