# Requirements Document

## Introduction

Sprint 5B adds a publicly accessible roadmap page to the Feature Roadmap Portal. Any visitor — whether authenticated or not — can view planned, in-progress, and completed features grouped into three labelled columns. The page is read-only, requires no login, and is already reachable via the Navbar's existing "Roadmap" link and `App.jsx` route. The stub `RoadmapPage.jsx` is fully replaced. On the backend a new `GET /api/v1/roadmap` endpoint returns all non-under_review features grouped by status. A lightweight "View on Roadmap →" link is added to `FeatureDetailsPage` for features whose status places them on the roadmap.

---

## Glossary

- **Roadmap_Endpoint**: `GET /api/v1/roadmap` — the new public FastAPI route defined in `backend/app/api/v1/roadmap.py`. Requires no authentication.
- **Roadmap_Service** (`get_public_roadmap`): the new async function added to `feature_service.py` that queries the `features` collection and groups results into three status columns: `planned`, `in_progress`, `completed`.
- **Roadmap_Card**: Pydantic schema (`RoadmapCard`) containing the eight display fields for a single roadmap feature: `id`, `title`, `category`, `status`, `vote_count`, `comment_count`, `author_name`, `created_at`. Defined alongside `BoardFeatureCard` but kept separate so the two schemas can evolve independently.
- **RoadmapResponse**: Pydantic schema with three typed list fields — `planned: list[RoadmapCard]`, `in_progress: list[RoadmapCard]`, `completed: list[RoadmapCard]` — used as the `data` payload of the `Roadmap_Endpoint` success response.
- **Roadmap_Hook** (`useRoadmap`): React Query hook in `frontend/src/hooks/useRoadmap.js` that fetches the roadmap using query key `["roadmap"]`.
- **Frontend_Roadmap_Service** (`roadmapService.getRoadmap`): thin service layer in `frontend/src/services/roadmapService.js` that calls the `Roadmap_Endpoint` via `httpClient` and returns `response.data.data`.
- **Roadmap_Feature_Card** (`RoadmapFeatureCard`): read-only React component in `frontend/src/components/RoadmapFeatureCard.jsx`. Displays one `Roadmap_Card` — no drag handle, no interactive state changes.
- **Roadmap_Column** (`RoadmapColumn`): React component in `frontend/src/components/RoadmapColumn.jsx` that renders a single status column header plus a scrollable list of `Roadmap_Feature_Card` items or an empty state.
- **Roadmap_Header** (`RoadmapHeader`): purely presentational React component in `frontend/src/components/RoadmapHeader.jsx` displaying the page title, description, and per-status counts.
- **Roadmap_Page** (`RoadmapPage`): the rewritten `frontend/src/pages/RoadmapPage.jsx`. Replaces the existing stub. Orchestrates `Roadmap_Hook`, `Roadmap_Header`, and three `Roadmap_Column` instances.
- **Status_Legend**: an inline list within `Roadmap_Page` that pairs each status badge with its label using the existing `statusBadgeClass` utility.
- **Feature_Detail_Link**: the additive "View on Roadmap →" `Link` rendered in `FeatureDetailsPage` when `feature.status !== "under_review"`.

---

## Requirements

### Requirement 1: Roadmap Card Schema

**User Story:** As a backend developer, I want a dedicated `RoadmapCard` schema, so that the public roadmap response is typed and can evolve independently of the admin `BoardFeatureCard`.

#### Acceptance Criteria

1. THE `Roadmap_Card` SHALL expose exactly eight fields: `id` (string), `title` (string), `category` (FeatureCategory), `status` (FeatureStatus), `vote_count` (int), `comment_count` (int), `author_name` (string), `created_at` (datetime).
2. THE `Roadmap_Card` SHALL NOT expose `description_markdown`, `votes`, `author_id`, `is_owner`, or `is_admin`.
3. THE `Roadmap_Card` SHALL provide a `from_mongo(doc)` classmethod that maps `doc["_id"]` to the `id` field as a string and reads the remaining seven fields by name.
4. THE `RoadmapResponse` SHALL declare three fields typed as `list[RoadmapCard]`: `planned`, `in_progress`, `completed`, each defaulting to an empty list.
5. THE `Roadmap_Card` schema SHALL be defined separately from `BoardFeatureCard` even though the two schemas share identical field sets at Sprint 5B.

