# Implementation Plan: Sprint 5A — Admin Kanban Board

## Overview

Convert the Sprint 5A design into incremental coding tasks. The backend is built first (exceptions → service → routes), then the frontend service/hooks are added, then UI components, and finally the board page and routing are wired together. Property tests are placed directly after the code they exercise so regressions are caught early.

---

## Tasks

- [ ] 1. Add admin exception types to `exceptions.py`
  - Append `InvalidStatusTransitionException` (HTTP 400), `AdminPermissionException` (HTTP 403), and `StatusUpdateFailedException` (HTTP 500) as subclasses of `FeatureException` in `backend/app/core/exceptions.py`.
  - Do NOT add any `@app.exception_handler` — the existing `FeatureException` handler in `main.py` covers all three.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 2. Add board Pydantic schemas
  - [ ] 2.1 Implement `BoardFeatureCard`, `BoardResponse`, and `AdminStatusUpdate` schemas
    - Add to `backend/app/models/feature.py` (or a new `backend/app/models/admin.py`).
    - `BoardFeatureCard.from_mongo(doc)` converts `_id` → `id: str`; omits `description_markdown` and `votes`.
    - `BoardResponse` has four typed list fields matching the four status values.
    - `AdminStatusUpdate` has a single `status: FeatureStatus` field (reuses existing enum).
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 2.2 Write property test for `BoardFeatureCard` serialization
    - **Property 6: BoardFeatureCard Serialization Includes Required Fields and Excludes Forbidden Fields**
    - Use Hypothesis `@given(feature_document_strategy())`. For any valid feature dict, assert all 8 required fields present, `description_markdown` and `votes` absent, `id == str(doc["_id"])`.
    - **Validates: Requirements 1.1, 1.2, 1.5**

- [ ] 3. Extend `feature_service.py` with `validate_status_transition`, `get_board`, and `update_feature_status`
  - [ ] 3.1 Implement `ALLOWED_TRANSITIONS`, `validate_status_transition`, `get_board`, and `update_feature_status`
    - `ALLOWED_TRANSITIONS`: module-level dict mapping each status to the set of the three remaining statuses.
    - `validate_status_transition(current, requested)`: pure function, raises `InvalidStatusTransitionException` on same-to-same, returns None otherwise.
    - `get_board()`: single `find({}).sort([(vote_count, -1), (created_at, -1)])`, group into 4-key dict, silently skip unknown statuses.
    - `update_feature_status(feature_id, new_status, current_user)`: guard order: not-found → not-admin → invalid-transition → atomic `find_one_and_update(..., return_document=AFTER)` → raise `StatusUpdateFailedException` if None returned.
    - Existing functions (`create_feature`, `update_feature`, `delete_feature`, `find_by_id`, `get_feed`, `toggle_vote`, `get_related_features`) remain unchanged.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [ ]* 3.2 Write property tests for transition validation and board totality
    - **Property 1: Same-Status Transition Is Always Rejected**
    - Use Hypothesis `@given(st.sampled_from(["under_review","planned","in_progress","completed"]))`. Assert `validate_status_transition(s, s)` raises `InvalidStatusTransitionException`.
    - **Validates: Requirements 4.2**
    - **Property 2: Cross-Status Transition Is Always Accepted**
    - Use Hypothesis `@given(st.sampled_from(...), st.sampled_from(...)).filter(lambda c, r: c != r)`. Assert no exception raised.
    - **Validates: Requirements 4.3**
    - **Property 3: Board Totality**
    - Use Hypothesis `@given(st.lists(feature_document_strategy()))`. Extract grouping logic from `get_board` into a pure helper. Assert union of all column lists equals input set, no duplicates.
    - **Validates: Requirements 6.1, 6.2, 2.3, 2.4**

