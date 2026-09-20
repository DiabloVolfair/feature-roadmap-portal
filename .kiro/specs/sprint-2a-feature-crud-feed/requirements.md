# Requirements Document

## Introduction

This specification covers Sprint 2A of the Feature Request & Public Roadmap Portal: Feature Request CRUD + Feed. Sprint 0 delivered the scaffolding, and Sprints 1A/1B delivered complete JWT-based authentication, session management, and role/verification-based access control (`get_current_user`, `get_current_admin`, `require_verified_user`, `require_admin`). This sprint introduces the project's first real domain resource — feature requests — on top of that foundation: the persisted `features` collection and its schemas, a `Feature_Service` that owns all persistence and authorization logic for that collection, public and authenticated `Feature_API` routes, a searchable/filterable/sortable/paginated public feed, and the corresponding frontend integration (`Frontend_Feature_Service`, React Query hooks, the Home feed page, a reusable `FeatureCard`, create/edit modals, a delete confirmation dialog, a search bar, filter dropdowns, pagination, and URL-driven feed state).

This spec preserves the Sprint 0/1A/1B architecture exactly: strict layering (routes → services → database), the existing `{success, message, data}` / `{success, message, errors}` response envelope, the `AuthException`-style exception family and single-handler-per-family pattern established in `core/exceptions.py`/`main.py`, the `get_current_user`/`require_verified_user` middleware dependencies, `Auth_Context` as the sole in-memory Access_Token store, and the `HTTP_Client` refresh-and-retry interceptor. None of those mechanisms are redesigned, replaced, or touched beyond what this sprint explicitly adds.

This spec covers feature request CRUD and the public feed only. It does not cover upvoting, threaded comments, the admin Kanban board, the public Roadmap page's real logic, optimistic UI, or drag-and-drop — those are addressed in later sprints (see Non-Goals).

## Glossary

- **Backend_Application**: The FastAPI application located in `backend/app/` (established in Sprint 0, extended in Sprints 1A/1B).
- **Frontend_Application**: The React + Vite single-page application located in `frontend/src/` (established in Sprint 0, extended in Sprints 1A/1B).
- **Feature_Model**: The module `backend/app/models/feature.py`, defining the persisted `features` document shape and its associated Pydantic schemas (`FeatureCreate`, `FeatureUpdate`, `FeatureResponse`, `FeatureFeedResponse`, `PaginatedFeatureResponse`, `PaginationMeta`).
- **Feature_Category**: The enumerated value of a feature request's `category` field, restricted to `ui_ux`, `integrations`, `performance`, `general`.
- **Feature_Status**: The enumerated value of a feature request's `status` field, restricted to `under_review`, `planned`, `in_progress`, `completed`.
- **Feature_Sort**: The enumerated value of the feed's `sort` query parameter, restricted to `newest`, `oldest`, `most_upvoted`, `most_discussed`, `trending`, `relevance`.
- **Feature_Service**: The module `backend/app/services/feature_service.py`, the sole module permitted to read from or write to the `features` collection.
- **Feature_API**: The FastAPI router mounted at `/api/v1/features`, exposing the Create_Feature_Endpoint, Feed_Endpoint, Get_Feature_Endpoint, Update_Feature_Endpoint, and Delete_Feature_Endpoint.
- **Create_Feature_Endpoint**: The Feature_API route handler for `POST /api/v1/features`.
- **Feed_Endpoint**: The Feature_API route handler for `GET /api/v1/features`.
- **Get_Feature_Endpoint**: The Feature_API route handler for `GET /api/v1/features/{feature_id}`.
- **Update_Feature_Endpoint**: The Feature_API route handler for `PATCH /api/v1/features/{feature_id}`.
- **Delete_Feature_Endpoint**: The Feature_API route handler for `DELETE /api/v1/features/{feature_id}`.
- **FeatureNotFoundException**: A reusable Feature-domain exception, mapping to HTTP status 404, raised when no `features` document matches a given `feature_id`.
- **PermissionDeniedException**: A reusable Feature-domain exception, mapping to HTTP status 403, raised when the requesting user is not authorized to modify or delete a specific feature request.
- **Frontend_Feature_Service**: The module `frontend/src/services/featureService.js`, wrapping HTTP_Client calls to the Feature_API.
- **Feature_Hooks**: The module `frontend/src/hooks/useFeatures.js`, exposing `useFeatureFeed`, `useFeature`, `useCreateFeature`, `useUpdateFeature`, and `useDeleteFeature` as React Query hooks wrapping the Frontend_Feature_Service.
- **HomePage**: The component `frontend/src/pages/HomePage.jsx` (a placeholder in Sprint 0/1A/1B), implemented in this spec as the public feature feed.
- **FeatureCard**: The new component `frontend/src/components/FeatureCard.jsx`, rendering a single feed item's summary.
- **FeatureDetailsPage**: The new component `frontend/src/pages/FeatureDetailsPage.jsx`, rendered at `/features/:featureId`, displaying a single feature's full data.
- **CreateFeatureModal**: The new component `frontend/src/components/CreateFeatureModal.jsx`.
- **EditFeatureModal**: The new component `frontend/src/components/EditFeatureModal.jsx`.
- **ConfirmDialog**: The new, reusable component `frontend/src/components/ConfirmDialog.jsx`, parametrized by a title, message, and confirm callback.
- **SearchBar**: The new, reusable component `frontend/src/components/SearchBar.jsx`.
- **FilterDropdown**: The new, reusable component `frontend/src/components/FilterDropdown.jsx`, parametrized by label, options, value, and an `onChange` callback.
- **Pagination**: The new, reusable component `frontend/src/components/Pagination.jsx`.
- **useFeedQueryParams**: The new custom hook `frontend/src/hooks/useFeedQueryParams.js`, wrapping `useSearchParams` to expose typed getters/setters for the feed's `search`, `category`, `status`, `sort`, and `page` URL parameters.
- **useDebouncedValue**: The new custom hook `frontend/src/hooks/useDebouncedValue.js`, returning a debounced copy of a given value after a specified delay.
- **stripMarkdownPreview**: The new pure utility function in `frontend/src/utils/stripMarkdownPreview.js`, converting a markdown string into a plain-text, length-truncated preview.
- **HTTP_Client**, **Auth_Context**, **Frontend_Auth_Service**, **Navbar**, **get_current_user**: Established in Sprint 1A/1B; unchanged in meaning here.

## Requirements

### Feature Model and Schemas

#### Requirement 1: Feature Request Persisted Document Schema

**User Story:** As a developer, I want a well-defined feature request document schema, so that feature request records are stored consistently in MongoDB.

##### Acceptance Criteria