---

### Requirement 2: Roadmap Endpoint

**User Story:** As a visitor, I want to retrieve the public roadmap via a REST endpoint, so that the frontend can display planned, in-progress, and completed features without requiring authentication.

#### Acceptance Criteria

1. WHEN a `GET /api/v1/roadmap` request is received, THE `Roadmap_Endpoint` SHALL return HTTP 200 with a success envelope whose `data` field contains a `RoadmapResponse`.
2. THE `Roadmap_Endpoint` SHALL NOT require any authentication header or session cookie.
3. WHEN the `Roadmap_Endpoint` is called, THE `Roadmap_Endpoint` SHALL delegate entirely to `get_public_roadmap()` — no inline query, no auth check, no business logic.
4. THE `Roadmap_Endpoint` SHALL serialize each column's documents into `list[RoadmapCard]` using `RoadmapCard.from_mongo(doc)` before returning.
5. THE `Roadmap_Endpoint` SHALL be registered under `prefix="/roadmap"` and included in `api_router` with `tags=["roadmap"]`, yielding final path `/api/v1/roadmap`.
6. IF `get_public_roadmap()` raises a `FeatureException`, THEN THE `Roadmap_Endpoint` SHALL propagate it to `main.py`'s existing `FeatureException` handler without catching it inline.

---

### Requirement 3: Roadmap Service (Backend)

**User Story:** As a backend developer, I want a `get_public_roadmap()` function in `feature_service.py`, so that all data-access logic for the roadmap stays in the service layer.

#### Acceptance Criteria

