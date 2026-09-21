# Requirements Document

## Introduction

This specification covers Sprint 3 of the Feature Request & Public Roadmap Portal: the Atomic Voting Engine. Sprint 0 delivered the scaffolding, Sprints 1A/1B delivered complete authentication (JWT access/refresh, email-verification simulation, password reset, RBAC, `get_current_user`/`get_optional_current_user`/`require_verified_user`/`get_current_admin`/`require_admin` middleware), Sprint 2A delivered the `features` collection, `Feature_Service`, the versioned `Feature_API` (create/feed/get/update/delete), and the frontend feed, and Sprint 2B delivered the polished `FeatureDetailsPage`, the shared markdown pipeline, `FeatureDetailResponse`/`RelatedFeatureCard`, `get_related_features()`, and `get_optional_current_user`. The persisted feature document already carries a `votes` array (defaulting to `[]`) and a `vote_count` integer (defaulting to `0`) from Sprint 2A; no voting behavior reads or writes those fields yet.

This sprint builds the voting engine on top of that foundation: an atomic `toggle_vote()` `Feature_Service` function that adds or removes the requesting user's id from a feature's `votes` array and adjusts `vote_count` in a single MongoDB operation per branch, a `has_voted` field added to the two read response schemas (`FeatureFeedResponse` and `FeatureDetailResponse`) computed from the optional current user, two new `Feature_API` routes (`POST /api/v1/features/{feature_id}/vote` and `GET /api/v1/features/{feature_id}/vote-status`), a new frontend `Vote_Service` and a `Vote_Hook` with optimistic cache updates and rollback, a reusable `VoteButton` integrated into both `FeatureCard` and `FeatureDetailsPage`, a `LoginRequiredModal` for guests, a hand-rolled vote animation respecting `prefers-reduced-motion`, and a loading/double-click-guard state.

This spec preserves the Sprint 0/1A/1B/2A/2B architecture exactly: strict layering (routes → services → database), the `{success, message, data}` / `{success, message, errors}` response envelope, the `FeatureException` family and its single-handler-per-family registration in `main.py`, `Feature_Service` as the sole owner of the `features` collection, the auth middleware dependencies, and `Feature_Hooks`' existing hook signatures and query keys. `GET /api/v1/features` (the Feed_Endpoint) keeps its `PaginatedFeatureResponse` pagination structure unchanged, `Feature_Hooks`' (`useFeatures.js`) exported hook names/signatures/query keys are not modified, and `FeatureCard`'s existing layout is preserved. This spec does not cover threaded comments, the admin dashboard, Kanban drag-and-drop, the roadmap page, notifications, or an activity feed — those remain scoped to later sprints (see Non-Goals).

## Glossary