1. THE Feature_Model SHALL define a persisted document containing the fields `id`, `title`, `description_markdown`, `category`, `status`, `author_id`, `author_name`, `vote_count`, `comment_count`, `votes`, `created_at`, and `updated_at`, and the `id` field SHALL uniquely identify each persisted document.
2. WHEN a new feature request document is created, THE Feature_Model SHALL default the `status` field to `"under_review"`.
3. THE Feature_Model SHALL restrict the `status` field to the values `under_review`, `planned`, `in_progress`, and `completed`, matching the workflow documented in PROJECT_SPEC.md.
4. THE Feature_Model SHALL restrict the `category` field to the values `ui_ux`, `integrations`, `performance`, and `general`.
5. WHEN a new feature request document is created, THE Feature_Model SHALL default `vote_count` to `0`, `comment_count` to `0`, and `votes` to an empty array, because voting and commenting are not implemented in this sprint.
6. WHEN a new feature request document is created, THE Feature_Model SHALL set both the `created_at` and `updated_at` fields to the current timestamp.
7. WHEN an existing feature request document's persisted fields are modified, THE Feature_Model SHALL update the `updated_at` field to the current timestamp and SHALL NOT modify the `created_at` field.
8. THE Feature_Model SHALL validate that `title` is a string between 5 and 120 characters (inclusive) and that `description_markdown` is a string of at least 20 characters.
9. THE Feature_Model SHALL enforce a maximum length of 10,000 characters on `description_markdown`, chosen as a reasonable upper bound to prevent abuse in the absence of any maximum stated in PROJECT_SPEC.md, and this maximum SHALL be documented as a deliberate design decision rather than a requirement sourced from PROJECT_SPEC.md.
10. THE Feature_Model SHALL NOT enforce uniqueness of `title` among feature request documents, because PROJECT_SPEC.md does not state a title-uniqueness requirement for feature requests (unlike the documented email-uniqueness requirement for users); repeated identical titles across different feature request documents SHALL be accepted.

#### Requirement 2: Feature Request Request and Response Schemas

**User Story:** As a developer, I want separate request and response schemas for feature request data, so that server-assigned and access-controlled fields are never accepted from a client and internal representations are never leaked through the API.

##### Acceptance Criteria

1. THE Feature_Model SHALL define a `FeatureCreate` schema containing `title`, `description_markdown`, and `category`, and this schema SHALL NOT contain a `status`, `author_id`, or `author_name` field, because those fields are server-assigned.
2. THE Feature_Model SHALL define a `FeatureUpdate` schema containing `title`, `description_markdown`, and `category`, each optional to support partial updates, and this schema SHALL NOT contain a `status` field under any name; omitting `status` from the schema entirely (rather than accepting and silently discarding it) is a deliberate, documented design decision that enforces "clients cannot set status via this endpoint" structurally, mirroring the precedent set by `UserResponse`'s deliberate omission of `password_hash` in Sprint 1A. A future sprint introducing admin status changes SHALL use a separate schema and endpoint rather than adding `status` to `FeatureUpdate`.
3. THE Feature_Model SHALL define a `FeatureResponse` schema containing `id`, `title`, `description_markdown`, `category`, `status`, `author_id`, `author_name`, `vote_count`, `comment_count`, `created_at`, and `updated_at`, and this schema SHALL NOT contain a `votes` field; omitting `votes` (rather than exposing it as an always-empty array) is a deliberate, documented design decision, because no client-observable behavior in this sprint depends on the array's contents and a future voting sprint can add the field to `FeatureResponse` without needing to remove a placeholder first.
4. THE Feature_Model SHALL define a `FeatureFeedResponse` schema with the same fields as `FeatureResponse` (including the full, untruncated `description_markdown`); `FeatureFeedResponse` is intentionally identical in shape to `FeatureResponse` rather than a distinct, lighter-weight shape, because the 160-character description preview shown in the feed is computed client-side from the full `description_markdown` already present in the response (see Requirement 24), which avoids maintaining two different truncation behaviors (server-side and client-side) for the same visual result.
5. THE Feature_Model SHALL define a `PaginationMeta` schema containing `page`, `limit`, `total_items`, `total_pages`, `has_next`, and `has_previous`.
6. THE Feature_Model SHALL define a `PaginatedFeatureResponse` schema containing `items` (a list of `FeatureFeedResponse`) and `pagination` (a `PaginationMeta`).
7. THE Feature_API SHALL serialize every response that includes feature request data using `FeatureResponse`, `FeatureFeedResponse`, or `PaginatedFeatureResponse`, and SHALL NOT serialize a response using the persisted Feature_Model document schema directly.
8. IF a Create_Feature_Endpoint or Update_Feature_Endpoint request body's `title`, `description_markdown`, or `category` field violates the bounds defined in Requirement 1.3, 1.4, 1.8, or 1.9, THEN THE Feature_Model SHALL reject the request body as a `FeatureCreate`/`FeatureUpdate` validation failure.

### MongoDB Indexes

#### Requirement 3: Feature Collection Indexes

**User Story:** As a developer, I want the `features` collection indexed for its query patterns, so that the feed's search, filter, and sort operations perform efficiently as the collection grows.

##### Acceptance Criteria

1. THE Backend_Application SHALL create, during application startup and after the MongoDB connection has been established, a compound text index over the `title` and `description_markdown` fields of the `features` collection, to support the Feed_Endpoint's search capability (Requirement 10); a single collection SHALL NOT have more than one text index, per MongoDB's constraint, so `title` and `description_markdown` SHALL share one combined text index rather than two separate ones.
2. THE Backend_Application SHALL create, during the same startup step, a single-field index on `category`, a single-field index on `status`, a single-field descending index on `created_at`, a single-field descending index on `vote_count`, and a single-field descending index on `comment_count`.
3. THE Backend_Application SHALL perform this index creation in a dedicated startup step invoked from `main.py`'s lifespan after `connect_to_mongo()` succeeds, and SHALL NOT add index or collection creation logic to `backend/app/db/mongodb.py`'s connection lifecycle functions themselves, preserving the constraint established in Sprint 0 (Requirement 8.9) that `connect_to_mongo`/`close_mongo_connection` perform connection management only.
4. THE Backend_Application SHALL implement this index-creation step as a function in `Feature_Service` (e.g. `ensure_indexes()`), because Sprint 2A is the first sprint introducing a real domain collection with query patterns that need indexes, and this is a natural, additive extension of Feature_Service's ownership of the `features` collection rather than a change to any Sprint 0/1A/1B module.
5. THE Backend_Application SHALL rely on the idempotency of Motor's/pymongo's `create_index`/`create_indexes` calls (which no-op when an identical index already exists) so that repeated application restarts SHALL NOT fail or create duplicate indexes.

### Feature Service

#### Requirement 4: Feature Persistence and Business Logic Operations

**User Story:** As a developer, I want a single service layer for feature request persistence and authorization, so that no other module accesses the `features` collection directly and authorization logic is centralized and consistently enforced.

##### Acceptance Criteria

