# Requirements Document

## Introduction

Sprint 5A introduces a Kanban-style admin board that allows verified administrators to view all feature requests grouped by status and drag cards between columns to update their status. The feature consists of:

- A backend board endpoint (`GET /admin/features/board`) returning all features grouped by the four status values.
- A backend status-update endpoint (`PATCH /admin/features/{feature_id}/status`) applying a validated status transition.
- A new `admin.py` FastAPI router that mounts under the `/admin` prefix alongside the existing `dashboard.py` router.
- Status-transition validation logic that permits all cross-status moves while rejecting no-op same-to-same transitions.
- Three new admin-domain exception types that subclass `FeatureException` so the existing exception handler in `main.py` translates them without modification.
- A React frontend page (`AdminBoardPage`) protected by the existing `AdminRoute`, rendering four `KanbanColumn` components and `KanbanFeatureCard` items using `@dnd-kit/core` and `@dnd-kit/sortable` for drag-and-drop.
- Optimistic UI updates with rollback on failure, cache synchronization across all relevant React Query keys, board statistics, and full keyboard / screen-reader accessibility.

---

## Glossary

- **Admin_Board_Endpoint**: `GET /api/v1/admin/features/board` — returns all features grouped by status as a `BoardResponse`.
- **Admin_Status_Update_Endpoint**: `PATCH /api/v1/admin/features/{feature_id}/status` — applies a validated status transition and returns the updated `FeatureResponse`.
- **Board_Service**: The two new functions added to `feature_service.py`: `get_board()` and `update_feature_status()`.
- **Board_Hook**: `useAdminBoard()` — the React Query hook that fetches and caches the `BoardResponse` under the `["adminBoard"]` key.
- **Status_Mutation_Hook**: `useUpdateFeatureStatus()` — the React Query mutation hook that optimistically moves a card and issues the `PATCH` request.
- **Board_Card**: `KanbanFeatureCard` — the React component representing a single feature on the board; uses `useSortable` from `@dnd-kit/sortable`.
- **Kanban_Column**: `KanbanColumn` — the React component representing one status column; uses `useDroppable` from `@dnd-kit/core`.
- **Admin_Board_Page**: `AdminBoardPage` — the top-level page component at `path="admin/board"`, protected by `AdminRoute`.
- **validate_status_transition**: Pure Python helper in `feature_service.py` that raises `InvalidStatusTransitionException` when a same-to-same transition is requested.
- **BoardFeatureCard**: Pydantic response schema — lightweight feature representation (no `description_markdown`, no `votes` array) used within `BoardResponse`.
- **BoardResponse**: Pydantic response schema — four lists of `BoardFeatureCard`, one per status column.
- **AdminStatusUpdate**: Pydantic request body schema — carries a single `status: FeatureStatus` field for the status-update endpoint.
- **ALLOWED_TRANSITIONS**: Dict mapping each status string to the set of all other valid status strings; encodes the "all moves except same-to-same are allowed" rule.
- **DndContext**: Root context component from `@dnd-kit/core` that coordinates drag-and-drop sensors and events.
- **DragOverlay**: `@dnd-kit/core` component that renders a floating preview of the dragged `Board_Card` during a drag operation.

---

## Requirements

### Requirement 1: Board Schema

**User Story:** As a backend developer, I want well-typed Pydantic schemas for the board endpoint, so that API consumers receive a predictable, documented response shape.

#### Acceptance Criteria

1. THE `BoardFeatureCard` SHALL expose the fields `id`, `title`, `category`, `status`, `vote_count`, `comment_count`, `author_name`, and `created_at`, serialized from a MongoDB feature document.
2. THE `BoardFeatureCard` SHALL NOT include `description_markdown` or the `votes` array to keep the board payload lightweight.
3. THE `BoardResponse` SHALL contain exactly four fields — `under_review`, `planned`, `in_progress`, and `completed` — each typed as a list of `BoardFeatureCard`.
4. THE `AdminStatusUpdate` SHALL contain a single field `status` of type `FeatureStatus`, rejecting any value outside the four valid status strings at the Pydantic validation layer.
5. WHEN a MongoDB document is serialized into a `BoardFeatureCard`, THE `BoardFeatureCard` SHALL convert the `_id` ObjectId to the string field `id`.

---

### Requirement 2: Board Endpoint

**User Story:** As an admin, I want to retrieve all feature requests grouped by status in a single API call, so that the frontend board can render without issuing multiple requests.

#### Acceptance Criteria

