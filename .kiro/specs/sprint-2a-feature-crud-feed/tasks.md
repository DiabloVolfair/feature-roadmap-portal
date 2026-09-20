# Implementation Plan: Sprint 2A - Feature CRUD + Feed

## Overview

This plan builds the project's first domain resource on top of Sprint 0/1A/1B, following the design's layering: Feature_Model schemas → index-creation/Feature_Service → FeatureException family/main.py wiring → Feature_API routes → backend checkpoint, then the mirrored frontend stack: Frontend_Feature_Service → Feature_Hooks → the small reusable pieces (SearchBar/FilterDropdown/Pagination/ConfirmDialog/useDebouncedValue/useFeedQueryParams/stripMarkdownPreview) → FeatureCard → CreateFeatureModal/EditFeatureModal → HomePage rewrite → FeatureDetailsPage → route wiring in App.jsx → frontend checkpoint, finished by README documentation. Each backend layer is implemented and tested before the layer above it depends on it, mirroring Sprint 1A/1B's approach. No voting, threaded comments, admin Kanban board, real roadmap logic, optimistic UI, or drag-and-drop is included, per the Non-Goals in requirements.md. No existing Sprint 0/1A/1B mechanism (JWT/cookie mechanics, `get_current_user`, the response envelope, the `AuthException` family, `db/mongodb.py`'s connection-lifecycle-only responsibility, `httpClient`'s interceptor, `AuthContext`) is modified beyond the two additive points design.md documents (the `FeatureException` handler registration and the `ensure_indexes()` lifespan call).

## Tasks

- [ ] 1. Implement Feature_Model schemas
  - [x] 1.1 Implement `backend/app/models/feature.py`
    - Define `FeatureCategory`/`FeatureStatus`/`FeatureSort` literal types, `FeatureCreate`, `FeatureUpdate`, `FeatureResponse` (with `from_mongo`), `FeatureFeedResponse`, `PaginationMeta`, and `PaginatedFeatureResponse`; document the persisted `features` document shape as a comment, matching `user.py`'s documentation convention
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_
  - [ ]* 1.2 Write property test for feature field bound validation
    - **Property 1: Feature field bounds are accepted and rejected exactly on their stated limits**
    - **Validates: Requirements 1.8, 1.9, 2.8**
  - [ ]* 1.3 Write unit tests for `FeatureCreate`/`FeatureUpdate`/`FeatureResponse`'s structural field omissions
    - Assert `FeatureCreate`/`FeatureUpdate` have no `status`/`author_id`/`author_name` field, and `FeatureResponse` has no `votes` field
    - _Requirements: 2.1, 2.2, 2.3_

- [ ] 2. Implement Feature_Service persistence, indexing, and authorization
  - [x] 2.1 Implement `backend/app/services/feature_service.py`
    - `ensure_indexes()`, `create_feature`, `find_by_id`, `update_feature` (author-only authorization, not-found check first), `delete_feature` (author-or-admin authorization, not-found check first), `get_feed`, and the private `_build_query`/`_build_sort` helpers
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 7.1, 7.4, 7.5, 8.1, 8.2, 8.4, 8.5, 8.6, 9.1, 9.2, 9.3, 9.5, 10.1, 10.2, 10.3, 10.4_
  - [ ]* 2.2 Write property test for feature creation defaults
    - **Property 2: Creating a feature applies documented defaults and echoes the input**
    - **Validates: Requirements 1.2, 1.5, 1.6, 4.1**
  - [ ]* 2.3 Write property test for partial update field isolation
    - **Property 3: Updating a feature changes only the supplied fields and always bumps `updated_at` without touching `created_at`**
    - **Validates: Requirements 1.7, 4.3**
  - [ ]* 2.4 Write property test for mutation authorization gates
    - **Property 4: Feature mutation authorization gates exactly on their stated conditions**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5**
  - [ ]* 2.5 Write property test for pagination metadata consistency
    - **Property 5: Pagination metadata is internally consistent for every page/limit/total combination**
    - **Validates: Requirements 7.4, 7.5**
  - [ ]* 2.6 Write property test for sort ordering correctness
    - **Property 6: Each of the six sort values orders results as documented**
    - **Validates: Requirements 8.1, 8.2**
  - [ ]* 2.7 Write property test for category/status filter combination semantics
    - **Property 7: Category/status filters combine with OR within a filter type and AND across filter types**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.5**
  - [ ]* 2.8 Write unit tests for `Feature_Service`'s fixed edge cases (mocked/fake Motor collection)
    - `ensure_indexes()` calls `create_index` with the six documented specs; a not-found check precedes the authorization check for both `update_feature` and `delete_feature`; the `sort=relevance` with/without `search` fallback and the explicit-sort-always-wins branch table (four fixed examples)
    - _Requirements: 3.1, 3.2, 3.5, 5.7, 8.4, 8.5, 8.6, 10.4_

