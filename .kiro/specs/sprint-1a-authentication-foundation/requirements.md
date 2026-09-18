
# Requirements Document

## Introduction

This specification covers Sprint 1A of the Feature Request & Public Roadmap Portal: the authentication foundation. Sprint 0 delivered the scaffolded Frontend_Application and Backend_Application, including the versioned API router, the response envelope, the MongoDB connection lifecycle, and placeholder Login/Signup pages. This sprint builds JWT-based authentication on top of that scaffolding: user registration, login, session refresh, logout, route protection, and the corresponding frontend integration (auth service, auth context, working Login/Signup pages, and an authentication-aware Navbar).

This spec covers authentication only. It does not cover feature request CRUD, voting, threaded comments, admin moderation, the public Kanban roadmap, search, filtering, or pagination — those are addressed in later sprints (see Non-Goals).

## Glossary

- **Backend_Application**: The FastAPI application located in `backend/app/`, entry point `backend/app/main.py` (established in Sprint 0).
- **Frontend_Application**: The React + Vite single-page application located in `frontend/src/` (established in Sprint 0).
- **Settings**: The Pydantic settings object defined in `backend/app/core/config.py`, loaded from environment variables.
- **User_Model**: The MongoDB `users` collection document schema and its associated Pydantic schemas (`UserCreate`, `UserLogin`, `UserResponse`, `TokenResponse`), defined in `backend/app/models/user.py`.
- **Security_Module**: The module `backend/app/core/security.py`, responsible for password hashing, password verification, and JWT creation/decoding.
- **User_Service**: The module `backend/app/services/user_service.py`, the sole module permitted to read from or write to the `users` collection.
- **Auth_Service**: The module `backend/app/services/auth_service.py`, implementing the signup, login, refresh-session, and logout business logic.
- **Auth_Middleware**: The module `backend/app/middleware/auth.py`, exposing the `get_current_user` and `get_current_admin` dependencies.
- **Auth_API**: The FastAPI router mounted at `/api/v1/auth`, exposing the Signup_Endpoint, Login_Endpoint, Refresh_Endpoint, Logout_Endpoint, and Me_Endpoint.
- **Signup_Endpoint**: The Auth_API route handler for `POST /api/v1/auth/signup`.
- **Login_Endpoint**: The Auth_API route handler for `POST /api/v1/auth/login`.
- **Refresh_Endpoint**: The Auth_API route handler for `POST /api/v1/auth/refresh`.
- **Logout_Endpoint**: The Auth_API route handler for `POST /api/v1/auth/logout`.
- **Me_Endpoint**: The Auth_API route handler for `GET /api/v1/auth/me`.
- **Access_Token**: A short-lived JWT issued by the Auth_Service that identifies an authenticated User_Model record and is returned in the response body of the Login_Endpoint and the Refresh_Endpoint.
- **Refresh_Token**: A longer-lived JWT issued by the Auth_Service that identifies an authenticated User_Model record, transmitted exclusively via the Refresh_Token_Cookie, and persisted on the corresponding user document.
- **Refresh_Token_Cookie**: The HTTP-only cookie used to transmit the Refresh_Token between the Backend_Application and the Frontend_Application.
- **HTTP_Client**: The configured Axios instance defined in `frontend/src/services/httpClient.js` (established in Sprint 0).
- **Frontend_Auth_Service**: The module `frontend/src/services/authService.js`, wrapping HTTP_Client calls to the Auth_API.
- **Auth_Context**: The React context defined in `frontend/src/context/AuthContext.jsx`, exposing authentication state and actions to the Frontend_Application.
- **LoginPage**: The component `frontend/src/pages/LoginPage.jsx`, a placeholder in Sprint 0 and implemented as a working login form in this spec.
- **SignupPage**: The component `frontend/src/pages/SignupPage.jsx`, a placeholder in Sprint 0 and implemented as a working signup form in this spec.
- **Navbar**: The component `frontend/src/components/Navbar.jsx` (established in Sprint 0), updated in this spec to reflect authentication state.

## Requirements

### Backend Configuration

#### Requirement 1: Authentication Configuration Values

**User Story:** As a developer, I want authentication-related settings loaded from environment variables, so that no secret or environment-specific value is hardcoded in the Backend_Application.

##### Acceptance Criteria

1. THE Settings SHALL load `project_name` as a non-empty string from the `PROJECT_NAME` environment variable.
2. THE Settings SHALL load `api_prefix` as a non-empty string from the `API_PREFIX` environment variable.
3. THE Settings SHALL continue to load `jwt_secret`, `jwt_refresh_secret`, `access_token_expire_minutes`, and `refresh_token_expire_days`, as established in Sprint 0.
4. IF the `PROJECT_NAME` or `API_PREFIX` environment variable is unset, or is set to an empty or whitespace-only string, THEN THE Backend_Application SHALL log an error message that includes the name of each affected variable and SHALL fail to start without serving any request.
5. THE Security_Module and Auth_Service SHALL read `jwt_secret`, `jwt_refresh_secret`, `access_token_expire_minutes`, and `refresh_token_expire_days` exclusively from Settings, and SHALL NOT define the value of `jwt_secret` or `jwt_refresh_secret` as a literal in source code.

### User Model and Schemas

#### Requirement 2: User Document Schema

**User Story:** As a developer, I want a well-defined user document schema, so that user records are stored consistently in MongoDB.

