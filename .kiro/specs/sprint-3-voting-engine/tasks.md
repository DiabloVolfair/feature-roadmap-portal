# Implementation Plan: Sprint 3 - Atomic Voting Engine

## Overview

This plan builds the voting engine on top of Sprint 2A's `features` collection / `Feature_Service` / `Feature_API` and Sprint 2B's `FeatureDetailResponse` / `get_optional_current_user`, following the design's layering: backend first (the two `FeatureException` subclasses → the atomic `toggle_vote()` and `has_voted` helper in `Feature_Service` → the `has_voted` field on `FeatureFeedResponse`/`FeatureDetailResponse` → the two thin `Feature_API` routes plus threading `current_user` into feed/detail serialization) → backend checkpoint, then the frontend vote stack (`featureVoteService.js` → the pure optimistic-transform/reduced-motion helpers → `useFeatureVote.js` → `LoginRequiredModal` → `VoteButton`) → the `FeatureCard` and `FeatureDetailsPage` integrations → frontend checkpoint, finished by README documentation. Each layer is implemented and tested before the layer above it depends on it, mirroring Sprint 2A/2B. No threaded comments, admin dashboard, Kanban, roadmap page, notifications, or activity feed are included, per the Non-Goals in requirements.md. The Feed_Endpoint's pagination structure, the Create/Update/Delete_Feature_Endpoint contracts, `featureService.js`, `useFeatures.js`' exported signatures/query keys, and `FeatureCard`'s existing layout are not modified beyond the additive changes each task states, per design.md's "preserved unchanged" list.

## Tasks

- [ ] 1. Add the vote exception family
  - [ ] 1.1 Extend `backend/app/core/exceptions.py`
    - Add `AlreadyVotedException` (`status_code = 409`) and `VoteFailedException` (`status_code = 500`) as subclasses of the existing `FeatureException` base (not `AuthException`); add no `main.py` handler, since the existing `@app.exception_handler(FeatureException)` already translates the whole family
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [ ]* 1.2 Write unit tests for the vote exception hierarchy and status codes
    - Assert `issubclass(AlreadyVotedException, FeatureException)` and `issubclass(VoteFailedException, FeatureException)`, that neither subclasses `AuthException`, and that their `status_code` attributes are 409 and 500 respectively
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 2. Implement the atomic toggle_vote service function
  - [ ] 2.1 Add `toggle_vote(feature_id, user_id)` to `backend/app/services/feature_service.py`
    - Read the feature once via `find_by_id` (raise `FeatureNotFoundException` on a miss); choose the add or remove branch from current membership; perform a single conditional `find_one_and_update` returning the post-update document — add branch filter `{_id, votes: {$ne: user_id}}` with `{$addToSet: {votes: user_id}, $inc: {vote_count: 1}}`, remove branch filter `{_id, votes: user_id}` with `{$pull: {votes: user_id}, $inc: {vote_count: -1}}`; raise `AlreadyVotedException` when the conditional write matches nothing on an existing feature; return `{voted, vote_count}` derived from the post-update document
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  - [ ]* 2.2 Write property test for vote-count integrity across arbitrary toggle sequences
    - **Property 1: Vote count equals votes-array length after every toggle**
    - **Validates: Requirements 1.3, 2.4, 2.5**
  - [ ]* 2.3 Write property test for the no-duplicate-votes invariant
    - **Property 2: The votes array never contains a duplicate user id**
    - **Validates: Requirements 1.2, 2.2, 2.3**
  - [ ]* 2.4 Write property test for the toggle involution
    - **Property 3: Toggling a user's vote twice is an involution**
    - **Validates: Requirements 2.1, 2.5**
  - [ ]* 2.5 Write unit tests for toggle_vote's not-found and lost-race branches
    - Assert `toggle_vote` on an unknown id raises `FeatureNotFoundException`, and that when the fake collection's `find_one_and_update` returns `None` for an existing feature `toggle_vote` raises `AlreadyVotedException`
    - _Requirements: 2.6, 2.7_

- [ ] 3. Add the has_voted field and membership helper to Feature_Model
  - [ ] 3.1 Extend `backend/app/models/feature.py`
    - Add a single-sourced `viewer_has_voted(doc, current_user)` helper (`current_user is not None and str(current_user["_id"]) in doc.get("votes", [])`); add `has_voted: bool = False` to `FeatureFeedResponse` and give it a `from_mongo(doc, *, current_user=None)` that populates `has_voted`; add `has_voted: bool = False` to `FeatureDetailResponse` and populate it in its existing `from_mongo` alongside `is_owner`/`is_admin`/`related_features`; do not remove, rename, or retype any existing field, and keep the raw `votes` array out of every response schema
    - _Requirements: 1.4, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3_
  - [ ]* 3.2 Write property test for the has_voted membership computation
    - **Property 4: `has_voted` equals votes membership for the resolved viewer**
    - **Validates: Requirements 5.2, 5.3, 6.2, 6.3**
  - [ ]* 3.3 Write unit tests for schema-shape preservation and votes non-exposure
    - Assert `FeatureFeedResponse`/`FeatureDetailResponse` dumps contain `has_voted` and every pre-existing field (including Sprint 2B `is_owner`/`is_admin`/`related_features`) and never contain a `votes` key
    - _Requirements: 1.4, 5.1, 6.1_