- [ ] 3. Implement the FeatureException family and wire it into main.py
  - [x] 3.1 Extend `backend/app/core/exceptions.py`
    - Add `FeatureException` base class (status_code/message/errors, same shape as `AuthException` but not a subclass of it) and its subclasses `FeatureNotFoundException` (404) and `PermissionDeniedException` (403)
    - _Requirements: 11.1, 11.2, 11.3, 11.6_
  - [x] 3.2 Extend `backend/app/main.py`
    - Register a single `@app.exception_handler(FeatureException)` mapping any subclass instance to `error_response()` using `exc.status_code`/`exc.message`/`exc.errors`, alongside the four handlers already registered; add the `feature_service.ensure_indexes()` call to the lifespan, immediately after `connect_to_mongo()` succeeds
    - _Requirements: 3.3, 11.4, 27.4_
  - [ ]* 3.3 Write unit tests for the `FeatureException` handler (extend `backend/tests/test_main.py`)
    - Assert `FeatureNotFoundException`/`PermissionDeniedException` raised from a test route map to 404/403 respectively, via the `error_response()` envelope shape
    - _Requirements: 11.1, 11.2, 11.4_

- [ ] 4. Implement the Feature_API routes and wire the router in
  - [x] 4.1 Implement `backend/app/api/v1/features.py`
    - `create_feature_route` (`POST`, `Depends(get_current_user)`, 201), `feed_route` (`GET`, no auth, `Query()`-typed page/limit/category/status/sort/search), `get_feature_route` (`GET /{feature_id}`, no auth, inline 404 translation), `update_feature_route` (`PATCH`, `Depends(get_current_user)`), `delete_feature_route` (`DELETE`, `Depends(get_current_user)`); no route catches `Feature_Service` exceptions, performs authorization directly, or issues a direct database query
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 6.13, 7.1, 7.2, 7.3, 8.3, 9.4, 27.1, 27.2, 27.3_
  - [x] 4.2 Wire `features.router` into `backend/app/api/v1/__init__.py`
    - Include `features.router` alongside `health.router`, `auth.router`, and `dashboard.router` so every route resolves under `/api/v1/features...`
    - _Requirements: 6.1_
  - [ ]* 4.3 Write integration tests for the Feature_API routes (`backend/tests/test_feature_routes.py`)
    - One test per HTTP-status branch across create/feed/get/update/delete (201, 200, 404, 403, 422, 401), with `Feature_Service`/`get_current_user` mocked or overridden via `app.dependency_overrides`, following `test_dashboard_routes.py`'s pattern; assert `limit=101` and an invalid `category`/`status`/`sort` value each yield 422
    - _Requirements: 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 7.2, 8.3, 9.4_

- [x] 5. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement the Frontend_Feature_Service
  - [x] 6.1 Implement `frontend/src/services/featureService.js`
    - `getFeatures(params)`, `getFeature(featureId)`, `createFeature(payload)`, `updateFeature(featureId, payload)`, `deleteFeature(featureId)`, and the exported `buildFeedParams` helper serializing `category`/`status` arrays into repeated query keys; no `try`/`catch` in any function
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 28.1_
  - [ ]* 6.2 Write property test for feed parameter array serialization
    - **Property 8: Array-valued feed parameters serialize to repeated query keys, never a comma-joined value**
    - **Validates: Requirements 12.4**
  - [ ]* 6.3 Write unit tests for the Frontend_Feature_Service
    - Assert each function calls the correct method/URL/body and resolves with the documented data shape, and that a rejected `httpClient` call rejects the wrapper's promise unchanged
    - _Requirements: 12.1, 12.2, 12.3, 12.5_

- [ ] 7. Implement the Feature_Hooks
  - [x] 7.1 Implement `frontend/src/hooks/useFeatures.js`
    - `useFeatureFeed(params)` (keyed `["features", params]`), `useFeature(featureId)` (keyed `["feature", featureId]`), `useCreateFeature()`, `useUpdateFeature()`, `useDeleteFeature()`; every mutation's `onSuccess` invalidates the `["features"]` prefix, and `useUpdateFeature()` additionally invalidates `["feature", featureId]`; no optimistic cache writes
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 28.2_
  - [ ]* 7.2 Write unit tests for the Feature_Hooks
    - Assert each mutation's `onSuccess` invalidates the documented query key(s), with `featureService` mocked, following `dashboardService.test.js`'s mocking style
    - _Requirements: 13.4, 13.5_