- [ ] 4. Create `adminBoardService.js` frontend service
  - Create `frontend/src/services/adminBoardService.js`.
  - `getBoard()`: GET `/api/v1/admin/features/board` → returns `response.data.data`.
  - `updateStatus(featureId, status)`: PATCH `/api/v1/admin/features/${featureId}/status` with `{ status }` → returns `response.data.data`.
  - Import and reuse the same `httpClient` as other service files (no new Axios instance).
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] 5. Create `backend/app/api/v1/admin.py` router
  - Define `router = APIRouter(prefix="/admin")`.
  - `GET /features/board`: depends on `require_admin`, calls `feature_service.get_board()`, serializes via `BoardFeatureCard.from_mongo`, returns `success_response("Board retrieved.", serialized)`.
  - `PATCH /features/{feature_id}/status`: depends on `require_admin`, body `AdminStatusUpdate`, calls `feature_service.update_feature_status(feature_id, body.status, current_user)`, returns `success_response("Status updated.", FeatureResponse.from_mongo(doc).model_dump())`.
  - Add `from app.api.v1 import admin` and `api_router.include_router(admin.router, tags=["admin"])` to `backend/app/api/v1/__init__.py`.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 5.2 Write unit tests for `admin.py` routes
    - Mock `feature_service.get_board` and `feature_service.update_feature_status`. Test HTTP 200 for valid admin calls, 403 for non-admin, 404 for unknown feature, 400 for same-status transition, 500 for update failure, 422 for invalid status string.
    - _Requirements: 2.1–2.7, 3.1–3.7_

- [ ] 6. Backend checkpoint — ensure all tests pass
  - Ensure all backend tests pass, ask the user if questions arise.

- [ ] 7. Create `useAdminBoard.js` hook
  - [ ] 7.1 Implement `useAdminBoard` query and `useUpdateFeatureStatus` mutation base (without optimistic logic)
    - `useAdminBoard()`: `useQuery({ queryKey: ["adminBoard"], queryFn: adminBoardService.getBoard })`.
    - `useUpdateFeatureStatus()`: `useMutation({ mutationFn: ({ featureId, status }) => adminBoardService.updateStatus(featureId, status) })`.
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ] 7.2 Add optimistic update, rollback, and cache sync to `useUpdateFeatureStatus`
    - `onMutate`: `cancelQueries(["adminBoard"])` → snapshot via `getQueryData` → `setQueryData` to move card optimistically (remove from all columns, prepend to target column).
    - `onError`: restore snapshot via `setQueryData`, call `toast.error`.
    - `onSettled`: `invalidateQueries(["adminBoard"])`, `setQueryData(["feature", featureId], …)` to update status field, `invalidateQueries(["features"])`.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 17.1, 17.2, 17.3_

  - [ ]* 7.3 Write property test for optimistic move consistency
    - **Property 4: Optimistic Move Consistency**
    - Use fast-check `fc.assert(fc.property(boardArbitrary, moveArbitrary, (board, { featureId, targetStatus }) => { /* run onMutate logic */ assertExactlyOneColumn(result, featureId, targetStatus); }), { numRuns: 100 })`.
    - **Tag: Feature: sprint-5a-admin-kanban-board, Property 4: Optimistic Move Consistency**
    - **Validates: Requirements 10.2, 10.3**

  - [ ]* 7.4 Write property test for board statistics consistency
    - **Property 5: Board Statistics Are Consistent With Board Data**
    - Use fast-check `fc.assert(fc.property(boardArbitrary, (board) => { const stats = computeStats(board); /* assert 7 invariants */ }), { numRuns: 100 })`.
    - **Tag: Feature: sprint-5a-admin-kanban-board, Property 5: Board Statistics Consistency**
    - **Validates: Requirements 15.1, 15.2**