1. THE `Admin_Board_Endpoint` SHALL require authentication and `role == "admin"` AND `is_verified == true`, enforced by the existing `require_admin` dependency.
2. WHEN a valid admin calls `GET /admin/features/board`, THE `Admin_Board_Endpoint` SHALL return HTTP 200 with a success envelope whose `data` field contains a `BoardResponse`.
3. THE `Admin_Board_Endpoint` SHALL return all features across all status values — no pagination, no filtering.
4. WHEN the features collection is empty, THE `Admin_Board_Endpoint` SHALL return a `BoardResponse` with all four lists empty rather than an error.
5. THE `Admin_Board_Endpoint` SHALL sort features within each column by `vote_count` descending, then `created_at` descending as a deterministic tiebreaker.
6. WHEN a non-admin authenticated user calls `GET /admin/features/board`, THE `Admin_Board_Endpoint` SHALL return HTTP 403.
7. WHEN an unauthenticated caller calls `GET /admin/features/board`, THE `Admin_Board_Endpoint` SHALL return HTTP 401.

---

### Requirement 3: Status Update Endpoint

**User Story:** As an admin, I want to change the status of any feature request, so that I can move items through the development lifecycle.

#### Acceptance Criteria

1. THE `Admin_Status_Update_Endpoint` SHALL require the same `require_admin` dependency as the board endpoint.
2. WHEN a valid admin calls `PATCH /admin/features/{feature_id}/status` with a valid body, THE `Admin_Status_Update_Endpoint` SHALL return HTTP 200 with a success envelope whose `data` field is a `FeatureResponse` reflecting the new status.
3. WHEN the `feature_id` path parameter does not identify an existing feature, THE `Admin_Status_Update_Endpoint` SHALL return HTTP 404 with an error envelope.
4. WHEN the requested status equals the feature's current status, THE `Admin_Status_Update_Endpoint` SHALL return HTTP 400 with an error envelope describing the no-op transition.
5. WHEN the request body contains an invalid status string, THE `Admin_Status_Update_Endpoint` SHALL return HTTP 422 via Pydantic validation, not a custom exception.
6. WHEN the atomic database update returns no document, THE `Admin_Status_Update_Endpoint` SHALL return HTTP 500 with an error envelope.
7. WHEN a non-admin calls `PATCH /admin/features/{feature_id}/status`, THE `Admin_Status_Update_Endpoint` SHALL return HTTP 403.

---

### Requirement 4: Status Transition Validation

**User Story:** As a backend developer, I want a pure, testable transition-validation function, so that invalid no-op transitions are caught before any database write.

#### Acceptance Criteria

1. THE `validate_status_transition` function SHALL accept `current_status: str` and `requested_status: str` parameters.
2. WHEN `requested_status` equals `current_status`, THE `validate_status_transition` function SHALL raise `InvalidStatusTransitionException`.
3. WHEN `requested_status` differs from `current_status` and is a member of the valid status set, THE `validate_status_transition` function SHALL return without raising any exception.
4. THE `ALLOWED_TRANSITIONS` dict SHALL map each of the four status strings to the set of the three remaining status strings.
5. THE `validate_status_transition` function SHALL be a pure function with no side effects and no database access.

---

### Requirement 5: Admin Exceptions

**User Story:** As a backend developer, I want domain-specific admin exceptions that integrate with the existing single `FeatureException` handler, so that no new exception handler registration is required in `main.py`.

#### Acceptance Criteria

1. THE `InvalidStatusTransitionException` SHALL subclass `FeatureException` and carry HTTP status code 400.
2. THE `AdminPermissionException` SHALL subclass `FeatureException` and carry HTTP status code 403.
3. THE `StatusUpdateFailedException` SHALL subclass `FeatureException` and carry HTTP status code 500.
4. WHEN any of these three exceptions is raised inside a request, THE existing `FeatureException` handler in `main.py` SHALL translate it to the standard error envelope without any additional handler registration.
5. THE `exceptions.py` module SHALL NOT register new `@app.exception_handler` decorators for admin exception types.

---

### Requirement 6: Board Service Extension

**User Story:** As a backend developer, I want `feature_service.py` extended with `get_board()` and `update_feature_status()`, so that all features-collection access remains in one module.

#### Acceptance Criteria