- **Backend_Application**: The FastAPI application located in `backend/app/` (established in Sprint 0, extended in Sprints 1A/1B/2A/2B).
- **Frontend_Application**: The React + Vite single-page application located in `frontend/src/` (established in Sprint 0, extended in Sprints 1A/1B/2A/2B).
- **Feature_Model**: The module `backend/app/models/feature.py`, established in Sprint 2A, extended in this sprint with a `has_voted` field on `FeatureFeedResponse` and `FeatureDetailResponse`.
- **Feature_Service**: The module `backend/app/services/feature_service.py`, the sole module permitted to read from or write to the `features` collection, extended in this sprint with `toggle_vote()` and a `has_voted` computation helper.
- **Feature_API**: The FastAPI router mounted at `/api/v1/features`, established in Sprint 2A, extended in this sprint with the Vote_Endpoint and Vote_Status_Endpoint.
- **Vote_Endpoint**: The new Feature_API route handler for `POST /api/v1/features/{feature_id}/vote`, which toggles the requesting user's vote on a feature and returns the resulting `voted`/`vote_count`.
- **Vote_Status_Endpoint**: The new Feature_API route handler for `GET /api/v1/features/{feature_id}/vote-status`, which returns the requesting user's current vote state on a feature.
- **Feed_Endpoint**: The Feature_API route handler for `GET /api/v1/features`, established in Sprint 2A. Its pagination structure (`PaginatedFeatureResponse`) is not modified by this sprint; its per-item schema (`FeatureFeedResponse`) grows a `has_voted` field per Requirement 5.
- **Get_Feature_Endpoint**: The Feature_API route handler for `GET /api/v1/features/{feature_id}`, extended in Sprint 2B to return `FeatureDetailResponse`; its response schema grows a `has_voted` field per Requirement 6.
- **toggle_vote**: The new `Feature_Service` function `toggle_vote(feature_id, user_id)` that atomically adds or removes `user_id` from a feature's `votes` array and adjusts `vote_count` accordingly, returning the resulting vote state.
- **votes**: The array of user-id strings persisted on each feature document (established in Sprint 2A, defaulting to `[]`), the authoritative record of who has voted for a feature. This sprint introduces the first behavior that reads or writes this field. No separate `votes` collection is introduced.
- **vote_count**: The integer persisted on each feature document (established in Sprint 2A, defaulting to `0`) recording the number of votes; this sprint maintains the invariant that `vote_count` equals `len(votes)` on every persisted document after any voting operation.
- **has_voted**: The new boolean field added to `FeatureFeedResponse` and `FeatureDetailResponse`, computed server-side as whether the resolved optional current user's id is present in the feature's `votes` array; `false` for a guest (no authenticated user).
- **require_verified_user**: The Sprint 1B auth dependency that resolves the current authenticated user and raises HTTP 403 when the user's `is_verified` field is not `true`; it depends on `get_current_user`, which raises HTTP 401 for a missing/invalid Bearer token. Reused unchanged by the Vote_Endpoint and Vote_Status_Endpoint.
- **get_optional_current_user**: The Sprint 2B auth dependency that resolves the current user for a valid Bearer access token and resolves to `None` (never raises) otherwise. Reused unchanged for `has_voted` computation on the public Feed_Endpoint and Get_Feature_Endpoint reads.
- **AlreadyVotedException**, **VoteFailedException**: The two new `FeatureException` subclasses added in this sprint (not `AuthException` subclasses), translated to the error envelope by `main.py`'s single existing `FeatureException` handler with no per-exception handler added.
- **FeatureNotFoundException**: The existing `FeatureException` subclass (HTTP 404) reused when a vote/vote-status request names a `feature_id` that does not match any persisted document.
- **Vote_Service**: The new frontend module `frontend/src/services/featureVoteService.js`, exposing `toggleVote(featureId)` and `getVoteStatus(featureId)`; a sibling of the unmodified `featureService.js`.
- **Vote_Hook**: The new frontend module `frontend/src/hooks/useFeatureVote.js`, exposing `useToggleVote()`, a React Query mutation hook implementing optimistic updates, rollback, and cache invalidation; a sibling of the unmodified `useFeatures.js`.
- **Feature_Hooks**: The module `frontend/src/hooks/useFeatures.js`, established in Sprint 2A (`useFeatureFeed` keyed `["features", params]`, `useFeature` keyed `["feature", featureId]`, plus mutation hooks). Its exported hook names, signatures, and query keys are not modified by this sprint.
- **VoteButton**: The new reusable component `frontend/src/components/VoteButton.jsx`, rendering a feature's vote count and an activatable arrow control with distinct guest / verified-user / already-voted / loading states.
- **LoginRequiredModal**: The new component `frontend/src/components/LoginRequiredModal.jsx`, shown when a guest activates a VoteButton, offering Login / Signup / Cancel actions with no automatic redirect.
- **FeatureCard**: The component `frontend/src/components/FeatureCard.jsx`, established in Sprint 2A; modified in this sprint only to render a VoteButton, with its existing layout otherwise preserved.
- **FeatureDetailsPage**: The component `frontend/src/pages/FeatureDetailsPage.jsx`, rewritten in Sprint 2B; modified in this sprint only to render a VoteButton in its header.
- **AuthContext**: Established in Sprint 1A/1B (`useAuth()` returning `{ user, isAuthenticated, loading, login, logout, signup }`); `user.id`, `user.role`, and `user.is_verified` are read by VoteButton to choose its guest / verified / unverified rendering state.