##### Acceptance Criteria

1. THE User_Model SHALL define a persisted document containing the fields `id`, `name`, `email`, `password_hash`, `role`, `is_verified`, `refresh_token`, `created_at`, and `updated_at`, and the `id` field SHALL uniquely identify each persisted document.
2. THE User_Model SHALL treat the `email` field as unique among all persisted user documents, comparing email values case-insensitively (e.g., by normalizing to lowercase before performing the uniqueness comparison).
3. WHEN a new user document is created, THE User_Model SHALL default the `role` field to `"user"`.
4. WHEN a new user document is created, THE User_Model SHALL default the `is_verified` field to `false`, because email verification is not implemented in this sprint.
5. WHEN a new user document is created, THE User_Model SHALL default the `refresh_token` field to a null value until a session is established.
6. THE User_Model SHALL restrict the `role` field to the values `"user"` and `"admin"`.
7. WHEN a new user document is created, THE User_Model SHALL set both the `created_at` and `updated_at` fields to the current timestamp.
8. WHEN an existing user document's persisted fields are modified, THE User_Model SHALL update the `updated_at` field to the current timestamp and SHALL NOT modify the `created_at` field.

#### Requirement 3: Request and Response Schemas

**User Story:** As a developer, I want separate request and response schemas for user data, so that internal fields are never exposed through the API.

##### Acceptance Criteria