1. THE Feature_Service SHALL provide a function that creates a new feature request document from validated `FeatureCreate` data together with the requesting user's `id` and `name`, and returns the created document.
2. THE Feature_Service SHALL provide a function that finds a feature request document by `id`, returning the matching document or an indication that no matching document exists.
3. THE Feature_Service SHALL provide a function, accepting a `feature_id`, a `FeatureUpdate` payload, and the requesting user, that partially updates only the fields present in the payload, updates `updated_at`, and returns the updated document; the requesting user's identity and role SHALL be supplied to this function so that authorization logic (Requirement 5) is implemented within Feature_Service itself, not in the calling route.
4. THE Feature_Service SHALL provide a function, accepting a `feature_id` and the requesting user, that deletes the matching feature request document; the requesting user's identity and role SHALL be supplied to this function so that authorization logic (Requirement 5) is implemented within Feature_Service itself, not in the calling route.
5. THE Feature_Service SHALL provide a function that returns a page of feature request documents together with pagination metadata, given parsed feed parameters (pagination, category filter, status filter, sort, and search).
6. THE Feature_Service SHALL provide one or more internal helper functions that translate parsed feed parameters into a MongoDB query, sort specification, and projection; the internal decomposition of the feed-retrieval logic into helper functions is an implementation detail left to the implementer, provided the externally observable behavior described in Requirements 7-10 holds.
7. THE Feature_API route handlers SHALL NOT issue MongoDB queries directly against the `features` collection, and SHALL delegate every persistence operation to Feature_Service, restating the architectural rule already established for `User_Service` in Sprint 1A (Requirement 6.8) for this new domain collection.

### Feature CRUD Authorization

#### Requirement 5: Authorization Rules for Feature Mutations

**User Story:** As a platform operator, I want feature request creation, editing, and deletion governed by clear authorization rules, so that users can manage their own submissions while status changes remain an administrative capability reserved for a future sprint.

##### Acceptance Criteria

1. THE Create_Feature_Endpoint SHALL require only an authenticated user, resolved via the `get_current_user` dependency, and SHALL NOT require that user's `is_verified` field to be `true`; this is a deliberate design decision because PROJECT_SPEC.md's RBAC table lists "POST feature" as a User-role capability without stating a verification precondition, and Sprint 1A/1B's stricter `require_verified_user` dependency is reserved for routes where verification is explicitly required.
2. WHEN a user submits an Update_Feature_Endpoint request for a feature request whose `author_id` matches that user's `id`, THE Feature_Service SHALL apply the update.
3. IF a user submits an Update_Feature_Endpoint request for a feature request whose `author_id` does not match that user's `id`, THEN THE Feature_Service SHALL raise a `PermissionDeniedException` and SHALL NOT apply the update.
4. WHEN a user submits a Delete_Feature_Endpoint request for a feature request whose `author_id` matches that user's `id`, OR whose requesting user's `role` field is `"admin"`, THE Feature_Service SHALL delete the feature request document.
5. IF a user submits a Delete_Feature_Endpoint request for a feature request whose `author_id` does not match that user's `id` and whose `role` field is not `"admin"`, THEN THE Feature_Service SHALL raise a `PermissionDeniedException` and SHALL NOT delete the feature request document.
6. THE Feature_Service SHALL enforce that a non-administrator cannot change a feature request's `status` through the Update_Feature_Endpoint structurally, by virtue of `FeatureUpdate` never containing a `status` field (Requirement 2.2), rather than by accepting a `status` value and discarding it at runtime; this structural enforcement SHALL be documented as the chosen mechanism, consistent with this project's established preference (seen in `UserResponse`) for structural guarantees over runtime filtering.
7. IF a Update_Feature_Endpoint or Delete_Feature_Endpoint request targets a `feature_id` that does not match any persisted feature request document, THEN THE Feature_Service SHALL raise a `FeatureNotFoundException` before evaluating authorization.

### Feature API Routes

#### Requirement 6: Feature API Route Definitions

**User Story:** As a frontend developer, I want a versioned Feature_API, so that the Frontend_Application can create, browse, edit, and delete feature requests.

##### Acceptance Criteria

1. THE Feature_API SHALL be implemented in `backend/app/api/v1/features.py` and mounted under the existing `/api/v1` prefix established in Sprint 0, at the path `/api/v1/features`; this deliberately corrects an inconsistency in the sprint's originating brief, which referenced `app/api/features.py` — the Backend_Application's established convention since Sprint 0 is a versioned `app/api/v1/` package, and this sprint follows that existing convention rather than introducing an unversioned module.
2. THE Create_Feature_Endpoint SHALL accept `POST` requests to `/api/v1/features` with a `FeatureCreate` request body, requiring an authenticated user resolved via `get_current_user` (Requirement 5.1).
3. THE Feed_Endpoint SHALL accept `GET` requests to `/api/v1/features` and SHALL NOT require an authenticated session; anonymous access to the feed is a deliberate design decision, because a "public roadmap" is a stated project goal and a feature feed is conceptually public-facing content — PROJECT_SPEC.md's RBAC table listing `GET features` under the "User" role is interpreted as an enumeration of what authenticated users can do, not as a statement that anonymous access is forbidden, and the more permissive, publicly-browsable interpretation is adopted and documented here.
4. THE Get_Feature_Endpoint SHALL accept `GET` requests to `/api/v1/features/{feature_id}` and SHALL NOT require an authenticated session, for the same reason and following the same decision stated in Requirement 6.3.
5. THE Update_Feature_Endpoint SHALL accept `PATCH` requests to `/api/v1/features/{feature_id}` with a `FeatureUpdate` request body, requiring an authenticated user resolved via `get_current_user`; author-only authorization is enforced by Feature_Service (Requirement 5.2, 5.3).
6. THE Delete_Feature_Endpoint SHALL accept `DELETE` requests to `/api/v1/features/{feature_id}`, requiring an authenticated user resolved via `get_current_user`; author-or-admin authorization is enforced by Feature_Service (Requirement 5.4, 5.5).
7. WHEN the Create_Feature_Endpoint receives a valid request and creation succeeds, THE Create_Feature_Endpoint SHALL respond with HTTP status 201 and a success envelope containing a `FeatureResponse` in the `data` field.
8. WHEN the Get_Feature_Endpoint receives a request for an existing `feature_id`, THE Get_Feature_Endpoint SHALL respond with HTTP status 200 and a success envelope containing a `FeatureResponse` in the `data` field.
9. IF the Get_Feature_Endpoint, Update_Feature_Endpoint, or Delete_Feature_Endpoint receives a request for a `feature_id` that does not match any persisted feature request document, THEN THE Feature_API SHALL respond with HTTP status 404 and an error envelope, via the propagated `FeatureNotFoundException`.
10. WHEN the Update_Feature_Endpoint receives a valid request from the feature's author, THE Update_Feature_Endpoint SHALL respond with HTTP status 200 and a success envelope containing the updated `FeatureResponse` in the `data` field.
11. IF the Update_Feature_Endpoint or Delete_Feature_Endpoint receives a request from a user who is not authorized per Requirement 5, THEN THE Feature_API SHALL respond with HTTP status 403 and an error envelope, via the propagated `PermissionDeniedException`.
12. WHEN the Delete_Feature_Endpoint receives a valid, authorized request, THE Delete_Feature_Endpoint SHALL respond with HTTP status 200 and a success envelope.
13. THE Feature_API route handlers SHALL be implemented as asynchronous FastAPI functions that contain only request parsing, dependency wiring, invocation of Feature_Service functions, and response formatting, and SHALL NOT catch Feature_Service exceptions to construct error envelopes inline, perform authorization checks directly, or issue direct database queries, mirroring the constraint already established for `Auth_API` in Sprint 1A (Requirement 27.2).

