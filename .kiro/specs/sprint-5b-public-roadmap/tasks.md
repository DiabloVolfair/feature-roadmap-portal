# Implementation Plan: Sprint 5B — Public Roadmap

## Overview

Additive sprint. No existing routes, hooks, or components are removed or altered (except the stub `RoadmapPage.jsx` rewrite and the additive FeatureDetailsPage link). Work flows backend → frontend: schema and service first, router second, frontend service and hook third, then UI components, then the page, then integration.

---

## Tasks

- [ ] 1. Add Roadmap schema models to `backend/app/models/feature.py`
  - [ ] 1.1 Define `RoadmapCard` Pydantic model and `RoadmapResponse` model
    - Add `RoadmapCard` class with eight fields (`id`, `title`, `category`, `status`, `vote_count`, `comment_count`, `author_name`, `created_at`) and `from_mongo(doc)` classmethod that maps `doc["_id"]` to `id` as `str(doc["_id"])`
    - Add `RoadmapResponse` model with three `list[RoadmapCard]` fields (`planned`, `in_progress`, `completed`), each defaulting to `[]`
    - Place both classes below `BoardFeatureCard` and `BoardResponse` in the same file; keep them separate types
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 1.2 Write property tests for `RoadmapCard` schema invariants
    - **Property 2: Roadmap Card Omits Admin-Only Fields** — for any valid Mongo document, `RoadmapCard.from_mongo(doc).model_dump()` must not contain `description_markdown`, `votes`, `author_id`, `is_owner`, or `is_admin`
    - **Property 2 (field set)** — `model_dump()` must contain exactly the eight declared keys
    - Also write example test: `RoadmapResponse()` defaults to three empty lists
    - Use `hypothesis` strategies to generate random Mongo-like dicts
    - Tag: `Feature: sprint-5b-public-roadmap, Property 2: Roadmap Card Omits Admin-Only Fields`
    - Minimum 100 iterations
    - _Requirements: 1.1, 1.2, 1.4_

- [ ] 2. Implement `get_public_roadmap()` in `backend/app/services/feature_service.py`
  - [ ] 2.1 Add `get_public_roadmap()` async function
    - Initialize three-key dict `{"planned": [], "in_progress": [], "completed": []}`
    - Query with `_collection().find({}).sort([("vote_count", -1), ("created_at", -1)])`
    - Iterate cursor: append each doc to `board[status]` only when `status in board` (silently skips `"under_review"` and any unknown status)
    - Return the dict — do NOT return a `RoadmapResponse` object
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 2.2 Write property tests for `get_public_roadmap()` filtering and grouping
    - **Property 1: Public Roadmap Excludes Under_Review** — for any collection including `under_review` docs, no such doc appears in any column
    - **Property 3: Roadmap Column Totality** — for any collection where every status is in `{"planned","in_progress","completed"}`, every doc appears in exactly one column
    - Use `hypothesis` + `pytest-asyncio` with mocked Motor cursor (async generator mock)
    - Write example test: result is a `dict` (not `RoadmapResponse`)
    - Tag: `Feature: sprint-5b-public-roadmap, Property 1: Public Roadmap Excludes Under_Review`
    - Tag: `Feature: sprint-5b-public-roadmap, Property 3: Roadmap Column Totality`
    - Minimum 100 iterations per property
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 3. Create `frontend/src/services/roadmapService.js`
  - Export a `roadmapService` object with `getRoadmap()` async function
  - `getRoadmap()` calls `httpClient.get("/api/v1/roadmap")` and returns `data.data`
  - Write example unit test: mock `httpClient.get`; assert called with `"/api/v1/roadmap"` and resolves to `data.data` payload
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 4. Create `backend/app/api/v1/roadmap.py` and update `__init__.py`
  - [ ] 4.1 Create `backend/app/api/v1/roadmap.py`
    - `router = APIRouter(prefix="/roadmap")`
    - `GET ""` route with no auth dependency: calls `feature_service.get_public_roadmap()`, serializes into `RoadmapResponse`, returns `success_response("Roadmap retrieved.", serialized.model_dump())`
    - No inline DB access, no inline auth check, no inline exception handling
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ] 4.2 Update `backend/app/api/v1/__init__.py`
    - Add `from app.api.v1 import roadmap` to imports
    - Add `api_router.include_router(roadmap.router, tags=["roadmap"])`
    - Final path: `/api/v1/roadmap`
    - _Requirements: 2.5_

  - [ ]* 4.3 Write backend integration tests for `GET /api/v1/roadmap`
    - Assert HTTP 200 with no `Authorization` header
    - Assert response envelope has `success=true` and `data` with keys `planned`, `in_progress`, `completed`
    - Assert no `under_review` features appear in any column when test DB contains `under_review` docs
    - Use `pytest` + `httpx` (or FastAPI `TestClient`)
    - _Requirements: 2.1, 2.2, 3.3_