- [ ] 4. Add the vote and vote-status routes and thread current_user into reads
  - [ ] 4.1 Extend `backend/app/api/v1/features.py`
    - Add `POST /{feature_id}/vote` (`vote_route`, `Depends(require_verified_user)`, delegates to `feature_service.toggle_vote`, returns `success_response("Vote updated.", {voted, vote_count})`) and `GET /{feature_id}/vote-status` (`vote_status_route`, `Depends(require_verified_user)`, resolves the feature or raises `FeatureNotFoundException`, returns `{has_voted, vote_count}`); pass `current_user` from the existing `get_optional_current_user` dependency into `FeatureDetailResponse.from_mongo` on the get-feature route, and add a `get_optional_current_user` dependency to the feed route so each `FeatureFeedResponse.from_mongo` receives `current_user`; keep both handlers thin (no inline db/authz/error_response); do not modify the create/update/delete route handlers
    - _Requirements: 3.1, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.4, 5.5, 6.4_
  - [ ]* 4.2 Write integration tests for the vote and vote-status endpoints
    - Using `app.dependency_overrides` and the fake collection: POST vote returns 200 with `{voted, vote_count}`; a second POST toggles back; GET vote-status returns `{has_voted, vote_count}`; a guest (no `require_verified_user` override) gets 401; an unverified user gets 403; an unknown `feature_id` gets 404 on both routes; a raised `AlreadyVotedException` surfaces as a 409 `{success:false, message, errors}` envelope through the existing family handler
    - _Requirements: 3.2, 3.3, 4.1, 4.2, 4.3, 7.4_
  - [ ]* 4.3 Write integration tests for has_voted on the feed and detail reads
    - Assert a guest feed/detail request returns 200 with every `has_voted` false and the feed's `items`/`pagination` structure unchanged; assert an authenticated viewer whose id is in a feature's `votes` sees `has_voted` true for that item and false otherwise, on both feed and detail
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 6.2, 6.3, 6.4_

- [ ] 5. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement the frontend Vote_Service
  - [ ] 6.1 Implement `frontend/src/services/featureVoteService.js`
    - Export a `featureVoteService` object with `toggleVote(featureId)` (`POST /api/v1/features/{featureId}/vote` via the shared `httpClient`, resolving to `data.data` = `{voted, vote_count}`) and `getVoteStatus(featureId)` (`GET /api/v1/features/{featureId}/vote-status`, resolving to `{has_voted, vote_count}`); do not modify `featureService.js`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [ ]* 6.2 Write unit tests for the Vote_Service HTTP calls
    - Mock `httpClient`; assert `toggleVote`/`getVoteStatus` hit the documented URL/method and resolve to `data.data`
    - _Requirements: 8.2, 8.3_