### Feed API

#### Requirement 7: Feed Query Parameters and Pagination

**User Story:** As a user browsing the public feed, I want to page through feature requests with predictable, bounded page sizes, so that the feed remains responsive and the API is resistant to abuse.

##### Acceptance Criteria

1. THE Feed_Endpoint SHALL accept the query parameters `page` (integer, default `1`), `limit` (integer, default `20`, maximum `100`), `category` (zero or more Feature_Category values), `status` (zero or more Feature_Status values), `sort` (Feature_Sort, default `newest`), and `search` (optional free-text string).
2. IF the Feed_Endpoint receives a `limit` value exceeding `100`, THEN THE Feed_Endpoint SHALL respond with HTTP status 422 and an error envelope, rather than silently clamping the value; a maximum enforced via Pydantic/FastAPI query validation (`le=100`) is the chosen enforcement mechanism, consistent with this sprint's general preference for strict, explicit query-parameter validation over silent normalization (Requirement 8.3).
3. THE Feed_Endpoint SHALL accept `category` and `status` as repeated query parameters (e.g. `?category=ui_ux&category=general`), matching FastAPI's native support for `list[Enum]` query parameters, rather than a comma-separated single value; this decision is made to align with the Frontend_Feature_Service's serialization approach (Requirement 12.4) and is documented as the single, consistent multi-value convention used across this sprint's backend and frontend.
4. THE Feed_Endpoint's success response `data` field SHALL contain a `PaginatedFeatureResponse` whose `pagination` object reports `page`, `limit`, `total_items`, `total_pages`, `has_next`, and `has_previous` computed from the total matching document count and the requested `page`/`limit`.
5. WHEN a Feed_Endpoint request's `page`/`limit` combination selects a page beyond the last available page, THE Feed_Endpoint SHALL respond with HTTP status 200 and an empty `items` list, rather than an error, with `pagination.has_next` reported as `false`.

#### Requirement 8: Feed Sorting

**User Story:** As a user browsing the public feed, I want to sort feature requests by recency, popularity, or discussion volume, so that I can find the feature requests most relevant to me.

##### Acceptance Criteria

1. THE Feed_Endpoint SHALL support the `sort` values `newest` (`created_at` descending), `oldest` (`created_at` ascending), `most_upvoted` (`vote_count` descending), `most_discussed` (`comment_count` descending), `trending`, and `relevance`.
2. WHEN `sort=trending` is requested, THE Feed_Endpoint SHALL order results by `vote_count` descending, then by `created_at` descending as a tiebreaker; this is a deliberate, documented placeholder for Sprint 2A only — it is explicitly not a genuine trending algorithm (which would typically weight recency and velocity together) and a later sprint SHALL be responsible for replacing this placeholder with a real trending computation.
3. THE Feed_Endpoint SHALL validate the `sort` query parameter as an enumerated type at the schema level (a FastAPI/Pydantic `Enum` or `Literal` query parameter); IF the Feed_Endpoint receives a `sort` value outside Requirement 8.1's enumerated list, THEN THE Feed_Endpoint SHALL respond with HTTP status 422 and an error envelope, rather than silently substituting the default `newest` value. This strict-validation approach is chosen over silent fallback because it matches the precedent set by `UserCreate`/`UserLogin`'s strict Pydantic validation in Sprint 1A/1B, and because a client that misspells a `sort` value benefits more from an explicit 422 than from a feed that silently reorders without explanation.
4. WHEN `sort=relevance` is requested together with a non-empty `search` value, THE Feed_Endpoint SHALL order results by the MongoDB `$text` relevance score (`$meta: "textScore"`) descending.
5. WHEN `sort=relevance` is requested without a `search` value, THE Feed_Endpoint SHALL fall back to ordering results by `created_at` descending (the same ordering as `newest`), because no relevance score can be computed without a search term.
6. WHEN a `search` value is provided together with any `sort` value other than `relevance` (including the default `newest`), THE Feed_Endpoint SHALL order results according to the explicitly requested `sort` value and SHALL NOT automatically switch to relevance ordering; a client that wants relevance-ordered search results SHALL request `sort=relevance` explicitly. This "explicit `sort` always wins" behavior is a deliberate design decision favoring predictability: a `search` term filters which documents match, and `sort` alone controls their order, with no implicit interaction between the two parameters.

#### Requirement 9: Feed Filtering

**User Story:** As a user browsing the public feed, I want to filter feature requests by category and status, so that I can narrow the feed to what interests me.

##### Acceptance Criteria

1. WHEN the Feed_Endpoint receives one or more `category` values, THE Feed_Endpoint SHALL return only feature requests whose `category` field matches at least one of the requested values (OR semantics within the `category` filter).
2. WHEN the Feed_Endpoint receives one or more `status` values, THE Feed_Endpoint SHALL return only feature requests whose `status` field matches at least one of the requested values (OR semantics within the `status` filter).
3. WHEN the Feed_Endpoint receives both `category` and `status` values, THE Feed_Endpoint SHALL return only feature requests that satisfy the `category` filter AND satisfy the `status` filter (AND semantics between different filter types).
4. THE Feed_Endpoint SHALL validate `category` and `status` query parameter values as enumerated types at the schema level; IF the Feed_Endpoint receives a `category` or `status` value outside Requirement 1.3/1.4's enumerated list, THEN THE Feed_Endpoint SHALL respond with HTTP status 422 and an error envelope, consistent with the strict-validation decision stated in Requirement 8.3.
5. WHEN the Feed_Endpoint receives no `category` value, THE Feed_Endpoint SHALL NOT filter by category; WHEN the Feed_Endpoint receives no `status` value, THE Feed_Endpoint SHALL NOT filter by status.

#### Requirement 10: Feed Search

**User Story:** As a user browsing the public feed, I want to search feature requests by free text, so that I can find feature requests relevant to a specific topic.

##### Acceptance Criteria

1. WHEN the Feed_Endpoint receives a non-empty `search` value, THE Feed_Endpoint SHALL use MongoDB's `$text` operator against the compound text index over `title` and `description_markdown` (Requirement 3.1) to select matching feature requests.
2. THE Feed_Endpoint's text search SHALL be case-insensitive, relying on MongoDB's native case-insensitive `$text` search behavior for a standard text index, rather than any application-level case-folding logic.
3. THE Feature_Service SHALL NOT implement debouncing for search requests; any request-rate management for search-as-you-type behavior is exclusively a Frontend_Application concern (Requirement 20), and the Feed_Endpoint SHALL execute every search request it receives, whenever it arrives.
4. WHEN the Feed_Endpoint receives an empty or absent `search` value, THE Feed_Endpoint SHALL NOT apply a `$text` filter and SHALL return results based solely on the `category`/`status` filters (if any) and the requested `sort`.

### Error Handling