- [ ] 5. Create `frontend/src/hooks/useRoadmap.js`
  - Export named function `useRoadmap()`
  - Calls `useQuery({ queryKey: ["roadmap"], queryFn: roadmapService.getRoadmap })`
  - Write example test: render hook in a React Query test wrapper; assert query key is `["roadmap"]`
  - _Requirements: 5.1, 5.2, 5.3, 15.1, 15.3_

- [ ] 6. Backend checkpoint — Ensure all backend tests pass
  - Run `pytest` in `backend/`; resolve any failures before proceeding
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Create `frontend/src/components/RoadmapFeatureCard.jsx`
  - [ ] 7.1 Implement `RoadmapFeatureCard` component
    - Root element: `<article aria-label={feature.title}>`
    - Render: `feature.title` in `<p>` with `font-medium`
    - Category badge: `categoryBadgeClass(feature.category)` from `badgeColors.js`
    - Status badge: `statusBadgeClass(feature.status)` from `badgeColors.js`
    - Stats line: `▲ {feature.vote_count}` and `💬 {feature.comment_count}`
    - Author/date line: `by {feature.author_name} · {new Date(feature.created_at).toLocaleDateString()}`
    - Link: `<Link to={`/features/${feature.id}`}>View Details →</Link>` using react-router `Link`
    - NO drag handle, NO `useSortable`, NO status-change control
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 13.3_

  - [ ]* 7.2 Write property tests for `RoadmapFeatureCard`
    - **Property 4: Roadmap Card Link Correctness** — for any valid card object, rendered output contains link with `href=/features/{id}`
    - **Property 5: Roadmap Card Renders All Required Fields** — for any valid card object, rendered text contains `title`, `vote_count`, `comment_count`, `author_name`
    - Use `fast-check` + `@testing-library/react`; generate random card-shaped objects
    - Tag: `Feature: sprint-5b-public-roadmap, Property 4: Roadmap Card Link Correctness`
    - Tag: `Feature: sprint-5b-public-roadmap, Property 5: Roadmap Card Renders All Required Fields`
    - Minimum 100 iterations per property
    - _Requirements: 8.1, 8.2_

- [ ] 8. Create `frontend/src/components/RoadmapColumn.jsx`
  - [ ] 8.1 Implement `RoadmapColumn` component
    - Props: `{ status, label, features }`
    - Root element: `<section aria-label={`${label} roadmap column`}>`
    - Header: `<h2>` with label text and `<span>` count badge showing `features.length`
    - Feature list container: `overflow-y-auto max-h-[calc(100vh-16rem)]` applied to wrapper div
    - When `features.length > 0`: render `<RoadmapFeatureCard key={f.id} feature={f} />` for each
    - When `features.length === 0`: render empty state div with dashed border containing "No features yet"
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 13.2_

  - [ ]* 8.2 Write unit tests for `RoadmapColumn`
    - Test: renders "No features yet" when `features=[]`
    - Test: renders correct count badge when features are provided
    - Test: renders correct `aria-label`
    - _Requirements: 7.3, 7.4, 7.6_