1. THE `get_board` function SHALL fetch all documents from the `features` collection in a single query sorted by `[("vote_count", -1), ("created_at", -1)]`.
2. THE `get_board` function SHALL group fetched documents into a dict with keys `"under_review"`, `"planned"`, `"in_progress"`, and `"completed"`, each mapping to a list.
3. WHEN a feature document has a status not in the four known values, THE `get_board` function SHALL silently omit that document from the grouped result.
4. THE `update_feature_status` function SHALL call `find_by_id` and raise `FeatureNotFoundException` if the feature does not exist, before any authorization or transition check.
5. THE `update_feature_status` function SHALL check `current_user.get("role") == "admin"` and raise `AdminPermissionException` if the check fails.
6. THE `update_feature_status` function SHALL call `validate_status_transition(feature["status"], new_status)` and propagate `InvalidStatusTransitionException` if raised.
7. THE `update_feature_status` function SHALL use a single `find_one_and_update` with `return_document=ReturnDocument.AFTER` to atomically set `status` and `updated_at`.
8. WHEN `find_one_and_update` returns `None`, THE `update_feature_status` function SHALL raise `StatusUpdateFailedException`.
9. THE existing functions `create_feature`, `update_feature`, `delete_feature`, `find_by_id`, `get_feed`, `toggle_vote`, and `get_related_features` SHALL remain unchanged.

---

### Requirement 7: Admin Router

**User Story:** As a backend developer, I want admin-specific routes in a dedicated `admin.py` file with its own prefix, so that admin endpoints are isolated from public feature endpoints.

#### Acceptance Criteria

1. THE `admin.py` module SHALL define `router = APIRouter(prefix="/admin")`.
2. THE `admin.py` module SHALL register `GET /features/board` and `PATCH /features/{feature_id}/status` routes on this router.
3. WHEN `api_router` in `__init__.py` includes `admin.router` with `tags=["admin"]`, THE resulting paths SHALL be `/api/v1/admin/features/board` and `/api/v1/admin/features/{feature_id}/status`.
4. THE `admin.py` router SHALL NOT duplicate or shadow the existing `/admin/dashboard` route defined in `dashboard.py`.
5. THE `__init__.py` SHALL import `admin` from `app.api.v1` and include its router alongside the existing five routers.

---

### Requirement 8: Frontend Board Service

**User Story:** As a frontend developer, I want a thin service module wrapping the admin board API calls, so that components and hooks never construct URLs directly.

#### Acceptance Criteria

1. THE `adminBoardService.js` module SHALL export a `getBoard()` function that issues `GET /api/v1/admin/features/board` and returns `response.data.data`.
2. THE `adminBoardService.js` module SHALL export an `updateStatus(featureId, status)` function that issues `PATCH /api/v1/admin/features/${featureId}/status` with `{ status }` in the request body and returns `response.data.data`.
3. THE `adminBoardService.js` module SHALL use the same `httpClient` (Axios instance) as existing service files.
4. THE `adminBoardService.js` module SHALL NOT modify any existing service file.

---

### Requirement 9: Frontend Board Hook

**User Story:** As a frontend developer, I want React Query hooks encapsulating the board query and status mutation, so that pages remain free of fetch logic.

#### Acceptance Criteria

1. THE `useAdminBoard` hook SHALL use `useQuery` with `queryKey: ["adminBoard"]` and `queryFn: adminBoardService.getBoard`.
2. THE `useAdminBoard` hook SHALL expose `data`, `isLoading`, `isError`, and `error` to consumers.
3. THE `useUpdateFeatureStatus` hook SHALL use `useMutation` with `mutationFn: ({ featureId, status }) => adminBoardService.updateStatus(featureId, status)`.
4. WHEN `useUpdateFeatureStatus` fires, THE hook SHALL expose `mutate`, `isPending`, and `isError` to consumers.

---

### Requirement 10: Optimistic Status Update

**User Story:** As an admin, I want card moves to appear instant in the UI before the server confirms, so that the board feels responsive during drag-and-drop.

#### Acceptance Criteria

1. WHEN `useUpdateFeatureStatus.mutate` is called, THE `onMutate` callback SHALL cancel any in-flight `["adminBoard"]` queries via `queryClient.cancelQueries`.
2. WHEN `onMutate` runs, THE hook SHALL snapshot the current `["adminBoard"]` cache entry via `queryClient.getQueryData`.
3. WHEN `onMutate` runs, THE hook SHALL move the feature card from its current column to the target column in the optimistic `["adminBoard"]` cache update via `queryClient.setQueryData`.
4. WHEN `onError` is triggered, THE hook SHALL restore the snapshotted `["adminBoard"]` data via `queryClient.setQueryData` and display a `toast.error` message.
5. WHEN `onSettled` is triggered, THE hook SHALL invalidate `["adminBoard"]` to trigger a background refetch.
6. WHEN `onSettled` is triggered and the `["feature", featureId]` key is present in the cache, THE hook SHALL update that entry's `status` field to the new value via `queryClient.setQueryData`.
7. WHEN `onSettled` is triggered, THE hook SHALL call `queryClient.invalidateQueries({ queryKey: ["features"] })` so the public feed reflects the status change.