#### Requirement 11: Reusable Feature Domain Exceptions

**User Story:** As a developer, I want a shared set of feature-domain exceptions, so that every feature-related failure produces a consistent, correctly coded error response without disturbing the existing authentication exception family.

##### Acceptance Criteria

1. THE Backend_Application SHALL define a `FeatureNotFoundException`, mapping to HTTP status 404, raised when Feature_Service cannot locate a feature request document by `id`.
2. THE Backend_Application SHALL define a `PermissionDeniedException`, mapping to HTTP status 403, raised when Feature_Service determines the requesting user is not authorized to perform the requested mutation.
3. THE Backend_Application SHALL define these two exceptions as a new, small exception family in `core/exceptions.py`, following the exact shape already established for `AuthException` (a base class carrying `status_code`, `message`, and `errors`), but SHALL NOT make `FeatureNotFoundException` or `PermissionDeniedException` inherit from `AuthException`; `AuthException` is a domain-specific name tied to authentication failures, and reusing it for feature-domain exceptions (or renaming it) would be a needless naming compromise. A new, equally small base (e.g. `FeatureException`) SHALL be introduced instead, reusing the identical single-exception-handler-per-family wiring pattern already proven in Sprint 1A rather than inheriting from the unrelated family.
4. THE Backend_Application SHALL register exactly one new exception handler in `main.py`, `@app.exception_handler(FeatureException)`, mapping any subclass instance to the existing `error_response()` envelope using `exc.status_code`, `exc.message`, and `exc.errors`, alongside the handlers already registered for `RequestValidationError`, `StarletteHTTPException`, `AuthException`, and the catch-all `Exception` handler; none of the existing handlers SHALL be modified.
5. THE Feature_Service SHALL raise `FeatureNotFoundException` and `PermissionDeniedException` rather than constructing error envelopes inline, and THE Feature_API route handlers SHALL NOT catch these exceptions to build a response themselves (Requirement 6.13).
6. THE Backend_Application SHALL NOT define separate `InvalidCategoryException`/`InvalidStatusException` types, because Requirement 8.3 and Requirement 9.4 establish that category/status/sort validation is fully enforced via Pydantic/FastAPI Enum-typed request/query parameters, which already produce a 422 response through the existing `RequestValidationError` handler; introducing dedicated exceptions for a failure mode already fully covered by schema validation would be dead code, and this decision — along with the reasoning for it — SHALL be documented in design.md rather than left as an open question.

### Frontend Feature Service

#### Requirement 12: Frontend Feature Service

**User Story:** As a frontend developer, I want a dedicated feature service module, so that all feature-related HTTP calls are defined in one reusable place.

##### Acceptance Criteria

1. THE Frontend_Feature_Service SHALL provide a `getFeatures(params)` function that sends a `GET` request to `/api/v1/features` using HTTP_Client and returns a Promise that resolves with the `PaginatedFeatureResponse` data contained in the success envelope's `data` field.
2. THE Frontend_Feature_Service SHALL provide a `getFeature(featureId)` function that sends a `GET` request to `/api/v1/features/{featureId}` using HTTP_Client and returns a Promise that resolves with the `FeatureResponse` data contained in the success envelope's `data` field.
3. THE Frontend_Feature_Service SHALL provide `createFeature(payload)`, `updateFeature(featureId, payload)`, and `deleteFeature(featureId)` functions that send `POST`, `PATCH`, and `DELETE` requests respectively to the corresponding Feature_API routes using HTTP_Client, and return Promises resolving with the response envelope's `data` field.
4. WHEN `getFeatures(params)` receives a `params.category` or `params.status` value that is an array, THE Frontend_Feature_Service SHALL serialize each array into repeated query keys (e.g. `category=ui_ux&category=general`), matching the Feed_Endpoint's expected multi-value convention (Requirement 7.3), rather than a comma-joined single value; this serialization SHALL be implemented explicitly (e.g. via a `URLSearchParams`-based parameter builder or an equivalent explicit serializer function) rather than relying on HTTP_Client's default array-serialization behavior, because that default behavior is not guaranteed to produce the specific repeated-key format the Feed_Endpoint expects.
5. Every Frontend_Feature_Service function SHALL be a thin wrapper containing no `try`/`catch` block, so that a rejected HTTP_Client call rejects the wrapper's returned Promise unchanged, exactly matching the established `Frontend_Auth_Service` convention from Sprint 1A (Requirement 20.7).

### React Query Hooks

#### Requirement 13: Feature React Query Hooks

**User Story:** As a frontend developer, I want React Query hooks wrapping the Frontend_Feature_Service, so that feed data is cached, refetched, and invalidated consistently across the Frontend_Application.

##### Acceptance Criteria