1. WHEN `get_public_roadmap()` is called, THE `Roadmap_Service` SHALL query the `features` collection with `find({}).sort([("vote_count", -1), ("created_at", -1)])`.
2. THE `Roadmap_Service` SHALL group results into exactly three keys: `{"planned": [], "in_progress": [], "completed": []}`.
3. WHEN a document has `status == "under_review"`, THE `Roadmap_Service` SHALL silently skip that document and not include it in any column.
4. WHEN a document has a `status` value outside the four known statuses, THE `Roadmap_Service` SHALL silently skip that document.
5. THE `Roadmap_Service` SHALL return the three-key dict — it SHALL NOT return a `RoadmapResponse` object (serialization is the router's responsibility).
6. THE `Roadmap_Service` SHALL use `_collection()` to access the `features` collection, consistent with all other functions in `feature_service.py`.

---

### Requirement 4: Frontend Roadmap Service

**User Story:** As a frontend developer, I want a `roadmapService` module, so that HTTP communication with the `Roadmap_Endpoint` is isolated from UI components.

#### Acceptance Criteria

1. THE `Frontend_Roadmap_Service` SHALL export a `getRoadmap()` async function that issues `GET /api/v1/roadmap` via `httpClient`.
2. WHEN `getRoadmap()` receives a successful response, THE `Frontend_Roadmap_Service` SHALL return `response.data.data` — the `RoadmapResponse`-shaped object.
3. THE `Frontend_Roadmap_Service` SHALL NOT pass any `Authorization` header, relying solely on `httpClient`'s existing request interceptor (which attaches a token only when one is present).
4. THE `Frontend_Roadmap_Service` SHALL reside in `frontend/src/services/roadmapService.js`.

---

### Requirement 5: Frontend Roadmap Hook

**User Story:** As a frontend developer, I want a `useRoadmap` React Query hook, so that `RoadmapPage` can consume roadmap data with consistent loading, error, and caching behaviour.

#### Acceptance Criteria

1. THE `Roadmap_Hook` SHALL call `useQuery({ queryKey: ["roadmap"], queryFn: roadmapService.getRoadmap })`.
2. THE `Roadmap_Hook` SHALL reside in `frontend/src/hooks/useRoadmap.js` and export `useRoadmap` as a named export.
3. THE `Roadmap_Hook` SHALL NOT configure a custom `staleTime` or `refetchInterval` — React Query's default cache behaviour applies.

---

### Requirement 6: Roadmap Page

**User Story:** As a visitor, I want a dedicated roadmap page, so that I can browse planned, in-progress, and completed features in one place without logging in.

#### Acceptance Criteria

1. WHEN a visitor navigates to `/roadmap`, THE `Roadmap_Page` SHALL render a `<main>` element with `aria-label="Public roadmap"` as the page landmark.
2. WHEN data is loading, THE `Roadmap_Page` SHALL render three skeleton columns each with `role="status"` and an accessible label indicating loading.
3. WHEN the data fetch fails, THE `Roadmap_Page` SHALL render a visible error message and a "Retry" button that calls `queryClient.invalidateQueries({ queryKey: ["roadmap"] })` when clicked.
4. WHEN data is successfully fetched, THE `Roadmap_Page` SHALL render `Roadmap_Header` followed by the three `Roadmap_Column` instances in a responsive grid.
5. THE `Roadmap_Page` SHALL arrange the three columns using Tailwind classes `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.
6. THE `Roadmap_Page` SHALL render a `Status_Legend` section below the column grid.
7. THE `Roadmap_Page` SHALL NOT require authentication — it SHALL be accessible to unauthenticated visitors without redirect.

---

### Requirement 7: Roadmap Columns

**User Story:** As a visitor, I want to see features organised into clearly labelled status columns, so that I can quickly understand what the team is planning, building, and has completed.

#### Acceptance Criteria

1. THE `Roadmap_Page` SHALL render exactly three `Roadmap_Column` instances with `status`/`label` pairs: `("planned", "Planned")`, `("in_progress", "In Progress")`, `("completed", "Completed")`.
2. WHEN a column's feature list is non-empty, THE `Roadmap_Column` SHALL render a `Roadmap_Feature_Card` for each feature.
3. WHEN a column's feature list is empty, THE `Roadmap_Column` SHALL render an empty-state element with dashed border containing the text "No features yet".
4. THE `Roadmap_Column` SHALL render its column header with the column label and a count badge showing `features.length`.
5. THE `Roadmap_Column` SHALL apply `overflow-y-auto max-h-[calc(100vh-16rem)]` to its feature list container to enable independent column scrolling.
6. THE `Roadmap_Column` SHALL carry `aria-label={`${label} roadmap column`}` on its outermost element.

---

### Requirement 8: Roadmap Feature Card

**User Story:** As a visitor, I want each feature card to show key information and link to the feature detail page, so that I can explore individual features without navigating away from the roadmap.

#### Acceptance Criteria

1. THE `Roadmap_Feature_Card` SHALL display `feature.title`, a category badge, a status badge, `▲ feature.vote_count`, `💬 feature.comment_count`, `feature.author_name`, and a formatted `feature.created_at` date.
2. THE `Roadmap_Feature_Card` SHALL render a `Link` to `/features/${feature.id}` labelled "View Details →".
3. THE `Roadmap_Feature_Card` SHALL obtain category badge classes from `categoryBadgeClass(feature.category)` and status badge classes from `statusBadgeClass(feature.status)` imported from `badgeColors.js`.
4. THE `Roadmap_Feature_Card` SHALL use an `<article>` element with `aria-label={feature.title}` as its root.
5. THE `Roadmap_Feature_Card` SHALL NOT render a drag handle, `useSortable` hook, or any interactive status-change control.

---

### Requirement 9: Roadmap Header

**User Story:** As a visitor, I want a header section at the top of the roadmap page, so that I understand what the page shows and how many features are in each state.

#### Acceptance Criteria

1. THE `Roadmap_Header` SHALL display the heading "Public Roadmap".
2. THE `Roadmap_Header` SHALL display the description text "Track our feature development progress".
3. THE `Roadmap_Header` SHALL display three stat values: `totalPlanned`, `totalInProgress`, `totalCompleted` — each with its corresponding label ("Planned", "In Progress", "Completed").
4. THE `Roadmap_Header` SHALL accept exactly the props `{ totalPlanned, totalInProgress, totalCompleted }` and contain no data-fetching logic.

---

### Requirement 10: Status Legend

**User Story:** As a visitor, I want a colour legend on the roadmap page, so that I understand what each badge colour means at a glance.

#### Acceptance Criteria

1. THE `Roadmap_Page` SHALL render a `Status_Legend` section containing one entry for each of the three roadmap statuses: `planned`, `in_progress`, `completed`.
2. EACH legend entry SHALL display a coloured badge rendered with `statusBadgeClass(status)` alongside the human-readable status label.
3. THE `Status_Legend` SHALL be rendered below the column grid.

---

### Requirement 11: Loading and Error UX

**User Story:** As a visitor, I want clear feedback while the roadmap loads or when it fails, so that I am not left looking at a blank page.

#### Acceptance Criteria

1. WHILE the roadmap data is loading, THE `Roadmap_Page` SHALL render three skeleton placeholder columns, each using `animate-pulse` styling.
2. WHEN the roadmap data fetch fails, THE `Roadmap_Page` SHALL display an error message visible to the user.
3. WHEN the roadmap data fetch fails, THE `Roadmap_Page` SHALL display a "Retry" button that is not disabled.
4. WHEN the "Retry" button is clicked, THE `Roadmap_Page` SHALL call `queryClient.invalidateQueries({ queryKey: ["roadmap"] })` to re-trigger the fetch.

---

### Requirement 12: Responsive Layout

**User Story:** As a visitor on any device, I want the roadmap columns to stack or sit side-by-side depending on screen size, so that the page is usable on both mobile and desktop.

#### Acceptance Criteria

1. THE `Roadmap_Page` SHALL apply `grid-cols-1` for screens below the `sm` breakpoint (< 640 px).
2. THE `Roadmap_Page` SHALL apply `sm:grid-cols-2` for screens at or above the `sm` breakpoint (≥ 640 px).
3. THE `Roadmap_Page` SHALL apply `lg:grid-cols-3` for screens at or above the `lg` breakpoint (≥ 1024 px).

---

### Requirement 13: Accessibility

**User Story:** As a visitor using assistive technology, I want the roadmap page to use semantic HTML and ARIA attributes, so that I can navigate it with a screen reader.

#### Acceptance Criteria

1. THE `Roadmap_Page` SHALL use a `<main>` element with `aria-label="Public roadmap"` as the page landmark.
2. THE `Roadmap_Column` SHALL carry `aria-label={`${label} roadmap column`}` so screen readers can announce each column's purpose.
3. THE `Roadmap_Feature_Card` SHALL use an `<article>` element with `aria-label={feature.title}`.
4. WHILE the roadmap is loading, THE `Roadmap_Page` SHALL render loading skeletons with `role="status"` so screen readers announce the loading state.
5. THE `Roadmap_Feature_Card` SHALL render the "View Details →" `Link` with text that uniquely identifies the destination when combined with its article context.

---

### Requirement 14: Feature Detail Integration

**User Story:** As a visitor reading a feature's detail page, I want a link back to the roadmap when the feature appears there, so that I can navigate between the detail view and the roadmap easily.

#### Acceptance Criteria

1. WHEN `feature.status` is `"planned"`, `"in_progress"`, or `"completed"`, THE `FeatureDetailsPage` SHALL render a `Link` to `/roadmap` labelled "View on Roadmap →".
2. WHEN `feature.status` is `"under_review"`, THE `FeatureDetailsPage` SHALL NOT render the "View on Roadmap →" link.
3. THE `Feature_Detail_Link` SHALL be a `react-router-dom` `Link` component, not an anchor tag.

---

### Requirement 15: Cache Strategy

**User Story:** As a developer, I want the roadmap data to use a consistent React Query key, so that invalidations work predictably across the app.

#### Acceptance Criteria

1. THE `Roadmap_Hook` SHALL use query key `["roadmap"]` — not `["features"]` or `["adminBoard"]`.
2. WHEN the "Retry" button is clicked on the error state, THE `Roadmap_Page` SHALL invalidate queries with key `["roadmap"]` using `queryClient.invalidateQueries`.
3. THE `Roadmap_Hook` SHALL NOT share its query key with any existing hook — the `["roadmap"]` key is reserved for roadmap data exclusively.