## Requirements

### Backend: Vote Model Extension

#### Requirement 1: Vote Fields on the Feature Document

**User Story:** As a backend developer, I want voting to reuse the existing `votes` array and `vote_count` integer on the feature document, so that no separate votes collection or schema migration is required.

##### Acceptance Criteria

1. THE Feature_Service SHALL record votes exclusively in the existing feature document's `votes` array (a list of user-id strings) and `vote_count` integer, both established in Sprint 2A, and SHALL NOT introduce a separate `votes` collection or any new persisted collection.
2. THE Feature_Service SHALL store each voting user's id in the `votes` array at most once, so that the array never contains a duplicate entry for the same user id regardless of how many vote requests that user issues.
3. THE Feature_Service SHALL maintain the invariant that a feature document's `vote_count` equals the length of that document's `votes` array (`vote_count == len(votes)`) after every completed voting operation.
4. THE Feature_Model SHALL NOT expose the raw `votes` array in any Feature_API response, preserving Sprint 2A's `FeatureResponse.from_mongo` omission of `votes`; only the derived `vote_count` and the per-viewer `has_voted` boolean SHALL be exposed.

#### Requirement 2: Atomic Vote Toggle

**User Story:** As a user, I want my vote to toggle on and off reliably even under concurrent requests, so that my vote is never double-counted and the count never drifts from reality.

##### Acceptance Criteria

1. THE Feature_Service SHALL provide a function `toggle_vote(feature_id, user_id)` that adds the given `user_id` to the feature's `votes` array and increments `vote_count` when the user has not already voted, and removes the given `user_id` from the `votes` array and decrements `vote_count` when the user has already voted.
2. WHEN a user who has not already voted for a feature calls `toggle_vote`, THE Feature_Service SHALL perform the add-and-increment as a single atomic MongoDB update operation whose filter requires that the `user_id` is not already present in the `votes` array, applying `$addToSet` on `votes` and `$inc` of `+1` on `vote_count` together in that one operation.
3. WHEN a user who has already voted for a feature calls `toggle_vote`, THE Feature_Service SHALL perform the remove-and-decrement as a single atomic MongoDB update operation whose filter requires that the `user_id` is present in the `votes` array, applying `$pull` on `votes` and `$inc` of `-1` on `vote_count` together in that one operation.
4. THE Feature_Service's `toggle_vote` SHALL request the post-update document from its atomic operation (find-one-and-update returning the updated document) and SHALL derive its return value from that post-update document, so that the returned `vote_count` reflects the state after the operation rather than a separately re-read value.
5. THE Feature_Service's `toggle_vote` SHALL return a mapping containing `voted` (a boolean: `true` when the operation added the user's vote, `false` when it removed the user's vote) and `vote_count` (the feature's `vote_count` after the operation).
6. IF `toggle_vote` is called with a `feature_id` that does not match any persisted feature document, THEN THE Feature_Service SHALL raise `FeatureNotFoundException`, distinguishing this case from the concurrent-state-change case in Requirement 2.7 by first confirming the feature exists.
7. IF a `toggle_vote` atomic update matches no document because the feature's vote state changed between reading the current state and issuing the conditional write (for example, a concurrent identical request already added or removed the same user's vote), THEN THE Feature_Service SHALL raise `AlreadyVotedException` rather than retrying blindly, silently corrupting the count, or creating a duplicate entry, so that the caller receives a defined outcome for the lost-race case.

### Backend: Vote Authorization

#### Requirement 3: Vote Write Authorization

**User Story:** As a platform operator, I want only authenticated, verified users to be able to vote, so that anonymous or unverified accounts cannot inflate vote counts.

##### Acceptance Criteria