- [ ] 8. Create `KanbanFeatureCard` component
  - Create `frontend/src/components/KanbanFeatureCard.jsx`.
  - Use `useSortable({ id: feature.id, data: { status: feature.status } })` from `@dnd-kit/sortable`.
  - Apply `opacity: isDragging ? 0.4 : 1` and `transform`/`transition` from `CSS.Transform.toString`.
  - Drag handle button with `aria-label={`Drag ${feature.title} to reorder`}`.
  - Display title, category badge (`categoryBadgeClass`), status badge (`statusBadgeClass`), `▲ vote_count`, `💬 comment_count`, `author_name`, formatted `created_at`.
  - "View feature →" `Link` to `/features/${feature.id}`.
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 18.1_

  - [ ]* 8.2 Write property test for drag handle `aria-label` totality
    - **Property 6 (JS): Drag Handle aria-label Is Total**
    - Use fast-check `fc.assert(fc.property(fc.string(), (title) => { /* render KanbanFeatureCard with feature.title = title, mock useSortable */ assertAriaLabel(handle, `Drag ${title} to reorder`); }), { numRuns: 100 })`.
    - **Tag: Feature: sprint-5a-admin-kanban-board, Property 6: Drag Handle aria-label Totality**
    - **Validates: Requirements 13.5, 18.1**

  - [ ]* 8.3 Write unit tests for `KanbanFeatureCard`
    - Render with sample feature; assert title, badges, vote count, comment count, author name, "View feature" href, and opacity style when `isDragging=true`.
    - _Requirements: 13.1, 13.2, 13.4_

- [ ] 9. Create `KanbanColumn` component
  - Create `frontend/src/components/KanbanColumn.jsx`.
  - Use `useDroppable({ id: status })` from `@dnd-kit/core`.
  - Render column header with label and count badge `(features.length)`.
  - Wrap feature list in `SortableContext` with `verticalListSortingStrategy`.
  - Empty state: dashed border placeholder "No features here" when `features.length === 0`.
  - Apply highlighted border class when `isOver`.
  - `overflow-y-auto max-h-[calc(100vh-16rem)]` for independent scrolling.
  - `aria-label={`${label} column`}` on the root element.
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 18.2_

  - [ ]* 9.2 Write unit tests for `KanbanColumn`
    - Assert count badge renders `features.length`. Assert empty state placeholder when `features = []`. Assert highlighted border class when `isOver=true`. Assert all passed features render `KanbanFeatureCard` children.
    - _Requirements: 12.2, 12.3, 12.4_