1. THE Feature_Hooks module SHALL provide a `useFeatureFeed(params)` hook wrapping `useQuery`, keyed as `["features", params]`, so that distinct filter/sort/search/page combinations are cached independently.
2. THE Feature_Hooks module SHALL provide a `useFeature(featureId)` hook wrapping `useQuery`, keyed as `["feature", featureId]`.
3. THE Feature_Hooks module SHALL provide `useCreateFeature()`, `useUpdateFeature()`, and `useDeleteFeature()` hooks wrapping `useMutation`.
4. WHEN any of `useCreateFeature()`, `useUpdateFeature()`, or `useDeleteFeature()`'s mutation succeeds, THE Feature_Hooks module SHALL invalidate every query keyed under the `["features"]` prefix, so every cached feed page/filter/sort/search combination is refetched; WHEN `useUpdateFeature()`'s mutation succeeds, THE Feature_Hooks module SHALL additionally invalidate the specific `["feature", featureId]` query key for the updated feature.
5. THE broad `["features"]`-prefix invalidation strategy described in Requirement 13.4, rather than a more surgical per-page/per-filter invalidation, is a deliberate design decision consistent with this sprint's explicit "no optimistic UI" Non-Goal — simple invalidate-and-refetch is the intended pattern for this sprint, and more granular cache management is left for a future sprint if a demonstrated performance need arises.
6. THE Feature_Hooks module SHALL NOT implement optimistic cache updates (e.g. manually writing a mutation's expected result into the React Query cache before the server responds), per this sprint's explicit Non-Goals.

### Home Feed Page

#### Requirement 14: Home Feed Page

**User Story:** As a user, I want the home page to show the public feature feed, so that I can browse existing feature requests without needing to log in.

##### Acceptance Criteria

1. THE HomePage SHALL replace its Sprint 0/1A/1B "Feature feed coming soon" placeholder with a search bar, a sort dropdown, a category filter dropdown, a status filter dropdown, a list/grid of FeatureCard components, pagination controls, a loading skeleton, an empty state, and an error state, arranged in a responsive Tailwind layout consistent with the Frontend_Application's existing styling conventions.
2. THE HomePage SHALL read its initial `search`/`category`/`status`/`sort`/`page` state from the URL via `useFeedQueryParams` (Requirement 23) rather than from component-local default state, so that a page reload preserves the full feed state.
3. WHILE `useFeatureFeed`'s underlying query is loading, THE HomePage SHALL render the loading skeleton described in Requirement 25 in place of the feed list.
4. WHEN `useFeatureFeed`'s underlying query succeeds with zero items, THE HomePage SHALL render the empty state described in Requirement 25.
5. WHEN `useFeatureFeed`'s underlying query fails, THE HomePage SHALL render the error state described in Requirement 25, including a retry control that calls the query's `refetch` function.
6. THE HomePage SHALL render a control that opens the CreateFeatureModal, visible to any authenticated user (per Requirement 5.1), consistent with `useAuth()`'s `isAuthenticated` value.

### Feature Card Component

#### Requirement 15: Feature Card Component

**User Story:** As a user browsing the feed, I want each feature request summarized in a consistent card, so that I can quickly scan the feed's contents.

##### Acceptance Criteria

1. THE FeatureCard component SHALL display a feature request's `title`, a description preview (Requirement 24), a category badge, a status badge, the `author_name`, a formatted `created_at` date, `vote_count` as a static (non-interactive) number, and `comment_count` as a static (non-interactive) number.
2. THE FeatureCard component SHALL NOT render a vote button or any interactive voting control, and SHALL NOT render a comment-thread affordance beyond the static `comment_count` display, per this sprint's explicit Non-Goals.
3. THE FeatureCard component SHALL format `created_at` using `Date.prototype.toLocaleDateString()` (an absolute, locale-formatted date), rather than a relative time format (e.g. "3 days ago"); this decision favors implementation simplicity for this sprint, and a relative-time format MAY be introduced in a later sprint without changing this sprint's data contract.
4. THE FeatureCard component SHALL render a "View Details" control that navigates to `/features/{id}` (FeatureDetailsPage, Requirement 16); building a real, minimal navigation destination this sprint (rather than a visual-only, non-functional button, or a link to a route that renders nothing useful) is a deliberate, documented decision — a control that goes nowhere useful is considered a worse user experience than a small, additional, in-scope page, and this addition does not conflict with any Non-Goal, since the Non-Goals list forbids specific features (voting, threaded comments, admin Kanban, roadmap logic, optimistic UI, drag-and-drop), not a details page.

### Feature Details Page

#### Requirement 16: Feature Details Page

**User Story:** As a user, I want to view a single feature request's full details, so that the FeatureCard's "View Details" control has a real destination.

##### Acceptance Criteria

1. THE FeatureDetailsPage SHALL be rendered at the route `/features/:featureId` and SHALL fetch the feature's data via `useFeature(featureId)`.
2. THE FeatureDetailsPage SHALL display the feature's `title`, `category`, `status`, `author_name`, formatted `created_at`, `vote_count`, `comment_count`, and `description_markdown`.
3. THE FeatureDetailsPage SHALL render `description_markdown` as raw, whitespace-preserving plain text (e.g. within a `<pre>`-like block that preserves line breaks), and SHALL NOT parse or render it through `react-markdown` or any other markdown renderer; full, polished markdown rendering on this page is explicitly deferred to Sprint 2B, and rendering it fully in this sprint would quietly perform Sprint 2B's scoped work ahead of schedule.
4. THE FeatureDetailsPage SHALL NOT render voting controls, a comment thread, or any status-change control, per this sprint's explicit Non-Goals.
5. IF `useFeature(featureId)`'s underlying query fails because no matching feature request exists (a 404 from the Get_Feature_Endpoint), THEN THE FeatureDetailsPage SHALL render a not-found message rather than an unhandled error.

### Create Feature Modal

#### Requirement 17: Create Feature Modal

**User Story:** As an authenticated user, I want to submit a new feature request through a modal form, so that I can contribute an idea to the feed.

##### Acceptance Criteria

1. THE CreateFeatureModal SHALL render input fields for `title`, a plain-text `description_markdown` textarea (accepting markdown source as plain text, with no live preview or rich-text editing in this sprint, because "Full markdown rendering comes in Sprint 2B" and this modal is for input, not rendering), and a `category` select populated with the four Feature_Category values.
2. THE CreateFeatureModal SHALL validate its fields using a pure validator function (e.g. `validateFeatureForm`) colocated with the component and combined with local `useState`, following the established `validateSignupForm`/`validateLoginForm` pattern from Sprint 1A, rather than introducing `react-hook-form` as a new dependency; this choice is made because every existing form in the Frontend_Application (LoginPage, SignupPage, ForgotPasswordPage, ResetPasswordPage) already uses this zero-dependency pattern, and PROJECT_SPEC.md's brief for this modal explicitly allows "React Hook Form or existing validation utilities."
3. IF a user submits the CreateFeatureModal form with a `title` shorter than 5 characters or longer than 120 characters, a `description_markdown` shorter than 20 characters or longer than 10,000 characters, or no `category` selected, THEN THE CreateFeatureModal SHALL display a validation message identifying the failing field and SHALL NOT call `useCreateFeature()`'s mutation.
4. WHEN a user submits the CreateFeatureModal form with a valid `title`, `description_markdown`, and `category`, THE CreateFeatureModal SHALL call `useCreateFeature()`'s mutation with the submitted values.
5. WHEN the create mutation succeeds, THE CreateFeatureModal SHALL display a success Toast notification, close the modal, and rely on Requirement 13.4's query invalidation (rather than a manual refetch call) to refresh the feed.
6. IF the create mutation fails, THEN THE CreateFeatureModal SHALL display an error Toast notification describing the failure and SHALL remain open with the user's entered values intact.

### Edit Feature Modal

#### Requirement 18: Edit Feature Modal

**User Story:** As the author of a feature request, I want to edit my own submission, so that I can correct or improve it after posting.

##### Acceptance Criteria

1. THE EditFeatureModal SHALL be rendered (its trigger control made visible) only when the currently authenticated user's `id` (from `useAuth()`) matches the target feature's `author_id`.
2. WHEN the EditFeatureModal opens, THE EditFeatureModal SHALL prefill its `title`, `description_markdown`, and `category` fields with the target feature's current values.
3. THE EditFeatureModal SHALL validate its fields using the same validator function established for the CreateFeatureModal (Requirement 17.2).
4. WHEN a user submits the EditFeatureModal form with valid values, THE EditFeatureModal SHALL call `useUpdateFeature()`'s mutation with the submitted values via a `PATCH` request.
5. WHEN the update mutation succeeds, THE EditFeatureModal SHALL display a success Toast notification, close the modal, and rely on Requirement 13.4's query invalidation to refresh the feed and the feature's detail view.
6. IF the update mutation fails, THEN THE EditFeatureModal SHALL display an error Toast notification describing the failure and SHALL remain open with the user's entered values intact.

### Delete Confirmation Dialog

#### Requirement 19: Delete Confirmation Dialog

**User Story:** As the author or an administrator, I want to confirm before deleting a feature request, so that a feature request cannot be removed by an accidental click.

##### Acceptance Criteria

1. THE ConfirmDialog component SHALL be implemented as a generic, reusable component parametrized by a title, a message, and an `onConfirm` callback, rather than a feature-specific component, so that it can be reused for other future confirmation flows.
2. THE control that opens a ConfirmDialog for deleting a feature request SHALL be visible (rendered/actionable) only when the currently authenticated user's `id` matches the target feature's `author_id`, OR that user's `role` field is `"admin"`.
3. THE ConfirmDialog, when used for feature deletion, SHALL require an explicit confirmation action (e.g. clicking a "Delete" button within the dialog) before `useDeleteFeature()`'s mutation is called; dismissing the dialog without confirming SHALL NOT call the mutation.
4. WHEN the delete mutation succeeds, THE Frontend_Application SHALL rely on Requirement 13.4's query invalidation to refresh the feed, and SHALL display a success Toast notification.
5. IF the delete mutation fails, THEN THE Frontend_Application SHALL display an error Toast notification describing the failure.

### Search Bar

#### Requirement 20: Search Bar Component

**User Story:** As a user browsing the feed, I want to search feature requests as I type, without flooding the backend with a request per keystroke, so that search feels responsive without being wasteful.

##### Acceptance Criteria

1. THE SearchBar component SHALL be implemented as a reusable component accepting the current search value and an `onSearchChange` callback.
2. THE SearchBar component SHALL debounce its input by 300 milliseconds using the `useDebouncedValue` custom hook, hand-rolled locally (a `useState` + `useEffect` + `setTimeout` implementation) rather than adding a new third-party debounce dependency; this decision follows this project's established preference, observed throughout Sprint 1A/1B, to avoid adding a dependency for functionality this small.
3. WHEN the debounced search value changes, THE SearchBar component SHALL update the `search` URL query parameter via `useFeedQueryParams` (Requirement 23), which in turn changes the `useFeatureFeed` query key and triggers a refetch.
4. THE Backend_Application SHALL NOT implement any debouncing of its own (restated from Requirement 10.3): the Feed_Endpoint executes every request it receives, whenever it arrives, regardless of how quickly the Frontend_Application sends them.

### Filter Dropdowns

#### Requirement 21: Filter Dropdown Components

**User Story:** As a user browsing the feed, I want to filter by category, status, and sort order using dropdowns, so that I can narrow and order the feed to my interests.

##### Acceptance Criteria

1. THE Frontend_Application SHALL implement one generic, reusable `FilterDropdown` component, parametrized by a label, a set of options, the current value, and an `onChange` callback, and SHALL use three instances of it (for category, status, and sort) rather than three bespoke, near-duplicate dropdown components.
2. WHEN a user changes a FilterDropdown's selected value, THE Frontend_Application SHALL update the corresponding URL query parameter (`category`, `status`, or `sort`) via `useFeedQueryParams`.
3. WHEN the Frontend_Application is navigated back to, forward to, or reloaded, THE category, status, and sort filter selections SHALL persist, because they are derived from the URL rather than from component-local state that would reset on remount; this behavior is a direct consequence of Requirement 23's URL synchronization and requires no separate implementation.

### Pagination Component

#### Requirement 22: Pagination Component

**User Story:** As a user browsing the feed, I want Previous/Next pagination controls, so that I can move through the feed's pages.

##### Acceptance Criteria

1. THE Pagination component SHALL be implemented as a reusable component displaying a "Previous" control, the current page number, the total number of pages, and a "Next" control.
2. THE Pagination component SHALL disable its "Previous" control when the current `PaginatedFeatureResponse.pagination.has_previous` value is `false`, and SHALL disable its "Next" control when `pagination.has_next` is `false`, trusting the backend-provided `has_previous`/`has_next` values directly rather than recomputing them client-side from `page`/`total_pages`, to avoid duplicating logic that the backend already provides.
3. WHEN a user activates the "Previous" or "Next" control, THE Pagination component SHALL update the `page` URL query parameter via `useFeedQueryParams`.

### URL State Synchronization

#### Requirement 23: URL State Synchronization

**User Story:** As a user, I want my search, filter, sort, and page selections preserved in the URL, so that reloading the page or sharing a link preserves the feed state I was viewing.

##### Acceptance Criteria

1. THE Frontend_Application SHALL implement a `useFeedQueryParams` custom hook in `frontend/src/hooks/useFeedQueryParams.js`, wrapping `useSearchParams` (from `react-router-dom`) and exposing typed getters and setters for the `search`, `category`, `status`, `sort`, and `page` parameters, so that `HomePage.jsx` does not contain repetitive `searchParams.get(...)`/`setSearchParams(...)` calls scattered through its body.
2. THE `search`, `category`, `status`, `sort`, and `page` values SHALL live exclusively in the URL (via `useFeedQueryParams`), and SHALL NOT be duplicated in component-local state disconnected from the URL.
3. WHEN the Frontend_Application is reloaded, THE HomePage SHALL re-read `search`/`category`/`status`/`sort`/`page` from the URL via `useFeedQueryParams` and initialize `useFeatureFeed`'s parameters from those values, so the full feed state (not just the base feed) survives a reload.

### Markdown Rendering

#### Requirement 24: Description Preview Rendering

**User Story:** As a user browsing the feed, I want each FeatureCard to show a clean, readable preview of a feature request's description, so that markdown syntax characters do not clutter the feed.

##### Acceptance Criteria

1. THE Frontend_Application SHALL add `react-markdown` version `10.1.0` (exact-pinned, matching this project's established exact-pinned-dependency convention already used for `fast-check`) as a new frontend dependency, confirmed compatible with this project's React 18.3.1/Vite 6.0.7 setup (`react-markdown@10.1.0` declares a `react: >=18` peer dependency).
2. THE Frontend_Application SHALL implement a pure utility function, `stripMarkdownPreview(markdown, maxLength)`, in `frontend/src/utils/stripMarkdownPreview.js`, that converts a markdown string into a plain-text approximation (stripping common markdown syntax characters, e.g. `#`, `*`, `_`, `` ` ``, link/image syntax) and then truncates the result to `maxLength` characters.
3. THE FeatureCard component SHALL compute its description preview by calling `stripMarkdownPreview(feature.description_markdown, 160)` on the full `description_markdown` value already present in the `FeatureFeedResponse` (client-side truncation), rather than rendering full markdown and truncating the rendered output, or truncating the raw markdown source before rendering it (which risks unclosed formatting tokens rendering incorrectly); converting to plain text first and truncating that plain-text result avoids both problems and satisfies the "strip excessive markdown formatting for preview" requirement directly.
4. THE FeatureDetailsPage SHALL NOT use `react-markdown` in this sprint (Requirement 16.3); `react-markdown` and `stripMarkdownPreview` together are used exclusively for the feed's card preview in this sprint, and full, unstripped markdown rendering (via `react-markdown`) is explicitly deferred to Sprint 2B.
5. THE CreateFeatureModal and EditFeatureModal SHALL NOT use `react-markdown`, because their `description_markdown` field is a plain-text input field, not a rendering surface (Requirement 17.1).

### Loading, Empty, and Error UX

#### Requirement 25: Feed Loading, Empty, and Error States

**User Story:** As a user browsing the feed, I want clear loading, empty, and error states, so that I understand what the Frontend_Application is doing when the feed has no data or fails to load.

##### Acceptance Criteria

1. WHILE `useFeatureFeed`'s underlying query is loading, THE HomePage SHALL render skeleton placeholder cards in place of the feed list; IF an existing skeleton-loader component already exists in the Frontend_Application's `components/` directory, THEN the HomePage SHALL reuse or extend it rather than introducing a duplicate; otherwise a new, simple skeleton component SHALL be created.
2. WHEN `useFeatureFeed`'s underlying query succeeds with zero items, THE HomePage SHALL render a simple textual empty-state message; no illustration asset is required.
3. WHEN `useFeatureFeed`'s underlying query fails, THE HomePage SHALL render an error state containing a retry control that calls the query's `refetch` function.
4. THE CreateFeatureModal, EditFeatureModal, and ConfirmDialog SHALL display a Sonner Toast notification for both the success and failure outcome of their respective mutations, consistent with the existing Toast usage established in LoginPage/SignupPage/ForgotPasswordPage/ResetPasswordPage.

### README Documentation

#### Requirement 26: README Sprint 2A Documentation

**User Story:** As a new contributor, I want the README to document the Feature CRUD and feed API, so that I can understand and exercise this sprint's backend surface without additional guidance.

##### Acceptance Criteria

1. THE README.md file SHALL contain a "Sprint 2A Feature CRUD + Feed" section, matching the existing Sprint 1A/1B section style and structure.
2. THE "Sprint 2A Feature CRUD + Feed" section SHALL list each Feature_API endpoint together with its HTTP method and path (`POST /api/v1/features`, `GET /api/v1/features`, `GET /api/v1/features/{feature_id}`, `PATCH /api/v1/features/{feature_id}`, `DELETE /api/v1/features/{feature_id}`), and SHALL state each endpoint's authentication requirement.
3. THE "Sprint 2A Feature CRUD + Feed" section SHALL document the Feed_Endpoint's query parameters (`page`, `limit`, `category`, `status`, `sort`, `search`), the `PaginatedFeatureResponse`'s pagination object shape, the six supported `sort` values (including the `trending` placeholder's documented limitation and the `relevance`/`search` interaction rule from Requirement 8.6), and the AND/OR filter-combination semantics from Requirement 9.
4. THE README.md file SHALL update its Sprint Status section to indicate that Sprint 2A is completed.

### Cross-Cutting Standards

#### Requirement 27: Backend Coding Standards

**User Story:** As a maintainer, I want the feature CRUD and feed code to follow the project's established architectural conventions, so that future sprints (voting, comments, admin moderation) can extend it without accumulating inconsistency.

##### Acceptance Criteria

1. THE Feature_API route handlers SHALL be implemented as asynchronous FastAPI functions, following the pattern established by `Auth_API` in Sprint 1A.
2. THE Backend_Application SHALL keep all `features` collection business logic inside Feature_Service; no route handler, middleware, or other service module SHALL issue a MongoDB query directly against the `features` collection.
3. THE Backend_Application SHALL validate every Feature_API request body and query parameter using Pydantic schemas or FastAPI-typed query parameters, and SHALL NOT implement bounds-checking logic (length, enum membership) via manual `if` statements inside a route handler where a schema-level constraint would suffice.
4. THE Backend_Application SHALL preserve the Sprint 0/1A/1B architecture exactly: no change SHALL be made to the existing authentication flows, JWT/cookie mechanics, the `{success, message, data}`/`{success, message, errors}` response envelope shape, the `AuthException` family, or `backend/app/db/mongodb.py`'s connection-lifecycle-only responsibility, beyond the single additive `FeatureException` handler registration in `main.py` (Requirement 11.4) and the additive index-creation startup step (Requirement 3.3).

#### Requirement 28: Frontend Coding Standards

**User Story:** As a maintainer, I want the frontend feature CRUD and feed code to follow the project's established architectural conventions, so that feed/feature concerns stay isolated from page rendering and future sprints can build on a consistent pattern.

##### Acceptance Criteria

1. THE Frontend_Application SHALL define all Feature_API request logic exclusively within `Frontend_Feature_Service`; no component, hook, or page other than `Frontend_Feature_Service` SHALL call `HTTP_Client` against the Feature_API directly.
2. THE Frontend_Application SHALL perform every feature-related data fetch and mutation through the `Feature_Hooks` module's React Query hooks; no component SHALL call `Frontend_Feature_Service` functions directly outside of `Feature_Hooks`, and no component SHALL implement a manual `fetch`/`axios` call in place of a hook.
3. THE Frontend_Application SHALL keep `search`, `category`, `status`, `sort`, and `page` state exclusively in the URL via `useFeedQueryParams`, and SHALL NOT introduce component-local state that duplicates or shadows URL-derived filter state.
4. THE Frontend_Application SHALL implement `SearchBar`, `FilterDropdown`, `Pagination`, `ConfirmDialog`, and `FeatureCard` as reusable components, each accepting its data and callbacks via props rather than being hardcoded to a single call site.
5. THE Frontend_Application SHALL preserve the Sprint 0/1A/1B architecture exactly: no change SHALL be made to the existing `AuthContext`, `HTTP_Client` interceptor logic, `Frontend_Auth_Service`, or any existing authentication page/route-guard component, beyond adding the `/features/:featureId` route and the feed-related additions to `App.jsx`'s route table and `HomePage.jsx`'s body.

## Non-Goals (Out of Scope for This Spec)

The following are explicitly excluded from Sprint 2A and are deferred to later sprints:

- Upvoting feature requests, including the vote button's interactive behavior and any atomic vote-count update logic (Sprint 3).
- Threaded comments, including comment creation, editing, deletion, and nested replies (Sprint 4).
- The admin Kanban board and any admin-driven feature `status` transition UI or endpoint (Sprint 5); this sprint models `status` in the schema and defaults it to `under_review`, but no route or UI in this sprint changes it after creation.
- The public Roadmap page's real logic (grouping/displaying features by status on a Kanban-style board); `RoadmapPage` remains whatever placeholder Sprint 0/1A/1B left it as.
- Optimistic UI updates for any feature mutation (create, update, delete); this sprint uses invalidate-and-refetch exclusively.
- Drag-and-drop interactions of any kind.
- Full, unstripped markdown rendering of a feature's `description_markdown` (via `react-markdown`) anywhere in the Frontend_Application; this sprint uses `react-markdown`-derived plain-text stripping for the feed preview only (Requirement 24) and raw whitespace-preserving text on the details page (Requirement 16.3). Full rendering is Sprint 2B's responsibility.
- A real `trending` sort algorithm; Sprint 2A's `trending` sort is a documented placeholder equivalent to `most_upvoted` with a `created_at` tiebreaker (Requirement 8.2).
- Admin enforcement or UI around feature `status` beyond the structural inability of non-admins to set it via `FeatureUpdate` (Requirement 5.6); a dedicated admin status-change endpoint/UI is deferred to Sprint 5.
- Deployment configuration and production infrastructure changes.