1. THE Vote_Endpoint SHALL depend on `require_verified_user`, reused unchanged from Sprint 1B, so that voting requires both an authenticated user and a verified account.
2. IF the Vote_Endpoint receives a request with no `Authorization` header or with an invalid Bearer token (missing, malformed, expired, wrong `type` claim, or an unresolvable `sub`), THEN THE Feature_API SHALL respond with HTTP status 401 and an error envelope, via the `UnauthorizedException` raised by `get_current_user` (on which `require_verified_user` depends), unchanged from Sprint 1A/1B behavior.
3. IF the Vote_Endpoint receives a request from an authenticated user whose `is_verified` field is not `true`, THEN THE Feature_API SHALL respond with HTTP status 403 and an error envelope, via the `UnauthorizedException` raised by `require_verified_user`, unchanged from Sprint 1B behavior.
4. THE Vote_Status_Endpoint SHALL depend on `require_verified_user` for the same reason, so that a caller must be an authenticated, verified user to query their own vote state, responding with HTTP 401 for a missing/invalid token and HTTP 403 for an unverified user, identically to Requirement 3.2 and 3.3.

### Backend: Vote API Routes

#### Requirement 4: Vote and Vote-Status Endpoints

**User Story:** As a frontend developer, I want a vote-toggle endpoint and a vote-status endpoint, so that the UI can cast a vote and read the current user's vote state.

##### Acceptance Criteria