---

### Requirement 11: Admin Board Page

**User Story:** As an admin, I want a dedicated board page at `/admin/board` that shows all features across four columns, so that I can manage the feature lifecycle visually.

#### Acceptance Criteria

1. THE `Admin_Board_Page` SHALL be accessible only to authenticated, verified admins via the existing `AdminRoute` guard at `path="admin/board"` in `App.jsx`.
2. THE `Admin_Board_Page` SHALL render four `Kanban_Column` components side by side, one per status: `under_review`, `planned`, `in_progress`, `completed`.
3. THE `Admin_Board_Page` SHALL display a board statistics section showing: Total Features, Under Review count, Planned count, In Progress count, Completed count, Total Votes, and Total Comments — all computed client-side from the board data.
4. THE `Admin_Board_Page` SHALL provide a Manual Refresh button that calls `queryClient.invalidateQueries({ queryKey: ["adminBoard"] })`.
5. WHEN the board data is loading, THE `Admin_Board_Page` SHALL render four skeleton placeholder columns instead of the real columns.
6. WHEN the board query returns an error, THE `Admin_Board_Page` SHALL render an inline error message and a Retry button.
7. THE `Admin_Board_Page` SHALL wrap the four columns in a `DndContext` from `@dnd-kit/core` configured with `PointerSensor` and `KeyboardSensor` sensors.
8. THE `Admin_Board_Page` SHALL render a `DragOverlay` that shows the dragged `Board_Card` while a drag is in progress.

---

### Requirement 12: Kanban Columns

**User Story:** As an admin, I want each status column to visually indicate its contents and accept dropped cards, so that drag-and-drop interactions are clear.

#### Acceptance Criteria

1. THE `Kanban_Column` SHALL use `useDroppable` with `id` equal to the column's status string so that `handleDragEnd` can read `over.id` as the target status.
2. THE `Kanban_Column` SHALL display the column label and a numeric count badge showing the number of features in that column.
3. THE `Kanban_Column` SHALL render an empty-state placeholder with a dashed border when the features list is empty.
4. WHEN the `isOver` prop is true, THE `Kanban_Column` SHALL apply a highlighted border style to indicate an active drop target.
5. THE `Kanban_Column` SHALL be independently scrollable with `overflow-y-auto` and a `max-h` derived from the viewport height so that long columns do not push adjacent columns off screen.
6. THE `Kanban_Column` SHALL render `Kanban_Column`'s feature list using a `SortableContext` from `@dnd-kit/sortable` with `verticalListSortingStrategy`.

---

### Requirement 13: Kanban Feature Card

**User Story:** As an admin, I want each feature card to show key metadata and be draggable, so that I can identify features at a glance and reposition them.

#### Acceptance Criteria

1. THE `Board_Card` SHALL display the feature title, category badge, status badge, vote count, comment count, author name, and formatted creation date.
2. THE `Board_Card` SHALL render a "View feature" link navigating to `/features/${feature.id}`.
3. THE `Board_Card` SHALL use `useSortable` with `id = feature.id` from `@dnd-kit/sortable`.
4. THE `Board_Card` SHALL apply a reduced opacity style while `isDragging` is true, to indicate the card is being moved.
5. THE `Board_Card`'s drag handle element SHALL carry `aria-label` equal to `` `Drag ${feature.title} to reorder` ``.
6. THE `Board_Card` SHALL derive category and status badge classes exclusively from `categoryBadgeClass` and `statusBadgeClass` imported from `badgeColors.js`.

---

### Requirement 14: Drag and Drop

**User Story:** As an admin, I want to drag a feature card from one column and drop it onto a different column to trigger a status change, so that I can update statuses without navigating to a detail page.

#### Acceptance Criteria

1. WHEN a drag ends with `over` defined and `over.id !== active.data.current.status`, THE `handleDragEnd` handler SHALL call `updateStatus.mutate({ featureId: active.id, status: over.id })`.
2. WHEN a drag ends with `over` null or `over.id === active.data.current.status`, THE `handleDragEnd` handler SHALL perform no state mutation.
3. THE `DndContext` SHALL use `PointerSensor` and `KeyboardSensor` with `sortableKeyboardCoordinates` to support both pointer and keyboard interactions.
4. THE `DragOverlay` SHALL render a `Board_Card` for the feature identified by `active.id` during an active drag.
5. WHEN `active` becomes null (drag ends or is cancelled), THE `DragOverlay` SHALL stop rendering a card.