- [ ] 9. Create `frontend/src/components/RoadmapHeader.jsx`
  - Props: `{ totalPlanned, totalInProgress, totalCompleted }`
  - Render `<h1>` with "Public Roadmap"
  - Render `<p>` with "Track our feature development progress"
  - Render three stat `<dl>` or `<div>` entries: Planned / In Progress / Completed with their respective count props
  - No hooks, no data fetching — purely presentational
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 10. Rewrite `frontend/src/pages/RoadmapPage.jsx`
  - [ ] 10.1 Implement `RoadmapPage` using `useRoadmap()` and `useQueryClient()`
    - Import `useRoadmap` from `../hooks/useRoadmap`
    - Loading state: render `<div role="status" aria-label="Loading roadmap" className="animate-pulse ...">` ×3 inside a grid (three skeleton columns)
    - Error state: error message paragraph + `<button>` "Retry" that calls `queryClient.invalidateQueries({ queryKey: ["roadmap"] })`
    - Success state:
      - Root: `<main aria-label="Public roadmap">`
      - `<RoadmapHeader totalPlanned={...} totalInProgress={...} totalCompleted={...} />`
      - `<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">` containing `<RoadmapColumn>` ×3
      - Status legend section with three entries using `statusBadgeClass`
    - Use `data.planned`, `data.in_progress`, `data.completed` arrays
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 10.1, 10.2, 10.3, 11.1, 11.2, 11.3, 11.4, 12.1, 12.2, 12.3, 13.1, 13.4, 15.1, 15.2_

  - [ ]* 10.2 Write integration tests for `RoadmapPage`
    - Test: loading state renders three elements with `role="status"` (mock `useRoadmap` with `isLoading=true`)
    - Test: error state renders error text and "Retry" button (mock `useRoadmap` with `isError=true`)
    - Test: success state renders `RoadmapHeader` and three columns (mock with sample data)
    - Test: Retry button calls `invalidateQueries` with `["roadmap"]`
    - _Requirements: 6.2, 6.3, 6.4, 11.1, 11.2, 11.3, 11.4_

- [ ] 11. Add "View on Roadmap →" link to `frontend/src/pages/FeatureDetailsPage.jsx`
  - Add conditional block: when `feature.status !== "under_review"`, render `<Link to="/roadmap" className="text-sm text-indigo-600 hover:underline">View on Roadmap →</Link>` using react-router `Link`
  - Place the link in the breadcrumb/nav area or below the status badges — visually near the StatusTimeline
  - When `feature.status === "under_review"`, render nothing
  - Write example tests: status `"planned"` renders link; status `"under_review"` does not
  - _Requirements: 14.1, 14.2, 14.3_

- [ ] 12. Frontend checkpoint — Ensure all frontend tests pass
  - Run `vitest --run` in `frontend/`; resolve any failures before proceeding
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Final checkpoint — End-to-end smoke test
  - Start the backend dev server and navigate to `/roadmap` in the browser
  - Verify: three columns render; a feature with `status="planned"` appears in Planned column; `under_review` features are absent; each card's "View Details →" link opens the correct feature detail
  - Verify: on a feature detail page with `status="planned"`, "View on Roadmap →" link is visible; on a feature with `status="under_review"` it is absent
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Update README
  - Document the new `GET /api/v1/roadmap` endpoint (public, no auth)
  - Note the new frontend components: `RoadmapPage`, `RoadmapFeatureCard`, `RoadmapColumn`, `RoadmapHeader`
  - Note the new query key `["roadmap"]` in the React Query cache key reference table (if one exists)

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Every task references specific requirements for traceability
- Tasks 6 and 12 are checkpoints — they should block forward progress if tests are failing
- Property tests require minimum 100 iterations; use mocks for Motor async cursors in backend tests
- `fast-check` is the recommended frontend PBT library (already aligned with the project's JS ecosystem)
- The `RoadmapCard` and `BoardFeatureCard` schemas are intentionally kept as separate classes even though they are structurally identical at Sprint 5B — do not merge them

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3"] },
    { "id": 1, "tasks": ["1.2", "2.2", "4.1", "4.2", "5"] },
    { "id": 2, "tasks": ["4.3", "7.1", "8.1", "9"] },
    { "id": 3, "tasks": ["7.2", "8.2", "10.1", "11"] },
    { "id": 4, "tasks": ["10.2"] }
  ]
}
```