- [ ] 8. Implement useFeedQueryParams
  - [x] 8.1 Implement `frontend/src/hooks/useFeedQueryParams.js`
    - Typed getters (`search`, `category`, `status`, `sort`, `page`) and setters (`setSearch`, `setCategory`, `setStatus`, `setSort`, `setPage`) wrapping `useSearchParams`; every setter except `setPage` resets `page` to `1`
    - _Requirements: 23.1, 23.2, 23.3, 28.3_
  - [ ]* 8.2 Write property test for URL round-tripping
    - **Property 16: `useFeedQueryParams` round-trips every value through the URL**
    - **Validates: Requirements 23.1, 23.2, 23.3**

- [ ] 9. Implement useDebouncedValue
  - [x] 9.1 Implement `frontend/src/hooks/useDebouncedValue.js`
    - Hand-rolled `useState`+`useEffect`+`setTimeout` debounce, no new dependency
    - _Requirements: 20.2_
  - [ ]* 9.2 Write property test for debounce settling behavior
    - **Property 13: `useDebouncedValue` settles to the most recent value after the delay elapses, discarding intermediate values**
    - **Validates: Requirements 20.2, 20.3**

- [ ] 10. Implement stripMarkdownPreview
  - [x] 10.1 Implement `frontend/src/utils/stripMarkdownPreview.js`
    - Pure function stripping common markdown syntax (`#`, `*`, `_`, `` ` ``, link/image syntax) before truncating to `maxLength`
    - _Requirements: 24.2, 24.3_
  - [ ]* 10.2 Write property test for markdown stripping and truncation
    - **Property 17: `stripMarkdownPreview` never exceeds `maxLength` and never contains stripped markdown syntax characters**
    - **Validates: Requirements 24.2, 24.3**

- [ ] 11. Implement SearchBar, FilterDropdown, Pagination, and ConfirmDialog
  - [x] 11.1 Implement `frontend/src/components/SearchBar.jsx`
    - Local draft state debounced 300ms via `useDebouncedValue`; calls `onSearchChange` when the debounced value changes
    - _Requirements: 20.1, 20.2, 20.3, 28.4_
  - [x] 11.2 Implement `frontend/src/components/FilterDropdown.jsx`
    - One generic component parametrized by `label`/`options`/`value`/`onChange`
    - _Requirements: 21.1, 28.4_
  - [x] 11.3 Implement `frontend/src/components/Pagination.jsx`
    - Previous/current-page-of-total/Next controls; disables Previous/Next based directly on `pagination.has_previous`/`has_next`
    - _Requirements: 22.1, 22.2, 22.3, 28.4_
  - [x] 11.4 Implement `frontend/src/components/ConfirmDialog.jsx`
    - Generic reusable component parametrized by `title`/`message`/`onConfirm`; dismissing without confirming never calls `onConfirm`
    - _Requirements: 19.1, 19.3, 28.4_
  - [ ]* 11.5 Write property test for FilterDropdown's per-instance URL param targeting
    - **Property 14: Each FilterDropdown instance updates only its own URL parameter**
    - **Validates: Requirements 21.2**
  - [ ]* 11.6 Write property test for Pagination's disabled-state mirroring
    - **Property 15: Pagination's disabled state mirrors `has_previous`/`has_next` exactly**
    - **Validates: Requirements 22.2**
  - [ ]* 11.7 Write unit tests for SearchBar and ConfirmDialog rendering/interaction
    - `SearchBar` calls `onSearchChange` only after the debounce settles; `ConfirmDialog` calls `onConfirm` only on explicit confirmation and never on cancel/dismiss
    - _Requirements: 19.3, 20.3_

- [x] 12. Checkpoint - Ensure reusable component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Implement FeatureCard
  - [x] 13.1 Implement `frontend/src/components/FeatureCard.jsx`
    - Renders `title`, `stripMarkdownPreview`-derived description preview, category/status badges, `author_name`, `toLocaleDateString()`-formatted `created_at`, static `vote_count`/`comment_count`, a "View Details" link to `/features/{id}`, and author-gated Edit / author-or-admin-gated Delete trigger controls; no vote button, no comment-thread affordance
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 19.2, 28.4_
  - [ ]* 13.2 Write property test for FeatureCard's field rendering completeness
    - **Property 9: FeatureCard renders every documented field for any feature**
    - **Validates: Requirements 15.1**
  - [ ]* 13.3 Write property test for the delete-trigger visibility gate
    - **Property 12: The delete-trigger control's visibility gates exactly on author-or-admin**
    - **Validates: Requirements 19.2**
  - [ ]* 13.4 Write unit test for FeatureCard's "View Details" link target
    - Assert the rendered link's `href`/`to` target is `/features/{id}` for the given feature
    - _Requirements: 15.4_

- [ ] 14. Implement CreateFeatureModal and EditFeatureModal
  - [x] 14.1 Implement the shared `validateFeatureForm` validator and `frontend/src/components/CreateFeatureModal.jsx`
    - `title`/`description_markdown`/`category` fields with local `useState`; validates via `validateFeatureForm` before calling `useCreateFeature().mutate(...)`; success → Toast + close + rely on invalidation; failure → Toast + stay open with entered values
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 24.5, 25.4_
  - [x] 14.2 Implement `frontend/src/components/EditFeatureModal.jsx`
    - Trigger visible only when the current user's id matches the target feature's `author_id`; prefills from the target feature; reuses `validateFeatureForm`; calls `useUpdateFeature().mutate(...)` via `PATCH`; success → Toast + close + rely on invalidation; failure → Toast + stay open with entered values
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 24.5, 25.4_
  - [ ]* 14.3 Write property test for the modals' field-bound validation gate
    - **Property 11: The Create/Edit feature modals call their mutation if and only if every field independently satisfies its bound**
    - **Validates: Requirements 17.3, 17.4, 18.3, 18.4**
  - [ ]* 14.4 Write unit tests for CreateFeatureModal/EditFeatureModal
    - Success Toast + modal close on a successful mutation; error Toast + modal stays open with entered values intact on a failed mutation; `EditFeatureModal`'s prefill from the target feature's current values
    - _Requirements: 17.5, 17.6, 18.2, 18.5, 18.6_

- [ ] 15. Rewrite HomePage as the public feature feed
  - [x] 15.1 Rewrite `frontend/src/pages/HomePage.jsx`
    - Read `search`/`category`/`status`/`sort`/`page` from `useFeedQueryParams()`; render `SearchBar`, three `FilterDropdown` instances, a "New Feature Request" control gated on `useAuth().isAuthenticated` opening `CreateFeatureModal`, a loading-skeleton / empty-state / error-state (with `refetch` retry) / `FeatureCard` list body driven by `useFeatureFeed`, and `Pagination` wired to `setPage`; no component-local default state for feed parameters
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 21.3, 23.2, 25.1, 25.2, 25.3, 28.3_
  - [ ]* 15.2 Write unit tests for HomePage's loading/empty/error/success states
    - One rendering test per state (`useFeatureFeed` mocked); assert the error state's retry control calls `refetch`; assert the create control is gated on `isAuthenticated`
    - _Requirements: 14.3, 14.4, 14.5, 14.6, 25.1, 25.2, 25.3_

- [ ] 16. Implement FeatureDetailsPage
  - [x] 16.1 Implement `frontend/src/pages/FeatureDetailsPage.jsx`
    - Fetches via `useFeature(featureId)`; displays `title`, `category`, `status`, `author_name`, formatted `created_at`, `vote_count`, `comment_count`, and `description_markdown` inside a whitespace-preserving `<pre>`-like block; no `react-markdown`, no voting/comment/status controls; renders a not-found message on a 404
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 24.4_
  - [ ]* 16.2 Write property test for raw markdown rendering fidelity
    - **Property 10: FeatureDetailsPage renders `description_markdown` verbatim, whitespace preserved**
    - **Validates: Requirements 16.2, 16.3**
  - [ ]* 16.3 Write unit test for FeatureDetailsPage's not-found state
    - Assert a 404 from `useFeature` renders the not-found message rather than an unhandled error
    - _Requirements: 16.5_

- [ ] 17. Wire the FeatureDetailsPage route into the application
  - [x] 17.1 Update `frontend/src/App.jsx`
    - Add the `features/:featureId` route inside the existing `Layout`, rendering `FeatureDetailsPage`; leave every existing Sprint 0/1A/1B route unchanged
    - _Requirements: 16.1, 28.5_
  - [ ]* 17.2 Update routing tests for the new route
    - Assert `/features/:featureId` renders `FeatureDetailsPage`'s expected content, mocking `useFeature` as needed
    - _Requirements: 16.1_

- [x] 18. Checkpoint - Ensure all frontend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 19. Add react-markdown dependency
  - [x] 19.1 Add `react-markdown@10.1.0` (exact-pinned) to `frontend/package.json`
    - Confirmed compatible with the project's React 18.3.1/Vite 6.0.7 setup; used exclusively by `stripMarkdownPreview`'s markdown-aware stripping logic where applicable, not for rendering
    - _Requirements: 24.1_

- [ ] 20. Write README Sprint 2A documentation
  - [x] 20.1 Update `README.md`
    - Add a "Sprint 2A Feature CRUD + Feed" section listing each Feature_API endpoint with its method, path, and authentication requirement; document the Feed_Endpoint's query parameters, the `PaginatedFeatureResponse` pagination shape, the six `sort` values (including the `trending` placeholder's documented limitation and the `relevance`/`search` interaction rule), and the AND/OR filter-combination semantics; update the Sprint Status section to mark Sprint 2A completed
    - _Requirements: 26.1, 26.2, 26.3, 26.4_

- [x] 21. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; they cover property tests, unit tests, and integration-style tests only.
- Property tests (1.2, 2.2-2.7, 6.2, 7.2, 8.2, 9.2, 10.2, 11.5, 11.6, 13.2, 13.3, 14.3, 16.2) each validate exactly one Correctness Property from design.md (Properties 1-17) and use Hypothesis (backend, `max_examples=100`) or fast-check (frontend, `numRuns: 100`), matching Sprint 1A/1B's tooling.
- Backend tests use pytest + Hypothesis + FastAPI `TestClient` against a minimal in-memory fake Motor-like collection/db, mirroring `test_token_consumption_properties.py`/`test_password_reset_service.py`'s pattern; frontend tests use Vitest + React Testing Library + fast-check, matching `ProtectedRoute.test.jsx`/`AdminRoute.test.jsx`'s pattern.
- Checkpoints (5, 12, 18, 21) give natural points to validate the backend, the reusable frontend components, the full frontend, and the full stack respectively before moving on.
- No voting, threaded comments, admin Kanban board, real roadmap logic, optimistic UI, or drag-and-drop is included, per the Non-Goals in requirements.md.
- No existing Sprint 0/1A/1B mechanism is modified by any task in this plan, beyond the two additive points design.md documents (the `FeatureException` handler registration and the `ensure_indexes()` lifespan call).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1", "6.1", "8.1", "9.1", "10.1", "11.2", "11.4", "19.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "3.2", "6.2", "6.3", "7.1", "8.2", "9.2", "10.2", "11.1", "11.3"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "3.3", "4.1", "7.2", "11.5", "11.6", "13.1" ] },
    { "id": 3, "tasks": ["2.8", "4.2", "11.7", "13.2", "13.3", "14.1", "14.2", "16.1"] },
    { "id": 4, "tasks": ["4.3", "13.4", "14.3", "15.1", "16.2", "16.3"] },
    { "id": 5, "tasks": ["14.4", "15.2", "17.1"] },
    { "id": 6, "tasks": ["17.2", "20.1"] }
  ]
}
```

Wave rationale: Wave 0 covers setup with no intra-sprint dependencies (the model file, the exception classes, the frontend service, and the four leaf-level frontend primitives that depend on nothing else in this sprint). Waves 1-4 advance services → routes/wiring → components that consume the hooks/services → pages that compose those components, in dependency order, mirroring Sprint 1B's wave shape. Tasks that would otherwise share a wave but write to the same file are kept apart: `feature_service.py`'s six property tests (2.2-2.7) share a wave since they're independent additions to the same test file rather than edits to the same lines, but are placed after `2.1` (the implementation) and before `2.8` (which also touches the same test file, kept in its own later wave to avoid a same-file same-wave conflict with 2.2-2.7); `main.py` is touched by `3.2` (wave 1) and never again; `features.py` by `4.1` (wave 2) then `4.2`'s router registration in `__init__.py` (wave 3, a different file) then `4.3`'s test file (wave 4); `FeatureCard.jsx`'s three tests (13.2, 13.3 in wave 3, 13.4 in wave 4) are split across waves because 13.2/13.3 are independent property-test additions to the same new test file while 13.4 is a separate unit-test addition kept one wave later to avoid a three-way same-file collision; `HomePage.jsx` (15.1) and its test (15.2) are separated by a wave, matching the implementation-then-test ordering used throughout.