---

### Requirement 15: Board Statistics

**User Story:** As an admin, I want a summary section showing counts of features per status and aggregate vote/comment totals, so that I can assess feature request volume at a glance.

#### Acceptance Criteria

1. THE board statistics section SHALL display seven metrics: Total Features, Under Review, Planned, In Progress, Completed, Total Votes, Total Comments.
2. THE board statistics section SHALL derive all values client-side by iterating the `BoardResponse` data — no extra API call.
3. WHEN the board data updates (after a status change or refresh), THE board statistics section SHALL reflect the updated counts immediately.

---

### Requirement 16: Loading and Error UX

**User Story:** As an admin, I want clear feedback while the board loads or when it fails, so that I am not presented with a blank or broken UI.

#### Acceptance Criteria

1. WHILE `useAdminBoard` returns `isLoading === true`, THE `Admin_Board_Page` SHALL render four side-by-side skeleton placeholder boxes instead of the real columns.
2. WHEN `useAdminBoard` returns `isError === true`, THE `Admin_Board_Page` SHALL render an error message and a Retry button that calls `queryClient.invalidateQueries({ queryKey: ["adminBoard"] })`.
3. WHEN a status mutation fails, THE `Status_Mutation_Hook` SHALL display a `toast.error` notification and restore the pre-mutation board state.
4. THE loading skeleton SHALL match the column layout (4-col desktop, 2x2 tablet, scroll mobile) to minimize layout shift.

---

### Requirement 17: Cache Synchronization

**User Story:** As an admin, I want status changes reflected in the public feature feed and detail view automatically, so that end users see consistent data without a full page reload.

#### Acceptance Criteria

1. WHEN a status mutation settles (success or error), THE `Status_Mutation_Hook` SHALL invalidate `["adminBoard"]` to trigger a background refetch.
2. WHEN a status mutation succeeds and a `["feature", featureId]` entry exists in the React Query cache, THE `Status_Mutation_Hook` SHALL update that entry's `status` field via `setQueryData`.
3. WHEN a status mutation settles, THE `Status_Mutation_Hook` SHALL call `invalidateQueries({ queryKey: ["features"] })` so the public feed refetches.

---

### Requirement 18: Accessibility

**User Story:** As an admin using assistive technology, I want the board to be navigable by keyboard and readable by screen readers, so that the tool remains usable regardless of input method.

#### Acceptance Criteria

1. THE `Board_Card` drag handle SHALL carry an `aria-label` matching `` `Drag ${feature.title} to reorder` ``.
2. THE `Kanban_Column` SHALL carry an appropriate `aria-label` or `aria-labelledby` identifying the column status.
3. THE `DndContext` SHALL be configured with `KeyboardSensor` using `sortableKeyboardCoordinates` to permit full keyboard-only drag-and-drop.
4. THE board statistics section SHALL use semantic HTML (e.g. `<dl>`, `<dt>`, `<dd>`) or equivalent ARIA roles so screen readers announce the metric labels and values together.
5. THE skeleton loading state SHALL carry `role="status"` or equivalent ARIA markup to announce loading to screen readers.

---

### Requirement 19: Responsive UX

**User Story:** As an admin on different screen sizes, I want the board layout to adapt, so that columns remain usable on tablets and accessible on mobile.

#### Acceptance Criteria

1. THE `Admin_Board_Page` column grid SHALL use `grid-cols-4` on desktop (lg breakpoint and above).
2. THE `Admin_Board_Page` column grid SHALL use `sm:grid-cols-2` on tablet viewports, arranging columns 2×2.
3. THE `Admin_Board_Page` column grid SHALL allow horizontal scrolling (`overflow-x-auto`) on mobile viewports so that all four columns are reachable.
4. THE `Kanban_Column` SHALL use `overflow-y-auto` with a `max-h` value so that an individual tall column does not overflow the viewport.

---

### Requirement 20: App Routing

**User Story:** As an admin, I want a dedicated route at `/admin/board` that is protected by the admin guard, so that non-admin users cannot access the board URL directly.

#### Acceptance Criteria

1. THE `App.jsx` SHALL import `AdminBoardPage` and render it at `path="admin/board"` wrapped in `AdminRoute`.
2. THE `Admin_Board_Page` route SHALL be a sibling of the existing `path="admin"` route, both nested inside the `Layout` route.
3. WHEN a non-admin user navigates to `/admin/board`, THE `AdminRoute` SHALL redirect to `/` as per its existing behavior.
4. THE existing `path="admin"` route and `AdminDashboardPage` SHALL remain unchanged.