1. THE User_Model SHALL define a `UserCreate` schema containing `name` (a string between 1 and 100 characters), `email` (a string that SHALL conform to a valid email address format, maximum 254 characters), and `password` (a string between 8 and 128 characters), used to validate Signup_Endpoint request bodies.
2. THE User_Model SHALL define a `UserLogin` schema containing `email` and `password`, used to validate Login_Endpoint request bodies.
3. THE User_Model SHALL define a `UserResponse` schema containing `id` (a string representation of the persisted document's identifier), `name`, `email`, `role`, and `is_verified`, and this schema SHALL NOT contain a `password_hash` or `refresh_token` field.
4. THE User_Model SHALL define a `TokenResponse` schema containing an `access_token` field and a `token_type` field, and this schema SHALL NOT contain a `refresh_token` field.
5. THE Auth_API SHALL serialize every response that includes user data using `UserResponse`, and SHALL NOT serialize a response using the persisted User_Model document schema directly.
6. IF a Signup_Endpoint request body's `name`, `email`, or `password` field violates the bounds defined in criterion 1, THEN THE User_Model SHALL reject the request body as a `UserCreate` validation failure.

### Security Module

#### Requirement 4: Password Hashing

**User Story:** As a developer, I want passwords hashed with a vetted algorithm, so that plaintext passwords are never persisted.

##### Acceptance Criteria

1. THE Security_Module SHALL provide a function that hashes a plaintext password using bcrypt via passlib.
2. THE Security_Module SHALL provide a function that verifies a plaintext password against a bcrypt password hash, returning a boolean result, and SHALL return false (rather than raising an unhandled exception) when given a malformed or non-bcrypt hash.
3. FOR ALL valid plaintext passwords (UTF-8 strings between 1 and 72 bytes), hashing the password and then verifying the same plaintext password against the resulting hash SHALL succeed (round-trip property).
4. FOR ALL pairs of distinct valid plaintext passwords, verifying the second password against the hash of the first password SHALL fail.
5. THE Security_Module SHALL NOT persist or log a plaintext password at any point during hashing or verification.
6. IF a plaintext password is empty or exceeds 72 bytes when UTF-8 encoded, THEN THE Security_Module's hash function SHALL reject it rather than silently truncating it.

#### Requirement 5: JWT Creation and Decoding

**User Story:** As a developer, I want a single, reusable JWT module, so that access and refresh tokens are created and validated consistently across the Backend_Application.

##### Acceptance Criteria

1. THE Security_Module SHALL provide a function that creates an Access_Token whose JWT payload contains a `sub` claim set to the user's `id`, a `type` claim set to `"access"`, and an `exp` claim set to the current time plus `access_token_expire_minutes` minutes.
2. THE Security_Module SHALL provide a function that creates a Refresh_Token whose JWT payload contains a `sub` claim set to the user's `id`, a `type` claim set to `"refresh"`, and an `exp` claim set to the current time plus `refresh_token_expire_days` days.
3. WHEN the Security_Module's decode function receives a JWT string that has a valid signature, a well-formed structure, and an `exp` claim that does not represent a time in the past, THE Security_Module SHALL return the decoded payload claims.
4. THE Security_Module SHALL provide a function, independent of the decode function described in Criterion 3, that accepts an `exp` claim value from an already-decoded payload and returns a boolean indicating whether that value represents a time in the past relative to the current time, without performing signature verification or signaling a decoding failure.
5. FOR ALL valid payload claim sets and unexpired lifetimes, encoding a JWT and then decoding it SHALL return the original claims unchanged (round-trip property).
6. FOR ALL Access_Tokens created by the Security_Module, decoding the token SHALL yield a `type` claim of `"access"`, and this token SHALL be rejected by any Backend_Application logic that requires a `type` claim of `"refresh"` (token type discrimination).
7. FOR ALL Refresh_Tokens created by the Security_Module, decoding the token SHALL yield a `type` claim of `"refresh"`, and this token SHALL be rejected by any Backend_Application logic that requires a `type` claim of `"access"` (token type discrimination).
8. IF a JWT string passed to the Security_Module's decode function has a valid signature and a well-formed structure but its `exp` claim represents a time in the past, THEN THE Security_Module SHALL signal an expiration failure distinct from a decoding failure, and SHALL NOT return payload claims.
9. IF a JWT string passed to the Security_Module's decode function has an invalid signature or a malformed structure, THEN THE Security_Module SHALL signal a decoding failure distinct from an expiration failure, and SHALL NOT return payload claims.

### User Service

#### Requirement 6: User Persistence Operations

**User Story:** As a developer, I want a single service layer for user persistence, so that no other module accesses the `users` collection directly.

##### Acceptance Criteria

1. THE User_Service SHALL provide a function that finds a user document by `email`, returning the matching document or an indication that no matching document exists.
2. THE User_Service SHALL provide a function that finds a user document by `id`, returning the matching document or an indication that no matching document exists.
3. THE User_Service SHALL provide a function that creates a new user document from validated signup data and returns the created document.
4. IF the underlying persistence operation for creating a new user document fails because a document with the same `email` already exists, THEN THE User_Service SHALL signal a duplicate-email failure distinct from any other persistence failure, and SHALL NOT create a duplicate document.
5. THE User_Service SHALL provide a function that sets or clears the `refresh_token` field of an existing user document identified by `id`, accepting either a token string value or a null value to clear the field, and returns an indication of whether a matching document was found and updated.
6. IF no user document matches the `id` given to the `refresh_token` update function, THEN THE User_Service SHALL signal that no document was updated and SHALL NOT alter any other user document.
7. THE User_Service SHALL provide a function that reports whether a user document with a given `email` already exists.
8. THE Auth_API, Auth_Service, and Auth_Middleware SHALL access user data exclusively through the User_Service, and SHALL NOT issue MongoDB queries directly against the `users` collection.

### Auth Service

#### Requirement 7: Signup Business Logic

**User Story:** As a new user, I want to create an account, so that I can access the platform once it supports feature submissions in later sprints.

##### Acceptance Criteria

1. WHEN the Auth_Service receives valid signup data, THE Auth_Service SHALL use the User_Service to check whether the submitted email already exists.
2. IF the submitted email already exists, THEN THE Auth_Service SHALL signal a User Already Exists failure and SHALL NOT create a new user document.
3. WHEN the submitted email does not already exist, THE Auth_Service SHALL use the Security_Module to hash the submitted password, use the User_Service to create the new user document, and return a UserResponse for the created user.
4. THE Auth_Service SHALL NOT issue an Access_Token or Refresh_Token as part of the signup flow.
5. IF the User_Service's create-user operation signals a duplicate-email failure (per Requirement 6.4) even though the prior existence check in criterion 1 found no match, THEN THE Auth_Service SHALL signal a User Already Exists failure and SHALL NOT treat it as an unexpected error.

#### Requirement 8: Login Business Logic

**User Story:** As a registered user, I want to log in with my email and password, so that I can establish an authenticated session.

##### Acceptance Criteria

1. WHEN the Auth_Service receives login credentials, THE Auth_Service SHALL use the User_Service to find the user document matching the submitted email.
2. IF no user document matches the submitted email, THEN THE Auth_Service SHALL signal an Invalid Credentials failure.
3. IF a user document matches the submitted email but the submitted password does not verify against the stored `password_hash`, THEN THE Auth_Service SHALL signal an Invalid Credentials failure.
4. WHEN the submitted credentials are valid, THE Auth_Service SHALL use the Security_Module to create an Access_Token and a Refresh_Token for the matched user.
5. WHEN the submitted credentials are valid, THE Auth_Service SHALL use the User_Service to persist the created Refresh_Token on the matched user's document before returning a response.
6. WHEN the submitted credentials are valid, THE Auth_Service SHALL return the Access_Token within a TokenResponse and SHALL provide the Refresh_Token for transmission as the Refresh_Token_Cookie.
7. IF the Security_Module fails to create the Access_Token or the Refresh_Token for the matched user, THEN THE Auth_Service SHALL signal a failure indicating that the session could not be established, and SHALL NOT return a TokenResponse or provide a Refresh_Token for transmission as the Refresh_Token_Cookie.
8. IF the User_Service fails to persist the created Refresh_Token on the matched user's document, THEN THE Auth_Service SHALL signal a failure indicating that the session could not be established, and SHALL NOT return the Access_Token within a TokenResponse or provide the Refresh_Token for transmission as the Refresh_Token_Cookie.

#### Requirement 9: Session Refresh Business Logic

**User Story:** As a logged-in user, I want my session refreshed automatically, so that I stay authenticated without re-entering my credentials every 15 minutes.

##### Acceptance Criteria

1. WHEN the Auth_Service receives a session refresh request, THE Auth_Service SHALL decode the Refresh_Token carried in the Refresh_Token_Cookie.
2. IF the Refresh_Token_Cookie is missing, OR the Refresh_Token is malformed, OR the Refresh_Token does not carry a `type` claim of `"refresh"`, THEN THE Auth_Service SHALL signal an Invalid Token failure and SHALL NOT issue a new Access_Token.
3. IF the Refresh_Token's `exp` claim represents a time in the past, THEN THE Auth_Service SHALL signal an Expired Token failure and SHALL NOT issue a new Access_Token.
4. WHEN the Refresh_Token decodes successfully and is unexpired, THE Auth_Service SHALL use the User_Service to find the user identified by the token's `sub` claim.
5. IF no user document matches the token's `sub` claim, THEN THE Auth_Service SHALL signal an Invalid Token failure and SHALL NOT issue a new Access_Token.
6. IF the Refresh_Token does not match the `refresh_token` value currently persisted on the identified user's document, THEN THE Auth_Service SHALL signal an Invalid Token failure and SHALL NOT issue a new Access_Token.
7. WHEN the Refresh_Token matches the persisted value, THE Auth_Service SHALL use the Security_Module to create a new Access_Token and a new Refresh_Token, and SHALL use the User_Service to persist the new Refresh_Token in place of the previous value.
8. WHEN the new Access_Token and Refresh_Token have been created and persisted, THE Auth_Service SHALL return the new Access_Token within a TokenResponse together with the new Refresh_Token for transmission as the Refresh_Token_Cookie.

#### Requirement 10: Logout Business Logic

**User Story:** As a logged-in user, I want to log out, so that my session is terminated on both the client and the server.

##### Acceptance Criteria

1. WHEN the Auth_Service receives a logout request, THE Auth_Service SHALL attempt to decode the Refresh_Token carried in the Refresh_Token_Cookie to identify the requesting user.
2. IF the Refresh_Token_Cookie decodes to a Refresh_Token that identifies an existing user document, THEN THE Auth_Service SHALL use the User_Service to clear the `refresh_token` field of that user's document.
3. IF the Refresh_Token_Cookie is missing, malformed, expired, or does not identify an existing user document, THEN THE Auth_Service SHALL skip the `refresh_token` field update and SHALL NOT signal a failure.
4. WHEN the Auth_Service completes a logout request, regardless of whether a user's `refresh_token` field was updated, THE Auth_Service SHALL provide an instruction to clear the Refresh_Token_Cookie from the client.

### Auth API Routes

#### Requirement 11: Signup Endpoint

**User Story:** As a frontend developer, I want a signup endpoint, so that the Frontend_Application can register new users.

##### Acceptance Criteria

1. THE Signup_Endpoint SHALL accept `POST` requests to `/api/v1/auth/signup` with a `UserCreate` request body.
2. WHEN the Signup_Endpoint receives a valid request and account creation succeeds, THE Signup_Endpoint SHALL respond with HTTP status 201 and a success envelope containing a UserResponse in the `data` field, and SHALL NOT set the Refresh_Token_Cookie or include an Access_Token or Refresh_Token in the response.
3. IF the Signup_Endpoint receives a request with an email that already exists, THEN THE Signup_Endpoint SHALL respond with HTTP status 409 and an error envelope.
4. IF the Signup_Endpoint receives a request body that is missing required fields, has incorrectly typed fields, or otherwise fails `UserCreate` validation, THEN THE Signup_Endpoint SHALL respond with HTTP status 422 and an error envelope.
5. THE Signup_Endpoint SHALL be implemented as an asynchronous FastAPI route handler that delegates account creation to the Auth_Service and contains no direct password hashing, JWT, or database logic.
6. IF account creation fails for a reason other than a duplicate email (an unexpected Auth_Service or User_Service failure), THEN THE Signup_Endpoint SHALL respond with HTTP status 500 and an error envelope, and SHALL NOT respond with HTTP status 201.

#### Requirement 12: Login Endpoint

**User Story:** As a frontend developer, I want a login endpoint, so that the Frontend_Application can authenticate users and establish a session.

##### Acceptance Criteria

1. THE Login_Endpoint SHALL accept `POST` requests to `/api/v1/auth/login` with a `UserLogin` request body.
2. WHEN the Login_Endpoint receives valid credentials, THE Login_Endpoint SHALL respond with HTTP status 200, a success envelope containing a TokenResponse in the `data` field, and SHALL set the Refresh_Token_Cookie on the response.
3. IF the Login_Endpoint receives invalid credentials, THEN THE Login_Endpoint SHALL respond with HTTP status 401 and an error envelope, and SHALL NOT set the Refresh_Token_Cookie.
4. IF the Login_Endpoint receives a request body that fails `UserLogin` validation, THEN THE Login_Endpoint SHALL respond with HTTP status 422 and an error envelope, and SHALL NOT set the Refresh_Token_Cookie.
5. THE Login_Endpoint SHALL be implemented as an asynchronous FastAPI route handler that delegates credential verification and token issuance to the Auth_Service and contains no direct password verification, JWT, or database logic.

#### Requirement 13: Refresh Endpoint

**User Story:** As a frontend developer, I want a refresh endpoint, so that the Frontend_Application can silently renew an authenticated session.

##### Acceptance Criteria

1. THE Refresh_Endpoint SHALL accept `POST` requests to `/api/v1/auth/refresh`, reading the Refresh_Token from the Refresh_Token_Cookie.
2. WHEN the Refresh_Endpoint receives a valid, matching Refresh_Token, THE Refresh_Endpoint SHALL respond with HTTP status 200, a success envelope containing a TokenResponse in the `data` field, and SHALL replace the Refresh_Token_Cookie with the rotated Refresh_Token.
3. IF the Refresh_Token_Cookie is missing, or the Refresh_Token is malformed, has an invalid signature, has an expired `exp` claim, does not carry a `type` claim of `"refresh"`, or does not match the `refresh_token` value currently persisted on the identified user's document, THEN THE Refresh_Endpoint SHALL respond with HTTP status 401 and an error envelope, and SHALL NOT set a new Refresh_Token_Cookie.
4. THE Refresh_Endpoint SHALL be implemented as an asynchronous FastAPI route handler that delegates token validation and rotation to the Auth_Service and contains no direct JWT or database logic.

#### Requirement 14: Logout Endpoint

**User Story:** As a frontend developer, I want a logout endpoint, so that the Frontend_Application can end a user's session on the server.

##### Acceptance Criteria

1. THE Logout_Endpoint SHALL accept `POST` requests to `/api/v1/auth/logout`, reading the Refresh_Token from the Refresh_Token_Cookie when present and forwarding it to the Auth_Service.
2. WHEN the Logout_Endpoint is invoked, regardless of whether the Refresh_Token_Cookie was present, valid, or matched a persisted value, THE Logout_Endpoint SHALL respond with HTTP status 200, a success envelope, and SHALL clear the Refresh_Token_Cookie on the response.
3. THE Logout_Endpoint SHALL be implemented as an asynchronous FastAPI route handler that delegates session termination to the Auth_Service and contains no direct database logic.

### Auth Middleware and Protected Route

#### Requirement 15: Authenticated User Dependency

**User Story:** As a developer, I want a reusable dependency that resolves the current authenticated user, so that any protected route can require authentication consistently.

##### Acceptance Criteria

1. THE Auth_Middleware SHALL provide a `get_current_user` dependency that reads the Access_Token from the `Authorization` request header as a `Bearer` token.
2. WHEN `get_current_user` receives a request with a valid, unexpired Access_Token whose `type` claim is `"access"` and whose `sub` claim identifies an existing user, THE Auth_Middleware SHALL use the User_Service to resolve that user and provide the resolved user to the requesting route handler.
3. IF the `Authorization` header is missing or does not contain a `Bearer` token, THEN THE Auth_Middleware SHALL raise an Unauthorized failure resulting in HTTP status 401 and an error envelope.
4. IF the Access_Token is malformed or has an invalid signature, THEN THE Auth_Middleware SHALL raise an Invalid Token failure resulting in HTTP status 401 and an error envelope.
5. IF the Access_Token is expired, THEN THE Auth_Middleware SHALL raise an Expired Token failure resulting in HTTP status 401 and an error envelope.
6. IF the Access_Token's `type` claim is not `"access"`, THEN THE Auth_Middleware SHALL raise an Invalid Token failure resulting in HTTP status 401 and an error envelope.
7. IF the Access_Token's `sub` claim does not identify an existing user, THEN THE Auth_Middleware SHALL raise an Invalid Token failure resulting in HTTP status 401 and an error envelope, and SHALL NOT provide a user to the requesting route handler.

#### Requirement 16: Authenticated Admin Dependency

**User Story:** As a developer, I want a reusable dependency that restricts a route to administrators, so that future admin-only routes can enforce role checks consistently.

##### Acceptance Criteria

1. THE Auth_Middleware SHALL provide a `get_current_admin` dependency that first resolves the current user by invoking `get_current_user`.
2. IF `get_current_user` raises an Unauthorized, Invalid Token, or Expired Token failure while resolving the current user, THEN THE Auth_Middleware SHALL propagate that failure resulting in the same HTTP status and error envelope defined in Requirement 15, without evaluating the `role` field.
3. IF the resolved user's `role` field is not `"admin"`, THEN THE Auth_Middleware SHALL raise an Unauthorized failure resulting in HTTP status 403 and an error envelope.
4. WHEN the resolved user's `role` field is `"admin"`, THE Auth_Middleware SHALL provide that user to the requesting route handler.

#### Requirement 17: Current User Endpoint

**User Story:** As a frontend developer, I want an endpoint that returns the current authenticated user, so that the Frontend_Application can confirm and display session identity.

##### Acceptance Criteria

1. THE Me_Endpoint SHALL accept `GET` requests to `/api/v1/auth/me`, requiring an authenticated user resolved via the `get_current_user` dependency before executing route logic.
2. WHEN the Me_Endpoint is invoked with a valid Access_Token, THE Me_Endpoint SHALL respond with HTTP status 200 and a success envelope containing the fields `id`, `name`, `email`, `role`, and `is_verified` in the `data` field.
3. IF the `get_current_user` dependency raises a failure because the Access_Token is missing, malformed, has an invalid signature, is expired, or carries a `type` claim other than `"access"`, THEN THE Me_Endpoint SHALL respond with HTTP status 401 and an error envelope.
4. THE Me_Endpoint response SHALL NOT contain a `password_hash` or `refresh_token` field.

### Error Handling

#### Requirement 18: Reusable Authentication Exceptions

**User Story:** As a developer, I want a shared set of authentication exceptions, so that every authentication failure produces a consistent, correctly coded error response.

##### Acceptance Criteria

1. THE Backend_Application SHALL define a reusable Invalid Credentials exception that maps to HTTP status 401.
2. THE Backend_Application SHALL define a reusable User Already Exists exception that maps to HTTP status 409.
3. THE Backend_Application SHALL define a reusable Invalid Token exception that maps to HTTP status 401.
4. THE Backend_Application SHALL define a reusable Expired Token exception that maps to HTTP status 401.
5. THE Backend_Application SHALL define a reusable Unauthorized exception, raised by Auth_Middleware for the missing-or-invalid `Authorization` header failure described in Requirement 15.3 and for the non-administrator role failure described in Requirement 16.2.
6. IF the Unauthorized exception is raised for a missing or invalid `Authorization` header (Requirement 15.3), THEN THE Backend_Application SHALL map it to HTTP status 401.
7. IF the Unauthorized exception is raised because the resolved user's `role` field is not `"admin"` (Requirement 16.2), THEN THE Backend_Application SHALL map it to HTTP status 403.
8. WHEN any of the exceptions defined in criteria 1 through 7 is raised, THE Backend_Application SHALL translate it into the error envelope defined by `error_response()`, using the HTTP status mapped to that exception, and containing a `message` field describing the specific authentication failure and a non-empty `errors` array.
9. THE Auth_Service and Auth_Middleware SHALL raise the exceptions defined in criteria 1 through 5 rather than constructing error envelopes inline.

### Token Storage and Cookie Rules

#### Requirement 19: Token Handling Constraints

**User Story:** As a security-conscious developer, I want strict rules for how tokens are stored and transmitted, so that the authentication system resists common token-theft attacks.

##### Acceptance Criteria

1. THE Backend_Application SHALL issue the Access_Token with an expiration equal to `access_token_expire_minutes` minutes, sourced from Settings (15 minutes by default).
2. THE Backend_Application SHALL issue the Refresh_Token with an expiration equal to `refresh_token_expire_days` days, sourced from Settings (7 days by default).
3. THE Backend_Application SHALL set the Refresh_Token_Cookie with the attributes `httponly=true`, `secure=false`, `samesite=lax`, and `path=/`.
4. WHEN the Refresh_Endpoint or Login_Endpoint issues a Refresh_Token, THE Backend_Application SHALL generate a Refresh_Token value that does not equal any Refresh_Token previously issued to that user.
5. WHEN the Refresh_Endpoint issues a rotated Refresh_Token, THE Backend_Application SHALL cause the immediately preceding Refresh_Token value to no longer be accepted by the Refresh_Endpoint for that user.
6. THE Backend_Application SHALL transmit the Access_Token exclusively within the response body of the Login_Endpoint and the Refresh_Endpoint, and SHALL NOT set the Access_Token as a cookie value.
7. THE Frontend_Application SHALL hold the Access_Token only in the Auth_Context's in-memory state, and SHALL NOT write the Access_Token to `localStorage` or `sessionStorage`.
8. THE Frontend_Application SHALL rely on the browser's automatic cookie transmission for the Refresh_Token, and SHALL NOT read or write the Refresh_Token_Cookie value from JavaScript.

### Frontend Auth Integration

#### Requirement 20: Frontend Auth Service

**User Story:** As a frontend developer, I want a dedicated auth service module, so that all authentication HTTP calls are defined in one reusable place.

##### Acceptance Criteria

1. THE Frontend_Auth_Service SHALL provide a `signup` function that sends the submitted name, email, and password to the Signup_Endpoint using HTTP_Client and returns a Promise that resolves with the UserResponse data contained in the success envelope's `data` field.
2. THE Frontend_Auth_Service SHALL provide a `login` function that sends the submitted email and password to the Login_Endpoint using HTTP_Client and returns a Promise that resolves with the Access_Token value contained in the received TokenResponse's `access_token` field.
3. THE Frontend_Auth_Service SHALL provide a `logout` function that calls the Logout_Endpoint using HTTP_Client and returns a Promise that resolves once the Logout_Endpoint responds successfully.
4. THE Frontend_Auth_Service SHALL provide a `refresh` function that calls the Refresh_Endpoint using HTTP_Client and returns a Promise that resolves with the Access_Token value contained in the received TokenResponse's `access_token` field.
5. THE Frontend_Auth_Service SHALL provide a `getCurrentUser` function that calls the Me_Endpoint using HTTP_Client and returns a Promise that resolves with the UserResponse data contained in the success envelope's `data` field.
6. THE Frontend_Auth_Service SHALL configure HTTP_Client requests to the Auth_API to include credentials, so that the Refresh_Token_Cookie is transmitted and received automatically.
7. IF the Signup_Endpoint, Login_Endpoint, Refresh_Endpoint, Logout_Endpoint, or Me_Endpoint responds with an error status, THEN THE Frontend_Auth_Service SHALL propagate the failure by rejecting the returned Promise with the received error information, without suppressing or transforming the underlying HTTP_Client error.

#### Requirement 21: Auth Context

**User Story:** As a frontend developer, I want a single source of truth for authentication state, so that every page and component can consistently know whether a user is logged in.

##### Acceptance Criteria

1. THE Auth_Context SHALL expose a `user` value, an `isAuthenticated` value, a `loading` value, and the `login`, `logout`, and `signup` functions, where the `signup` function delegates to the Frontend_Auth_Service's `signup` function and SHALL NOT alter `user` or `isAuthenticated`.
2. WHEN the Frontend_Application starts, THE Auth_Context SHALL attempt to establish an existing session by calling the Frontend_Auth_Service's `refresh` function and, only if that call succeeds, subsequently calling the Frontend_Auth_Service's `getCurrentUser` function, updating `user` and `isAuthenticated` based on the outcome.
3. IF the startup session check described in criterion 2 fails, because the `refresh` call fails or the subsequent `getCurrentUser` call fails, THEN THE Auth_Context SHALL set `user` to a null value and set `isAuthenticated` to false.
4. WHILE the startup session check described in criterion 2 is in progress, THE Auth_Context SHALL report `loading` as true.
5. WHEN the startup session check described in criterion 2 completes, whether it succeeds or fails, THE Auth_Context SHALL report `loading` as false.
6. WHEN the Auth_Context's `login` function is called and the underlying Frontend_Auth_Service `login` call succeeds, THE Auth_Context SHALL store the received Access_Token in memory, populate `user` using the Frontend_Auth_Service's `getCurrentUser` function, and set `isAuthenticated` to true.
7. IF the underlying Frontend_Auth_Service `login` call fails, THEN THE Auth_Context SHALL leave `user` as a null value, set `isAuthenticated` to false, and communicate the failure to the caller in a way that allows the caller to detect it and respond.
8. WHEN the Auth_Context's `logout` function is called, THE Auth_Context SHALL clear the in-memory Access_Token, set `user` to a null value, and set `isAuthenticated` to false, regardless of whether the underlying Frontend_Auth_Service `logout` call succeeds or fails.
9. THE Auth_Context SHALL be the only module in the Frontend_Application that stores the Access_Token in memory.

#### Requirement 22: Login Page

**User Story:** As a registered user, I want a working login form, so that I can access my account.

##### Acceptance Criteria

1. THE LoginPage SHALL render input fields for email and password and a submit control.
2. IF a user submits the LoginPage form with an empty email field, an empty password field, or both, THEN THE LoginPage SHALL display a validation message identifying which field(s) are empty and SHALL NOT call the Auth_Context's `login` function.
3. IF a user submits the LoginPage form with a non-empty email value that does not match a valid email format (i.e., does not contain both an "@" character and a domain portion with at least one "." character), THEN THE LoginPage SHALL display a validation message indicating the email format is invalid and SHALL NOT call the Auth_Context's `login` function.
4. WHEN a user submits the LoginPage form with a non-empty password and a non-empty, validly formatted email, THE LoginPage SHALL call the Auth_Context's `login` function with the submitted values.
5. WHILE a form-submission-triggered call to the Auth_Context's `login` function is pending, THE LoginPage SHALL disable the submit control to prevent duplicate submissions, and SHALL re-enable the submit control when the login attempt succeeds or fails.
6. WHEN the Auth_Context's `login` function succeeds, THE LoginPage SHALL display a success Toast_Notifier notification and navigate to HomePage.
7. IF the Auth_Context's `login` function fails, THEN THE LoginPage SHALL display an error Toast_Notifier notification describing the failure and SHALL remain on the LoginPage.
8. THE LoginPage SHALL delegate all credential submission and session handling to the Auth_Context and Frontend_Auth_Service, and SHALL NOT implement password verification or token handling logic directly within the component.

#### Requirement 23: Signup Page

**User Story:** As a prospective user, I want a working signup form, so that I can create an account.

##### Acceptance Criteria

1. THE SignupPage SHALL render input fields for name, email, password, and password confirmation, and a submit control.
2. IF a user submits the SignupPage form with an empty name field, a name exceeding 100 characters, an empty or invalid email format, a password shorter than 8 characters, a password longer than 128 characters, or a password confirmation that does not match the password, THEN THE SignupPage SHALL display a validation message identifying the failing field and SHALL NOT call the Frontend_Auth_Service's `signup` function.
3. WHEN a user submits the SignupPage form with a non-empty name of at most 100 characters, a valid email format, a password between 8 and 128 characters, and a matching password confirmation, THE SignupPage SHALL call the Frontend_Auth_Service's `signup` function with the submitted name, email, and password.
4. WHEN the `signup` function succeeds, THE SignupPage SHALL display a Toast_Notifier notification with the text "Account created successfully. Email verification pending.", SHALL NOT automatically authenticate the created account, and SHALL navigate to LoginPage.
5. IF the `signup` function fails, THEN THE SignupPage SHALL display an error Toast_Notifier notification describing the failure and SHALL remain on the SignupPage.

#### Requirement 24: Navbar Authentication State

**User Story:** As a user, I want the navigation bar to reflect whether I am logged in, so that I can tell my session status and log out easily.

##### Acceptance Criteria

1. WHILE the Auth_Context reports `loading` as false and `isAuthenticated` as false, THE Navbar SHALL display the Login and Signup navigation links established in Sprint 0.
2. WHILE the Auth_Context reports `loading` as false and `isAuthenticated` as true, THE Navbar SHALL display the authenticated user's `name` and a Logout control in place of the Login and Signup navigation links.
3. WHILE the Auth_Context reports `loading` as true, THE Navbar SHALL display neither the Login and Signup navigation links nor the authenticated user's `name` and Logout control.
4. WHEN a user activates the Logout control, THE Navbar SHALL call the Auth_Context's `logout` function.
5. THE Navbar SHALL NOT render a profile dropdown menu in this sprint.

### Environment and Documentation

#### Requirement 25: Environment Variable Updates

**User Story:** As a developer, I want the example environment file updated for this sprint's configuration additions, so that the project remains configurable without exposing real secrets.

##### Acceptance Criteria

1. THE `backend/.env.example` file SHALL continue to contain exactly one `KEY=VALUE` line for each of `MONGODB_URI`, `DATABASE_NAME`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`, and `FRONTEND_URL`, each with a non-empty placeholder value containing at least one non-whitespace character, as established in Sprint 0.
2. THE `backend/.env.example` file SHALL add exactly one `KEY=VALUE` line for each of `PROJECT_NAME` and `API_PREFIX`, each with a non-empty placeholder value containing at least one non-whitespace character.
3. THE `backend/.env.example` file SHALL set `ACCESS_TOKEN_EXPIRE_MINUTES` to `15` and `REFRESH_TOKEN_EXPIRE_DAYS` to `7`.
4. THE Repository_Root's git history SHALL NOT contain a committed `.env` file, and SHALL NOT contain any file assigning `MONGODB_URI`, `DATABASE_NAME`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`, `FRONTEND_URL`, `PROJECT_NAME`, or `API_PREFIX` a value other than the placeholder value present in the current `backend/.env.example` file.

#### Requirement 26: README Authentication Documentation

**User Story:** As a new contributor, I want the README to explain the authentication system, so that I can understand and run the authentication flow without additional guidance.

##### Acceptance Criteria

1. THE README.md file SHALL contain a "Sprint 1A Authentication" section.
2. THE "Sprint 1A Authentication" section SHALL describe the Access_Token and Refresh_Token JWT architecture, stating for each token its `sub`, `type`, and `exp` claims, and stating the Access_Token's 15-minute expiration and the Refresh_Token's 7-day expiration as defined in Requirement 19.
3. THE "Sprint 1A Authentication" section SHALL state the Refresh_Token_Cookie attributes `httponly=true`, `secure=false`, `samesite=lax`, and `path=/`, and SHALL describe the refresh rotation behavior by stating that each successful call to the Refresh_Endpoint or Login_Endpoint replaces the previously issued Refresh_Token with a newly created Refresh_Token.
4. THE "Sprint 1A Authentication" section SHALL list each Auth_API endpoint (Signup_Endpoint, Login_Endpoint, Refresh_Endpoint, Logout_Endpoint, Me_Endpoint) together with its HTTP method and path exactly as defined in Requirements 11 through 14 and 17 (`POST /api/v1/auth/signup`, `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`).
5. THE "Sprint 1A Authentication" section SHALL document the `PROJECT_NAME`, `API_PREFIX`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_EXPIRE_MINUTES`, and `REFRESH_TOKEN_EXPIRE_DAYS` environment variables, stating for each variable a one-sentence description of its purpose.
6. THE README.md file SHALL update its Sprint Status section to indicate that Sprint 1A is completed.

### Cross-Cutting Standards

#### Requirement 27: Backend Coding Standards

**User Story:** As a maintainer, I want the authentication code to follow the project's architectural conventions, so that future sprints can extend it without accumulating inconsistency.

##### Acceptance Criteria

1. THE Auth_API route handlers SHALL be implemented as asynchronous FastAPI functions.
2. THE Auth_API route handlers SHALL contain only request parsing, dependency wiring, invoking Auth_Service/User_Service functions, and formatting the returned result (including applying the Refresh_Token_Cookie instruction) into a response, and SHALL NOT catch Auth_Service or User_Service exceptions to construct error envelopes inline, perform password hashing/verification, construct or decode a JWT, issue direct database queries, or implement business validation beyond Pydantic schema validation.
3. THE Signup_Endpoint and Login_Endpoint SHALL validate request bodies using the `UserCreate` and `UserLogin` Pydantic schemas respectively.
4. THE Backend_Application SHALL define JWT creation and decoding logic exclusively within the Security_Module, and no other Backend_Application source module SHALL construct or decode a JWT independently.

#### Requirement 28: Frontend Coding Standards

**User Story:** As a maintainer, I want the frontend authentication code to follow the project's architectural conventions, so that authentication concerns stay isolated from page rendering.

##### Acceptance Criteria

1. THE LoginPage component SHALL contain form rendering and validation logic only, and SHALL delegate all authentication actions to the Auth_Context's `login` function, as established in Requirement 22.
2. THE SignupPage component SHALL contain form rendering and validation logic only, and SHALL delegate all authentication actions to the Frontend_Auth_Service's `signup` function, as established in Requirement 23.
3. THE LoginPage and SignupPage components SHALL NOT implement password hashing, JWT creation or decoding, or a direct HTTP_Client call to the Auth_API within the component itself.
4. THE Frontend_Application SHALL define Auth_API request logic exclusively within the Frontend_Auth_Service, and no module other than the Frontend_Auth_Service SHALL call HTTP_Client against the Auth_API.
5. THE Frontend_Application SHALL NOT store the Access_Token or Refresh_Token in `localStorage` or `sessionStorage` during the signup, login, session-refresh, logout, or page-reload flows.

## Non-Goals (Out of Scope for This Spec)

The following are explicitly excluded from Sprint 1A and are deferred to later sprints:

- Feature request CRUD (create, read, update, delete of feature requests).
- Voting on feature requests.
- Threaded comments.
- Admin dashboard and content moderation UI.
- Public Kanban roadmap board and status transitions (`under_review` → `planned` → `in_progress` → `completed`).
- Search, filtering, and pagination.
- Password reset and forgot-password flows.
- Real email verification delivery (email verification remains simulated; `is_verified` stays `false` in this sprint).
- A profile dropdown menu or user profile page.
- Deployment configuration and production infrastructure.