- [ ] 7. Implement the pure optimistic-transform and reduced-motion helpers
  - [ ] 7.1 Implement `frontend/src/components/voteAnimation.js`
    - Pure `applyOptimisticVote(feature)` (flip `has_voted`, adjust `vote_count` by `+1`/`-1` clamped at zero), `applyOptimisticVoteToPage(page, featureId)` (map a feed page's `items`, transforming only the matching entry), and `prefersReducedMotion()` (reads `matchMedia("(prefers-reduced-motion: reduce)")`)
    - _Requirements: 10.1, 10.2, 10.5, 15.3, 17.1_
  - [ ]* 7.2 Write property test for the optimistic forward transform
    - **Property 5: Optimistic update flips `has_voted` and adjusts count by exactly one**
    - **Validates: Requirements 10.1, 10.2, 10.5, 17.1**

- [ ] 8. Implement the Vote_Hook
  - [ ] 8.1 Implement `frontend/src/hooks/useFeatureVote.js`
    - Export `useToggleVote(featureId)`: a React Query mutation whose `mutationFn` calls `featureVoteService.toggleVote(featureId)`; `onMutate` cancels `["feature", featureId]` and `["features"]` queries, snapshots the detail entry and every `["features", ...]` page via `getQueriesData`, and writes optimistic updates via `setQueryData` using the Task 7 helpers; `onError` restores the snapshots and fires one Sonner error Toast; `onSettled` invalidates the affected keys without forcing an immediate synchronous full refetch; do not import `useSearchParams`/feed-query-param utilities, and do not modify `useFeatures.js`
    - _Requirements: 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 10.4, 17.1, 17.2, 17.3, 18.3, 19.1, 19.2_
  - [ ]* 8.2 Write property test for the optimistic-update / rollback round-trip
    - **Property 6: Optimistic update followed by rollback restores the original cache**
    - **Validates: Requirements 10.3, 19.1**
  - [ ]* 8.3 Write unit tests for the Vote_Hook lifecycle and cache sync
    - With a real `QueryClient` seeded with a detail entry and a feed page: assert `mutate()` optimistically increments then (on a second call) decrements both caches, that a rejected mutation rolls both back and calls `toast.error` once, that `onSettled` invalidates both keys without an immediate refetch, and that voting leaves any seeded URL search params untouched
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 17.1, 17.2, 18.1, 18.2, 19.2, 19.3_

- [ ] 9. Implement the LoginRequiredModal
  - [ ] 9.1 Implement `frontend/src/components/LoginRequiredModal.jsx`
    - A `role="dialog"` `aria-modal` modal shown only when `isOpen`; displays the exact message `Log in to vote for feature requests.` and Login / Signup / Cancel actions; Login navigates to `/login` and Signup to `/signup` only on explicit activation (no navigation on open); Cancel calls `onClose` and casts no vote
    - _Requirements: 14.1, 14.3, 14.4, 14.5_
  - [ ]* 9.2 Write unit tests for the LoginRequiredModal
    - Using `MemoryRouter`: assert the exact message and three actions render, that no navigation occurs on open, that Login/Signup navigate on click, and that Cancel closes without navigating
    - _Requirements: 14.3, 14.4, 14.5_

- [ ] 10. Implement the VoteButton
  - [ ] 10.1 Implement `frontend/src/components/VoteButton.jsx`
    - Export a pure `selectVoteButtonState({isAuthenticated, isVerified, hasVoted, isPending})` (pending → `loading`; unauthenticated or unverified → `guest`; else `active` iff `hasVoted` else `inactive`); the component reads `useAuth()`, uses `useToggleVote(featureId)`, renders the arrow icon + `voteCount` (spinner replacing the icon while pending), sets `aria-pressed={hasVoted}`, opens `LoginRequiredModal` on guest activation, calls `mutate()` on verified activation, is `disabled` and ignores clicks while pending (double-click guard), and applies hand-rolled scale/color/count-transition CSS classes only when `prefersReducedMotion()` is false — no animation library
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 14.2, 15.1, 15.2, 15.3, 16.1, 16.2, 16.3_
  - [ ]* 10.2 Write property test for the VoteButton state selection
    - **Property 7: VoteButton state selection is a total function of its inputs**
    - **Validates: Requirements 11.2, 11.3, 11.4, 11.5, 16.1**
  - [ ]* 10.3 Write unit tests for the VoteButton states, guest flow, loading guard, and animation
    - With mocked `useAuth`/`useToggleVote`: assert guest activation opens the modal and casts no vote; verified activation calls `mutate`; a pending mutation disables the button, shows a spinner, and ignores rapid repeated clicks (at most one `mutate`), re-enabling on settle; the animation class applies on vote and is suppressed under a mocked `matchMedia(prefers-reduced-motion: reduce)`
    - _Requirements: 11.2, 11.3, 11.5, 14.2, 15.1, 15.3, 16.1, 16.2, 16.3_

- [ ] 11. Checkpoint - Ensure all new frontend vote-stack tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Integrate the VoteButton into FeatureCard
  - [ ] 12.1 Update `frontend/src/components/FeatureCard.jsx`
    - Render a single `VoteButton` wired to `feature.id`/`feature.vote_count`/`feature.has_voted` within the card's metadata region; preserve every existing element (title, description preview, category/status badges, author/date/count metadata line, "View Details" link, author-gated Edit / author-or-admin-gated Delete controls) in its current arrangement; do not trigger any manual refetch on vote
    - _Requirements: 12.1, 12.2, 12.3_
  - [ ]* 12.2 Write unit tests for FeatureCard's VoteButton integration and layout preservation
    - Assert the VoteButton renders with the feature's count/state and that the title, preview, badges, "View Details" link, and Edit/Delete controls (when permitted) all remain present
    - _Requirements: 12.1, 12.3_

- [ ] 13. Integrate the VoteButton into FeatureDetailsPage
  - [ ] 13.1 Update `frontend/src/pages/FeatureDetailsPage.jsx`
    - Render a `VoteButton` in the page header wired to `feature.vote_count`/`feature.has_voted` from `FeatureDetailResponse`; preserve the Sprint 2B section order and the ownership-gated Edit/Delete controls, adding the VoteButton rather than replacing any section; rely on the optimistic cache sync (no manual refetch, no full page reload)
    - _Requirements: 13.1, 13.2, 13.3, 17.3_
  - [ ]* 13.2 Write unit tests for FeatureDetailsPage's VoteButton integration
    - With `useFeature` mocked: assert the header VoteButton renders wired to the detail response's count/state and that the Sprint 2B sections and Edit/Delete controls remain intact
    - _Requirements: 13.1, 13.3_

- [ ] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Write README Sprint 3 documentation
  - [ ] 15.1 Update `README.md`
    - Add a "Sprint 3 Atomic Voting Engine" section documenting the atomic `toggle_vote` design (single conditional `find_one_and_update` per branch, MongoDB `$addToSet`/`$pull` + `$inc`, the `vote_count == len(votes)` invariant and no-duplicate guarantee under concurrency, and the defensive `AlreadyVotedException` lost-race case), the `has_voted` read-response enhancement via `get_optional_current_user`, the Vote_Endpoint/Vote_Status_Endpoint contracts, and the frontend optimistic-UI flow (React Query `onMutate`/`onError`/`onSettled`, `setQueryData` cache sync across feature + feed caches with rollback, no immediate full refetch, and the guest `LoginRequiredModal`); update the Sprint Status section to mark Sprint 3 completed
    - _Requirements: 1.1, 2.1, 4.1, 5.1, 8.1, 9.1, 10.1_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; they cover property tests, unit tests, and integration-style tests only.
- Property tests (2.2, 2.3, 2.4, 3.2, 7.2, 8.2, 10.2) each validate exactly one Correctness Property from design.md (Properties 1-7) and use Hypothesis (backend, `max_examples=100`) or fast-check (frontend, `numRuns: 100`), matching the repo's tooling.
- Backend tests use pytest + Hypothesis + FastAPI `TestClient` against a fake in-memory Motor-like `features` collection patched over `feature_service.db`, mirroring `test_token_consumption_properties.py`'s fake-collection pattern; the fake collection implements `find_one`, `find_one_and_update` (with the membership-filter semantics), `insert_one`, and `find`. Frontend tests use Vitest + React Testing Library + fast-check; pure functions (`applyOptimisticVote`/`applyOptimisticVoteToPage`, `selectVoteButtonState`) are exercised directly with fast-check, while hook/rendering tests use a real `QueryClient`, `render`/`screen`/`userEvent`, and `MemoryRouter`.
- Checkpoints (5, 11, 14) give natural points to validate the backend, the new frontend vote stack, and the full stack respectively before moving on.
- No threaded comments, admin dashboard, Kanban drag-and-drop, roadmap page, notifications, or activity feed are included, per the Non-Goals in requirements.md.
- The Feed_Endpoint's pagination structure, the Create_Feature_Endpoint/Update_Feature_Endpoint/Delete_Feature_Endpoint contracts, `featureService.js`, `useFeatures.js`' exported hook signatures/query keys, and `FeatureCard`'s existing layout are not modified by any task beyond the additive changes each task states.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1", "6.1", "7.1", "9.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "3.2", "3.3", "6.2", "7.2", "9.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "8.1"] },
    { "id": 3, "tasks": ["4.1", "8.2", "8.3", "10.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "10.2", "10.3"] },
    { "id": 5, "tasks": ["12.1", "13.1"] },
    { "id": 6, "tasks": ["12.2", "13.2"] },
    { "id": 7, "tasks": ["15.1"] }
  ]
}
```

Wave rationale: Wave 0 covers the independent backend/frontend leaves that consume nothing else new this sprint — the exception subclasses (`1.1`), the model field/helper (`3.1`), the vote service (`6.1`), the pure transform helpers (`7.1`), and the standalone `LoginRequiredModal` (`9.1`). Wave 1 adds `toggle_vote` (`2.1`, which needs `1.1`'s exceptions) plus the property/unit tests for the wave-0 leaves. Wave 2 runs `toggle_vote`'s property/unit tests after `2.1` exists and implements `useFeatureVote.js` (`8.1`, which needs `6.1`'s service and `7.1`'s helpers). Wave 3 wires the backend routes (`4.1`, needing `2.1`/`3.1`) and the `VoteButton` (`10.1`, needing `8.1`/`9.1`/`7.1`), plus the hook's tests. Wave 4 runs the route integration tests and the VoteButton tests. Waves 5-6 integrate the button into `FeatureCard` and `FeatureDetailsPage` (separate files, so they share a wave) and then their tests. The README (`15.1`) is last. Files touched more than once are kept in separate waves: `feature_service.py` is written by `2.1` only (wave 1; `3.1` writes `feature.py`, a different file); `features.py` is written only by `4.1` (wave 3), after the service function and model field it depends on are in place; `FeatureCard.jsx` (`12.1`) and `FeatureDetailsPage.jsx` (`13.1`) are distinct files sharing wave 5, with their tests pushed to wave 6.