- [ ] 10. Create `AdminBoardPage` and wire `DndContext`
  - Create `frontend/src/pages/AdminBoardPage.jsx`.
  - Import `DndContext`, `DragOverlay`, `PointerSensor`, `KeyboardSensor`, `useSensor`, `useSensors` from `@dnd-kit/core`; `sortableKeyboardCoordinates` from `@dnd-kit/sortable`.
  - `useAdminBoard()` for board data; `useUpdateFeatureStatus()` for mutations; `useQueryClient()` for Manual Refresh.
  - `handleDragStart`: set `activeId` state.
  - `handleDragEnd({ active, over })`: clear `activeId`; if `over && over.id !== active.data.current?.status`, call `updateStatus.mutate({ featureId: active.id, status: over.id })`.
  - `DragOverlay`: renders a `KanbanFeatureCard` for `activeFeature` (found by `activeId` across all columns).
  - Board statistics section using `computeStats(board)` — `<dl>` with seven `<dt>`/`<dd>` pairs.
  - Loading state: four `animate-pulse` skeleton boxes with `role="status"`.
  - Error state: error message + Retry button calling `invalidateQueries(["adminBoard"])`.
  - Manual Refresh button: `invalidateQueries({ queryKey: ["adminBoard"] })`.
  - Responsive grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` inside `overflow-x-auto` wrapper.
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 14.1, 14.2, 14.3, 14.4, 14.5, 15.1, 15.2, 15.3, 16.1, 16.2, 16.4, 18.4, 18.5, 19.1, 19.2, 19.3, 19.4_

- [ ] 11. Frontend stack checkpoint — ensure all tests pass
  - Install `@dnd-kit/core@6.3.1` and `@dnd-kit/sortable@10.0.0` if not already present in `frontend/package.json`.
  - Run `vitest --run` and ensure all frontend tests pass, ask the user if questions arise.

  - [ ]* 11.2 Write integration-style tests for `AdminBoardPage`
    - Mock `useAdminBoard` to return sample board data; assert all four column labels render, statistics section shows correct totals, Manual Refresh button exists.
    - Mock loading state; assert skeleton columns render with `role="status"`.
    - Mock error state; assert error message and Retry button render.
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.6, 16.1, 16.2_

- [ ] 12. Wire `AdminBoardPage` into `App.jsx` routing
  - Import `AdminBoardPage` from `./pages/AdminBoardPage`.
  - Add `<Route path="admin/board" element={<AdminRoute><AdminBoardPage /></AdminRoute>} />` as a sibling to the existing `path="admin"` route, both inside the `Layout` route.
  - Verify existing `path="admin"` and `AdminDashboardPage` remain unchanged.
  - _Requirements: 20.1, 20.2, 20.3, 20.4_

  - [ ]* 12.2 Write unit tests for `AdminBoardPage` routing guard
    - Assert that a non-admin user navigating to `/admin/board` is redirected to `/` by `AdminRoute` (reuse or adapt existing `AdminRoute` test patterns from Sprint 1B/2A).
    - _Requirements: 20.3_

  - [ ]* 12.3 Write unit tests for `handleDragEnd` logic
    - Same-column drop: mock `over.id === active.data.current.status`, assert `updateStatus.mutate` not called.
    - Cross-column drop: mock `over.id !== active.data.current.status`, assert `updateStatus.mutate` called with `{ featureId, status: over.id }`.
    - Null `over`: assert no mutation.
    - _Requirements: 14.1, 14.2_

- [ ] 13. Final checkpoint — ensure all tests pass
  - Run full backend (`pytest`) and frontend (`vitest --run`) test suites. All tests must pass before closing the sprint. Ask the user if questions arise.

- [ ] 14. Write Sprint 5A README documentation
  - Add a `## Sprint 5A — Admin Kanban Board` section to the project's `README.md` (or `CHANGELOG.md` / `PROJECT_SPEC.md`) describing:
    - New endpoints: `GET /api/v1/admin/features/board`, `PATCH /api/v1/admin/features/{feature_id}/status`.
    - New frontend route: `/admin/board` (admin-only).
    - New `@dnd-kit/core` + `@dnd-kit/sortable` dependencies and their pinned versions.
    - Transition rules: all cross-status moves allowed; same-to-same rejected with HTTP 400.
    - Cache synchronization: optimistic moves, `["adminBoard"]` / `["feature", id]` / `["features"]` invalidation on settle.
  - _Requirements: (documentation only)_

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP.
- Each task references specific requirements for traceability.
- Backend and frontend tasks are sequenced so the backend API is ready before frontend service/hooks are wired to real endpoints.
- Property tests use **Hypothesis** on the backend and **fast-check** on the frontend (both already in the project's dev dependencies).
- Minimum 100 iterations per property test (`settings(max_examples=100)` / `{ numRuns: 100 }`).
- The `computeStats` function should be exported from `AdminBoardPage.jsx` (or a separate util) so it can be tested in isolation without rendering the full page.
- The `onMutate` optimistic-move logic should be extracted into a pure helper function `applyOptimisticMove(board, featureId, targetStatus)` for the same reason.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2.1", "3.1", "4"] },
    { "id": 1, "tasks": ["2.2", "3.2", "5", "7.1"] },
    { "id": 2, "tasks": ["5.2", "7.2", "8", "9"] },
    { "id": 3, "tasks": ["7.3", "7.4", "8.2", "8.3", "9.2", "10"] },
    { "id": 4, "tasks": ["11.2", "12"] },
    { "id": 5, "tasks": ["12.2", "12.3"] },
    { "id": 6, "tasks": ["13", "14"] }
  ]
}
```