1. THE Feature_API SHALL expose a route `POST /api/v1/features/{feature_id}/vote` (the Vote_Endpoint) that resolves the requesting verified user, calls `toggle_vote(feature_id, str(current_user["_id"]))`, and on success responds with HTTP status 200 and a success envelope whose `data` contains `voted` (boolean) and `vote_count` (integer) exactly as returned by `toggle_vote`.
2. THE Feature_API SHALL expose a route `GET /api/v1/features/{feature_id}/vote-status` (the Vote_Status_Endpoint) that resolves the requesting verified user and responds with HTTP status 200 and a success envelope whose `data` contains `has_voted` (boolean, whether the resolving user's id is present in the feature's `votes` array) and `vote_count` (the feature's current `vote_count`).
3. IF the Vote_Endpoint or Vote_Status_Endpoint receives a request for a `feature_id` that does not match any persisted feature document, THEN THE Feature_API SHALL respond with HTTP status 404 and an error envelope via the propagated `FeatureNotFoundException`.
4. THE Vote_Endpoint and Vote_Status_Endpoint route handlers SHALL remain thin, delegating all vote logic to `Feature_Service` and all authorization to `require_verified_user`, containing no inline database query, no inline authorization check, and no inline `error_response()` construction, matching Sprint 2A's Feature_API layering (Sprint 2A Requirement 27.1-27.3).
5. THE Vote_Endpoint and Vote_Status_Endpoint SHALL be registered on the existing `/features` router in `backend/app/api/v1/features.py`, and their addition SHALL NOT modify the existing create/feed/get/update/delete route handlers on that router.

### Backend: Read Response Enhancement

#### Requirement 5: Feed Response `has_voted`

**User Story:** As a user browsing the feed, I want each feature card to reflect whether I have already voted for it, so that my vote state is visible without opening each feature.

##### Acceptance Criteria

1. THE Feature_Model SHALL extend `FeatureFeedResponse` with a `has_voted` boolean field, added without removing, renaming, or retyping any existing `FeatureFeedResponse` field.
2. WHEN the Feed_Endpoint serializes a feature for a request whose resolved optional current user's id is present in that feature's `votes` array, THE Feed_Endpoint SHALL set `has_voted` to `true` for that feature.
3. WHEN the Feed_Endpoint serializes a feature for a request whose resolved optional current user's id is not present in that feature's `votes` array, or for a request with no authenticated user (a guest), THE Feed_Endpoint SHALL set `has_voted` to `false` for that feature.
4. THE Feed_Endpoint SHALL resolve the requesting user, if any, via `get_optional_current_user` (Sprint 2B), so that computing `has_voted` does not impose an authentication requirement on the publicly accessible feed and a guest request never raises.
5. THE Feed_Endpoint SHALL continue to return `PaginatedFeatureResponse` with its existing `items`/`pagination` structure, and the addition of `has_voted` SHALL NOT change the `PaginationMeta` shape, the page size, the sort/filter/search behavior, or the `items` array's ordering established in Sprint 2A.

#### Requirement 6: Feature Detail Response `has_voted`

**User Story:** As a user viewing a feature's details, I want the page to reflect whether I have already voted for it, so that the vote control shows the correct active state on load.

##### Acceptance Criteria

1. THE Feature_Model SHALL extend `FeatureDetailResponse` with a `has_voted` boolean field, added without removing, renaming, or retyping any existing `FeatureDetailResponse` field (including the Sprint 2B `is_owner`/`is_admin`/`related_features` fields).
2. WHEN the Get_Feature_Endpoint serializes a feature for a request whose resolved optional current user's id is present in that feature's `votes` array, THE Get_Feature_Endpoint SHALL set `has_voted` to `true`.
3. WHEN the Get_Feature_Endpoint serializes a feature for a request whose resolved optional current user's id is not present in that feature's `votes` array, or for a request with no authenticated user (a guest), THE Get_Feature_Endpoint SHALL set `has_voted` to `false`.
4. THE Get_Feature_Endpoint SHALL resolve the requesting user, if any, via `get_optional_current_user` (already its Sprint 2B dependency), and SHALL NOT change any other field of the `FeatureDetailResponse` it returns beyond adding `has_voted`.

### Backend: Vote Exceptions

#### Requirement 7: Vote Exception Family

**User Story:** As a frontend developer, I want vote failures to return the same consistent JSON error envelope as every other feature-domain error, so that the client can handle them uniformly.

##### Acceptance Criteria

1. THE Backend_Application SHALL define `AlreadyVotedException` and `VoteFailedException` as subclasses of the existing `FeatureException` base class (carrying `status_code`/`message`/`errors`), and SHALL NOT define them as subclasses of `AuthException`.
2. THE `AlreadyVotedException` SHALL map to an HTTP status code representing a conflicting/duplicate voting state (HTTP 409), used defensively for the lost-race case in Requirement 2.7.
3. THE `VoteFailedException` SHALL map to an HTTP status code representing an unexpected voting failure (HTTP 500), used when a voting operation cannot be completed for a reason other than a not-found feature or an already-resolved concurrent toggle.
4. WHEN any of `AlreadyVotedException`, `VoteFailedException`, or the reused `FeatureNotFoundException` is raised during a vote or vote-status request, THE Feature_API SHALL translate it to the `{success: false, message, errors}` error envelope via `main.py`'s single existing `@app.exception_handler(FeatureException)` handler, and this sprint SHALL NOT add a per-exception handler for any member of the vote exception family.

### Frontend: Vote Service

#### Requirement 8: Frontend Vote Service

**User Story:** As a frontend developer, I want a dedicated vote service module, so that vote HTTP calls live alongside the existing feature service without modifying it.

##### Acceptance Criteria

1. THE Frontend_Application SHALL define `Vote_Service` in a new file `frontend/src/services/featureVoteService.js`, and SHALL NOT modify `frontend/src/services/featureService.js` to add vote logic.
2. THE Vote_Service SHALL expose `toggleVote(featureId)` that issues `POST /api/v1/features/{featureId}/vote` through the shared `httpClient` and resolves to the response's `data` payload (`{ voted, vote_count }`).
3. THE Vote_Service SHALL expose `getVoteStatus(featureId)` that issues `GET /api/v1/features/{featureId}/vote-status` through the shared `httpClient` and resolves to the response's `data` payload (`{ has_voted, vote_count }`).
4. THE Vote_Service SHALL use the same shared `httpClient` (with its access-token and refresh-interceptor behavior) that `featureService.js` uses, so that vote requests carry authentication identically to every other authenticated request.

### Frontend: Vote Hook and Optimistic Update

#### Requirement 9: React Query Vote Hook

**User Story:** As a frontend developer, I want a React Query vote mutation hook, so that voting integrates with the existing query cache without duplicating cache logic.

##### Acceptance Criteria

1. THE Frontend_Application SHALL define `Vote_Hook` in a new file `frontend/src/hooks/useFeatureVote.js` exposing `useToggleVote()`, and SHALL NOT modify `frontend/src/hooks/useFeatures.js` or change any existing hook's name, signature, or React Query key.
2. THE `useToggleVote()` hook SHALL return a React Query mutation whose `mutationFn` calls `Vote_Service.toggleVote(featureId)`.
3. THE `useToggleVote()` hook SHALL implement the React Query mutation lifecycle callbacks `onMutate`, `onError`, and `onSettled` to provide the optimistic-update, rollback, and invalidation behavior defined in Requirements 10 and 17.

#### Requirement 10: Optimistic Vote Update and Rollback

**User Story:** As a user, I want my vote to appear applied instantly, so that the interface feels responsive even before the server confirms.

##### Acceptance Criteria

1. WHEN a user activates a vote and `useToggleVote()`'s mutation begins, THE Vote_Hook's `onMutate` SHALL cancel any in-flight queries for the affected `["feature", featureId]` and `["features", ...]` query keys, snapshot their current cached values, and write an optimistic update that toggles `has_voted` and increments (when currently not voted) or decrements (when currently voted) `vote_count` for the affected feature, before the mutation's network request resolves.
2. THE Vote_Hook's `onMutate` SHALL apply the optimistic update to the `["feature", featureId]` cache entry (when present) and to every `["features", ...]` feed page cache entry whose `items` include the affected feature, via `queryClient.setQueryData`, so that a vote cast from either the details view or the feed is reflected in both caches.
3. IF `useToggleVote()`'s mutation fails (a rejected request for any reason), THEN THE Vote_Hook's `onError` SHALL restore every cache entry snapshotted in `onMutate` to its pre-mutation value, so that a failed vote leaves the displayed count and `has_voted` state exactly as they were before the optimistic update.
4. IF `useToggleVote()`'s mutation fails, THEN the failure path SHALL surface an error Toast via Sonner, describing that the vote could not be recorded, in addition to rolling back the cache per Requirement 10.3.
5. THE Vote_Hook's optimistic update SHALL be derived from the affected feature's currently cached `has_voted`/`vote_count` values, so that a decrement never drives `vote_count` below zero for a feature whose cached state is internally consistent.

### Frontend: Vote Button and Integrations

#### Requirement 11: Vote Button Component

**User Story:** As a user, I want a clear vote button that shows the current count and my vote state, so that I can see and change my vote at a glance.

##### Acceptance Criteria

1. THE Frontend_Application SHALL define `VoteButton` in a new file `frontend/src/components/VoteButton.jsx`, accepting at minimum the feature's `id`, current `vote_count`, and current `has_voted` state, and displaying an upvote arrow icon alongside the current vote count.
2. WHEN the current viewer is not authenticated (a guest, per `AuthContext`), THE VoteButton SHALL render in a guest state whose activation opens the LoginRequiredModal (Requirement 14) rather than issuing a vote request.
3. WHEN the current viewer is an authenticated, verified user who has not voted for the feature (`has_voted` is `false`), THE VoteButton SHALL render in an inactive state whose activation casts a vote via `useToggleVote()`.
4. WHEN the current viewer is an authenticated, verified user who has already voted for the feature (`has_voted` is `true`), THE VoteButton SHALL render in a visually distinct active state (a hover state distinct from the active state, and an active state distinct from the inactive state) whose activation removes the vote via `useToggleVote()`.
5. WHILE `useToggleVote()`'s mutation is pending for the feature the VoteButton represents, THE VoteButton SHALL render a loading state, SHALL be disabled, and SHALL show a spinner, per Requirement 16.
6. THE VoteButton SHALL read the current viewer's authentication and verification state from `AuthContext`'s `useAuth()` (`user`, `isAuthenticated`, `user.is_verified`) to choose between its guest, inactive, and active rendering states.

#### Requirement 12: Feed Integration

**User Story:** As a user browsing the feed, I want to vote directly from a feature card, so that I can support ideas without opening each one.

##### Acceptance Criteria

1. THE FeatureCard SHALL render a VoteButton for its feature, wired to the feature's `vote_count` and `has_voted` fields from the feed item.
2. WHEN a user votes from a FeatureCard, THE FeatureCard's displayed vote count and vote state SHALL update immediately from the optimistically updated `["features", ...]` cache (Requirement 10.2), without a full page reload and without a full feed refetch triggered by the vote itself (Requirement 17).
3. THE addition of a VoteButton to FeatureCard SHALL preserve FeatureCard's existing layout — its title, description preview, category/status badges, author/date/count metadata line, "View Details" link, and author-gated Edit / author-or-admin-gated Delete controls SHALL remain present and in their existing arrangement, with the VoteButton added rather than replacing any of them.

#### Requirement 13: Detail Page Integration

**User Story:** As a user viewing a feature's details, I want to vote from the header, so that voting is a primary action on the page.

##### Acceptance Criteria

1. THE FeatureDetailsPage SHALL render a VoteButton in its header region, wired to the feature's `vote_count` and `has_voted` fields from `FeatureDetailResponse`.
2. WHEN a user votes from the FeatureDetailsPage, THE FeatureDetailsPage's header vote count and vote state SHALL update immediately from the optimistically updated `["feature", featureId]` cache (Requirement 10.2), and the corresponding feed cache entries SHALL also reflect the change (Requirement 17), without a full page reload.
3. THE addition of a VoteButton to FeatureDetailsPage SHALL preserve the Sprint 2B section order and the ownership-gated Edit/Delete controls, adding the VoteButton to the header rather than replacing any existing section or control.

#### Requirement 14: Guest Login Modal

**User Story:** As a guest, I want a clear prompt to log in when I try to vote, so that I understand why my vote did not register and how to proceed.

##### Acceptance Criteria

1. THE Frontend_Application SHALL define `LoginRequiredModal` in a new file `frontend/src/components/LoginRequiredModal.jsx`.
2. WHEN a guest (unauthenticated viewer) activates a VoteButton, THE VoteButton SHALL open the LoginRequiredModal and SHALL NOT issue a vote request.
3. THE LoginRequiredModal SHALL display the message `Log in to vote for feature requests.` and SHALL render a Login action, a Signup action, and a Cancel action.
4. WHEN a guest activates the LoginRequiredModal's Login or Signup action, THE LoginRequiredModal SHALL navigate to the corresponding route (`/login` or `/signup`) only in response to that explicit activation, and SHALL NOT redirect automatically on open.
5. WHEN a guest activates the LoginRequiredModal's Cancel action, THE LoginRequiredModal SHALL close and return the viewer to the page they were on, without navigating away and without casting a vote.

#### Requirement 15: Vote Animation

**User Story:** As a user, I want a subtle animation when I vote, so that the action feels satisfying without being distracting.

##### Acceptance Criteria

1. WHEN a user casts or removes a vote via the VoteButton, THE VoteButton SHALL play a lightweight animation consisting of a button scale change, a vote-count transition, and a color transition between its inactive and active states.
2. THE VoteButton's animation SHALL be implemented with hand-rolled CSS (CSS transitions/keyframes), and the Frontend_Application SHALL NOT add any animation library to implement it.
3. WHILE the user's environment reports the `prefers-reduced-motion: reduce` preference, THE VoteButton SHALL suppress its scale and count-transition animation, applying the vote's visual state change without motion.

#### Requirement 16: Loading State and Double-Click Guard

**User Story:** As a user, I want the vote button to be unresponsive to repeated clicks while my vote is being recorded, so that I do not accidentally toggle my vote multiple times.

##### Acceptance Criteria

1. WHILE `useToggleVote()`'s mutation is pending for a given feature, THE VoteButton for that feature SHALL be disabled and SHALL display a spinner in place of, or alongside, its arrow icon.
2. WHILE the VoteButton is in its disabled pending state, THE VoteButton SHALL ignore additional activation attempts, so that a rapid sequence of clicks issues at most one in-flight vote request at a time for that feature.
3. WHEN `useToggleVote()`'s mutation settles (success or failure), THE VoteButton SHALL leave its disabled pending state and become activatable again.

#### Requirement 17: Cache Sync Without Full Refetch

**User Story:** As a user, I want my vote to be reflected everywhere the feature appears, without the feed reloading or losing my place, so that voting feels seamless.

##### Acceptance Criteria

1. WHEN a user votes from either the feed or the details view, THE Vote_Hook SHALL synchronize the change across both the `["feature", featureId]` cache entry and every `["features", ...]` feed page cache entry containing the feature, using `queryClient.setQueryData` cache edits only (Requirement 10.2), rather than issuing an immediate full feed refetch as the mechanism for propagating the change.
2. THE Vote_Hook's `onSettled` SHALL invalidate the affected `["feature", featureId]` and `["features", ...]` query keys so the caches eventually reconcile with the server, but SHALL NOT force an immediate synchronous full feed refetch that would replace the optimistically updated feed page before the user's current interaction completes.
3. WHEN a vote is cast, THE Frontend_Application SHALL NOT trigger a full page reload of the feed or the details page.

#### Requirement 18: URL and Feed State Stability

**User Story:** As a user, I want voting to leave my search, filters, page, and scroll position untouched, so that I do not lose my place in the feed.

##### Acceptance Criteria

1. WHEN a user votes from the feed, THE Frontend_Application SHALL NOT modify the current URL's query parameters (search term, category/status filters, sort, or page), because the Vote_Hook edits the existing feed cache in place (Requirement 17.1) rather than re-issuing a feed query with fresh parameters.
2. WHEN a user votes from the feed, THE Frontend_Application SHALL NOT reset the feed's scroll position, because no feed remount or full refetch is triggered by the vote (Requirement 17.2, 17.3).
3. THE Vote_Hook SHALL NOT read from or write to the feed's URL query parameters (`useFeedQueryParams`/`useSearchParams`), so that the vote flow is decoupled from feed navigation state entirely.

#### Requirement 19: Error Recovery

**User Story:** As a user, I want a failed vote to restore the previous state and tell me what happened, so that the interface never shows a vote that did not actually register.

##### Acceptance Criteria

1. IF a vote request fails with any error status (for example 401, 403, 404, or 500), THEN THE Vote_Hook SHALL roll back every optimistically updated cache entry to its pre-vote snapshot (Requirement 10.3), leaving the displayed count and vote state consistent with the server's actual state.
2. IF a vote request fails, THEN the failure path SHALL display a Sonner error Toast describing that the vote could not be recorded (Requirement 10.4).
3. AFTER a failed vote's rollback and error Toast, THE VoteButton SHALL return to its pre-vote activatable state (Requirement 16.3), so that the user can retry, and the displayed vote count and `has_voted` state SHALL match the pre-vote values.

## Non-Goals

The following are explicitly out of scope for Sprint 3 and SHALL NOT be designed, implemented, or given tasks in this spec:

- **Threaded comments.** No comment model, comment endpoints, comment components, or comment hooks. Comments remain scoped to Sprint 4.
- **Admin dashboard.** No admin moderation UI, no admin-only vote or feature management surface.
- **Kanban roadmap board.** No drag-and-drop status board and no status-change controls.
- **Public roadmap page.** No new roadmap route or roadmap-specific views.
- **Notifications.** No vote notifications, no notification model, endpoints, or UI.
- **Activity feed.** No per-user or global activity/history feed of votes or other actions.

Additionally, this sprint preserves the Sprint 0–2 architecture unchanged:

- The Feed_Endpoint's pagination structure (`PaginatedFeatureResponse`/`PaginationMeta`, page size, sort/filter/search behavior, item ordering) is preserved; only a `has_voted` field is added to each `FeatureFeedResponse` item.
- `Feature_Hooks`' (`useFeatures.js`) exported hook names, signatures, and React Query keys (`["features", params]`, `["feature", featureId]`) are not modified; the new vote hook lives in a separate `useFeatureVote.js`.
- `featureService.js` is not modified; the new vote service lives in a separate `featureVoteService.js`.
- `FeatureCard`'s existing layout is preserved; the VoteButton is added, not substituted for any existing element.
- The `{success, message, data}` / `{success, message, errors}` envelope, the `FeatureException` family and its single-handler-per-family registration in `main.py`, strict routes → services → database layering, and `Feature_Service` as the sole owner of the `features` collection are all reused exactly as established.
