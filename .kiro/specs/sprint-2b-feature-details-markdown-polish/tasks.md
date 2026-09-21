# Implementation Plan: Sprint 2B - Feature Details, Markdown Editor & UI Polish

## Overview

This plan builds the polished Feature Details experience on top of Sprint 2A's `features` collection, `Feature_Service`, `Feature_API`, and frontend feed, following the design's layering: backend first (`Feature_Model` schemas `FeatureDetailResponse`/`RelatedFeatureCard` → `Markdown_Sanitizer` and its single `Feature_Service` call-site integration → `get_related_features()` → `get_optional_current_user` → the updated `get_feature_route`) → backend checkpoint, then the frontend markdown pipeline (`remark-gfm` dependency → `badgeColors.js` → `MarkdownRenderer`/`markdown.css` → `toolbarActions.js` → `MarkdownEditor`) → the small reusable presentational pieces (`AuthorCard`, `StatusTimeline`, `RelatedFeatures`, `ShareButton`/`copyToClipboard`, `Placeholders`, the three skeletons, `FeatureNotFoundState`) → the `CreateFeatureModal`/`EditFeatureModal` upgrade to `MarkdownEditor` → the `FeatureDetailsPage` rewrite that composes everything with loading/error/404 states, a sticky action bar, and accessibility behavior → frontend checkpoint, finished by README documentation. Each layer is implemented and tested before the layer above it depends on it, mirroring Sprint 2A's approach. No voting, threaded comments, admin dashboard, Kanban drag-and-drop, or roadmap status-change controls are included, per the Non-Goals in requirements.md. The Feed_Endpoint, the Create/Update/Delete_Feature_Endpoint contracts, `App.jsx`'s route table (the `features/:featureId` route already exists from Sprint 2A), and `Feature_Hooks`' exported signatures/query keys are not modified by any task in this plan, per design.md's "preserved unchanged" list.

## Tasks

- [x] 1. Implement Feature_Model schema extensions
  - [x] 1.1 Extend `backend/app/models/feature.py`
    - Add `RelatedFeatureCard` (`id`, `title`, `status`, `category`, `vote_count`, `created_at`, with `from_mongo`) and `FeatureDetailResponse` (subclasses `FeatureResponse`, adding `is_owner: bool`, `is_admin: bool`, `related_features: list[RelatedFeatureCard]`, with a `from_mongo(doc, *, current_user, related)` classmethod computing `is_owner`/`is_admin` from identity/role equality)
    - _Requirements: 1.1, 2.8_
  - [ ]* 1.2 Write property test for `is_owner`/`is_admin` identity/role equality
    - **Property 1: `is_owner`/`is_admin` reflect exact identity/role equality**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5**

- [x] 2. Implement Markdown_Sanitizer and its Feature_Service integration
  - [x] 2.1 Implement `backend/app/utils/markdown_sanitizer.py`
    - `sanitize_markdown(raw: str) -> str` removing/neutralizing `script`/`style`/`iframe`/`object`/`embed` tags, `on*` event-handler attributes, and `javascript:`-scheme `href`/`src` attribute values
    - _Requirements: 3.4_
  - [x] 2.2 Integrate `sanitize_markdown` into `backend/app/services/feature_service.py` at a single shared call site
    - Apply sanitization identically regardless of whether the field is being persisted (`create_feature`/`update_feature`) or read back (`find_by_id`/`get_feed`/`get_related_features`), so no code path returns a differently-sanitized copy of `description_markdown`
    - _Requirements: 3.6_
  - [ ]* 2.3 Write property test for sanitizer neutralization and call-site independence
    - **Property 7: `Markdown_Sanitizer` neutralizes dangerous constructs and is call-site-independent**
    - **Validates: Requirements 3.4, 3.6**

- [x] 3. Implement get_related_features
  - [x] 3.1 Implement `get_related_features(feature_id, category, limit=4)` in `backend/app/services/feature_service.py`
    - Query by `category`, exclude `feature_id`, sort by `created_at` descending with `_id` descending as tiebreaker, cap at `limit`, return `[]` on zero matches; reuse the existing `category`/`created_at` indexes, no new index
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.9_
  - [ ]* 3.2 Write property test for selection, exclusion, and deterministic ordering
    - **Property 3: `get_related_features` selects, excludes, and orders deterministically**
    - **Validates: Requirements 2.2, 2.3, 2.4**
  - [ ]* 3.3 Write property test for the limit cap and no-padding-across-categories behavior
    - **Property 4: `get_related_features` never exceeds `limit` and never pads across categories**
    - **Validates: Requirements 2.1, 2.5, 2.6**

- [x] 4. Implement get_optional_current_user
  - [x] 4.1 Add `get_optional_current_user` to `backend/app/middleware/auth.py`
    - Resolves the current user for a valid Bearer access token; resolves to `None` (never raises) for a missing header, non-Bearer scheme, malformed/expired token, wrong `type` claim, or an unresolvable `sub`; does not `Depends` on `get_current_user`
    - _Requirements: 1.6_
  - [ ]* 4.2 Write property test for the optional-auth dependency's never-raises guarantee
    - **Property 2: The optional-current-user dependency never raises**
    - **Validates: Requirements 1.6**

- [x] 5. Update the Get_Feature_Endpoint
  - [x] 5.1 Update `get_feature_route` in `backend/app/api/v1/features.py`
    - Depend on `get_optional_current_user`; after resolving the feature and raising `FeatureNotFoundException` on a miss (unchanged 404 branch), call `get_related_features` with the feature's own `id`/`category`, build `FeatureDetailResponse.from_mongo(feature, current_user=current_user, related=related)`, and return it via `success_response`; do not modify the Feed_Endpoint, Create_Feature_Endpoint, Update_Feature_Endpoint, or Delete_Feature_Endpoint route handlers
    - _Requirements: 1.1, 1.6, 1.7, 1.8, 1.9, 1.10, 2.7_
  - [ ]* 5.2 Write integration tests for the updated Get_Feature_Endpoint (`backend/tests/test_feature_routes.py`)
    - Assert an authenticated owner request yields `is_owner: true`, an authenticated admin (non-owner) request yields `is_admin: true`, an unauthenticated request yields both `false`, a missing `feature_id` still yields 404 unchanged, and `related_features` reflects `get_related_features`'s result (including the zero-match empty-array case), with `feature_service`/`get_optional_current_user` mocked or overridden via `app.dependency_overrides`
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 2.7_

- [x] 6. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Add remark-gfm dependency
  - [x] 7.1 Add `remark-gfm` (exact-pinned, compatible with the project's `react-markdown@10.1.0`) to `frontend/package.json`
    - Used exclusively by `MarkdownRenderer` for GitHub-Flavored-Markdown table/list/strikethrough support
    - _Requirements: 6.3_

- [x] 8. Implement badgeColors
  - [x] 8.1 Implement `frontend/src/utils/badgeColors.js`
    - `CATEGORY_BADGE_CLASSES`/`STATUS_BADGE_CLASSES` maps and `categoryBadgeClass(category)`/`statusBadgeClass(status)` functions, the single source every consumer (FeatureDetailsPage, RelatedFeatures, StatusTimeline) imports from
    - _Requirements: 17.3_
  - [ ]* 8.2 Write property test for badge color mapping totality and determinism
    - **Property 17: Badge color mapping is total, deterministic, and single-sourced**
    - **Validates: Requirements 17.3**

- [x] 9. Implement MarkdownRenderer and markdown.css
  - [x] 9.1 Implement `frontend/src/components/markdown/MarkdownRenderer.jsx`
    - Sole `react-markdown` importer in the codebase; configures `remark-gfm`; overrides `a` (`SafeLink`, allow-listing `http:`/`https:`/`mailto:` via `isAllowedHref`, discarding `href` and rendering plain text otherwise) and `img` (`SuppressedImage`, rendering alt text only); never passes `rehype-raw`; wraps output in a `markdown-body` root class container
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.7, 6.1, 6.3, 7.2_
  - [x] 9.2 Implement `frontend/src/styles/markdown.css`
    - Single centralized stylesheet styling every Requirement 3.1-allowed element (`h1`-`h6`, `ul`/`ol`/`li`, `a`, `table`/`th`/`td`, `pre`/`code`, `blockquote`, `p`, `hr`) scoped entirely under `.markdown-body`, imported exactly once by `MarkdownRenderer`
    - _Requirements: 7.1, 7.3, 7.4_
  - [ ]* 9.3 Write property test for link-scheme allow-list enforcement
    - **Property 5: Link-scheme allow-list is enforced for every href scheme**
    - **Validates: Requirements 3.1**
  - [ ]* 9.4 Write property test for image-syntax suppression
    - **Property 6: Image syntax never produces an `<img>` element**
    - **Validates: Requirements 3.2**
  - [ ]* 9.5 Write unit tests for remark-gfm table rendering and the markdown-body root class
    - One concrete rendering example asserting a GFM table renders `<table>`/`<th>`/`<td>` elements, and that the output container carries the `markdown-body` class
    - _Requirements: 6.3, 7.2_

- [x] 10. Implement toolbarActions
  - [x] 10.1 Implement `frontend/src/components/markdown/toolbarActions.js`
    - Pure functions `wrapSelection`, `prefixLines`, `insertAtCursor`, `insertLinkPlaceholder`, and the `TABLE_TEMPLATE` constant, each operating on `{ value, selectionStart, selectionEnd }` and returning the same shape
    - _Requirements: 5.3, 5.4, 5.5, 5.6_
  - [ ]* 10.2 Write property test for span-wrapping on the whole selection
    - **Property 8: Toolbar span-wrapping applies to the whole selection as one unit, including multi-line selections**
    - **Validates: Requirements 5.3**
  - [ ]* 10.3 Write property test for collapsed-selection placeholder insertion
    - **Property 9: Collapsed-selection placeholder insertion selects the placeholder's inner span**
    - **Validates: Requirements 5.4**
  - [ ]* 10.4 Write property test for line-level prefixing versus span wrapping
    - **Property 10: Line-level toolbar actions prefix lines rather than wrapping a span**
    - **Validates: Requirements 5.5**

- [x] 11. Implement MarkdownEditor
  - [x] 11.1 Implement `frontend/src/components/MarkdownEditor.jsx`
    - Controlled `<textarea>` (`value`/`onChange` from parent) plus a `role="toolbar"` group of labeled buttons (Heading 1/2, Bold, Italic, Bullet List, Numbered List, Quote, Code Block, Link, Horizontal Rule, Table) dispatching to `toolbarActions`, refocusing the textarea after every insertion; a live-preview toggle (`aria-pressed`) defaulting to preview-enabled, rendering the preview pane through `MarkdownRenderer` on every value change; side-by-side layout at desktop width, stacked at mobile width; auto-growing height up to a shared fixed maximum, then internally scrollable; no rich-text-editor library
    - _Requirements: 5.1, 5.2, 5.7, 5.8, 6.1, 6.2, 6.4, 6.5, 8.7_
  - [ ]* 11.2 Write property test for live-preview toggling never altering the textarea value
    - **Property 11: Toggling live preview never alters the textarea's value**
    - **Validates: Requirements 6.5**
  - [ ]* 11.3 Write unit tests for MarkdownEditor's toolbar wiring and accessibility
    - Assert each toolbar button dispatches to its documented `toolbarActions` function and refocuses the textarea; assert every toolbar button carries an `aria-label`, the toolbar container has `role="toolbar"`, and the live-preview toggle exposes `aria-pressed`
    - _Requirements: 5.7, 16.4, 16.5, 16.6_

- [x] 12. Checkpoint - Ensure core markdown pipeline tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement AuthorCard
  - [x] 13.1 Implement `frontend/src/components/AuthorCard.jsx`
    - Pure presentational component accepting `authorName`/`role`/`isVerified`/`createdAt`; renders uppercased one-or-two-letter initials (or a generic person icon when the name is empty) as a circular avatar; a role badge with exactly two states (`"user"`/`"admin"`); a verified badge gated on `isVerified`; a `toLocaleDateString()`-formatted "Submitted on [date]" line; not rendered as a link
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [ ]* 13.2 Write property test for AuthorCard's pure-function avatar/badge derivation
    - **Property 13: AuthorCard's avatar and badges are a pure function of name/role/isVerified**
    - **Validates: Requirements 9.2, 9.3, 9.4**

- [x] 14. Implement StatusTimeline
  - [x] 14.1 Implement `frontend/src/components/StatusTimeline.jsx`
    - Renders the four fixed stages (Under Review, Planned, In Progress, Completed) in order; highlights the stage matching a valid `status` prop via a non-color-dependent means plus `aria-current`; highlights none on a missing/invalid `status`; read-only, no status-change control
    - _Requirements: 10.1, 10.2, 10.3, 10.5, 16.7_
  - [ ]* 14.2 Write property test for StatusTimeline's fail-safe rendering
    - **Property 14: StatusTimeline always renders four stages and highlights at most the one matching a valid status**
    - **Validates: Requirements 10.1, 10.2, 10.5**

- [x] 15. Implement RelatedFeatures
  - [x] 15.1 Implement `frontend/src/components/RelatedFeatures.jsx`
    - Renders one activatable card (link/button role, accessible name including `title`) per `related_features` entry, showing `title`/`category`/`status`/`vote_count` via `badgeColors`; navigates to `/features/{id}` on activation (push, not replace); horizontal row at >=768px, scrollable/stacked below; renders nothing when the array is empty
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
  - [ ]* 15.2 Write property test for exact-entry rendering and the empty-array case
    - **Property 15: RelatedFeatures renders exactly the given entries, or nothing when empty**
    - **Validates: Requirements 11.2, 11.3, 11.6**

- [x] 16. Implement ShareButton and copyToClipboard
  - [x] 16.1 Implement `copyToClipboard` and `frontend/src/components/ShareButton.jsx`
    - `copyToClipboard(text, { clipboard, execCommandCopy })` attempts the Clipboard API first, falling back to a temporary off-screen focused-and-selected textarea plus `document.execCommand("copy")`; `ShareButton` copies `window.location.href` (or an `url` prop), shows exactly one toast (`"Feature link copied."` on success, an error toast on failure), and carries `aria-label="Copy feature link"`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_
  - [ ]* 16.2 Write property test for ShareButton's exactly-one-toast guarantee
    - **Property 16: ShareButton fires exactly one toast, determined by whether any copy mechanism succeeded**
    - **Validates: Requirements 12.2, 12.3, 12.4, 12.5**

- [x] 17. Implement Placeholders, skeletons, and FeatureNotFoundState
  - [x] 17.1 Implement `frontend/src/components/Placeholders.jsx`
    - `VotingPlaceholder` (heading + exact text `"Voting available in Sprint 3."`) and `CommentsPlaceholder` (heading + exact text `"Threaded discussions available in Sprint 4."`); both static, non-interactive, matching the page's card styling
    - _Requirements: 13.1, 13.2, 13.3, 13.4_
  - [x] 17.2 Implement the skeleton components under `frontend/src/components/skeletons/`
    - `FeatureDetailsSkeleton.jsx`, `RelatedFeaturesSkeleton.jsx`, `MarkdownContentSkeleton.jsx`, each a pulsing/shimmering placeholder approximating the shape of the content it precedes
    - _Requirements: 14.1, 14.5_
  - [x] 17.3 Implement `frontend/src/components/FeatureNotFoundState.jsx`
    - Not-found message plus a `<Link to="/">` back to the feed
    - _Requirements: 14.2_
  - [ ]* 17.4 Write unit tests for Placeholders' fixed text and non-interactivity
    - Assert `VotingPlaceholder`/`CommentsPlaceholder` render their exact required text and contain no button/input element
    - _Requirements: 13.1, 13.2, 13.3_

- [x] 18. Upgrade CreateFeatureModal and EditFeatureModal to MarkdownEditor
  - [x] 18.1 Update `frontend/src/components/CreateFeatureModal.jsx`
    - Render `MarkdownEditor` in place of the plain textarea, passing local `description_markdown` state/setter as controlled `value`/`onChange`; render a character counter beneath it (warning state at `[9000, 10000)`, error state at `>= 10000`, never blocking typing); continue validating via the unmodified `validateFeatureForm` before calling `useCreateFeature().mutate(...)`
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_
  - [x] 18.2 Update `frontend/src/components/EditFeatureModal.jsx`
    - Render `MarkdownEditor` in place of the plain textarea, pre-filled from the target feature exactly as the Sprint 2A textarea was, with the same character counter and unmodified `validateFeatureForm` gate as CreateFeatureModal
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_
  - [ ]* 18.3 Write property test for the character counter's exact length and threshold classification
    - **Property 12: Character counter reflects exact length and classifies against documented thresholds**
    - **Validates: Requirements 8.3, 8.4, 8.5**
  - [ ]* 18.4 Write unit tests for modal draft-scoping and MarkdownEditor state preservation
    - Assert `description_markdown` survives toggling live-preview or switching focus while a modal stays mounted; assert `CreateFeatureModal` reopens empty and `EditFeatureModal` reopens pre-filled from persisted data after close-then-reopen; assert `validateFeatureForm`'s existing bounds still gate submission unmodified
    - _Requirements: 8.6, 8.8, 8.9_

- [x] 19. Checkpoint - Ensure all new frontend component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 20. Rewrite FeatureDetailsPage
  - [x] 20.1 Rewrite `frontend/src/pages/FeatureDetailsPage.jsx`
    - Fetch exclusively via the unmodified `useFeature(featureId)`; render the Requirement 4.1 section order (breadcrumb, title, status/category badges via `badgeColors`, `AuthorCard` with viewer-aware role/verification props sourced from `AuthContext` when `is_owner`, created/updated dates per the differs-from-created-date rule, `MarkdownRenderer`-rendered content, `ShareButton`, gated Edit/Delete buttons, `StatusTimeline`, `RelatedFeatures`, `VotingPlaceholder`, `CommentsPlaceholder`); a sticky/fixed action bar at desktop width and a full-width touch-sized button group at mobile width; Edit opens `EditFeatureModal` pre-filled, Delete opens `ConfirmDialog` before calling `useDeleteFeature()`, with success → Toast + navigate to `/` and failure → error Toast + close dialog + stay on the page; loading state renders the three skeleton components; a 404 error renders `FeatureNotFoundState`; any other error renders an inline retry state wired to `refetch()`, disabling the retry control and suppressing a second concurrent request while `isFetching`; RelatedFeatures/breadcrumb navigation pushes history entries (never replace); focus moves into and is trapped within Edit/Delete dialogs while open and returns to the triggering control on close; Tab order follows visual reading order with no `tabindex` greater than `0`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 14.1, 14.2, 14.3, 14.4, 15.2, 15.3, 15.4, 15.5, 15.6, 16.1, 16.2, 16.3, 16.8, 17.1, 17.2, 17.4, 17.5_
  - [ ]* 20.2 Write unit tests for FeatureDetailsPage's loading/404/error/retry states
    - One rendering test per state (`useFeature` mocked): loading renders the three skeletons; a 404 error renders `FeatureNotFoundState`; a non-404 error renders the retry state and calls `refetch` on retry activation without issuing a second concurrent request while `isFetching` is `true`
    - _Requirements: 14.1, 14.2, 14.3, 14.4_
  - [ ]* 20.3 Write unit tests for FeatureDetailsPage's ownership-gated controls and delete flow
    - Assert the Edit button renders iff `is_owner`, the Delete button renders iff `is_owner` or `is_admin`, a successful delete shows a success Toast and navigates to `/`, and a failed delete shows an error Toast, closes `ConfirmDialog`, and stays on the page
    - _Requirements: 4.4, 4.5, 4.6_
  - [ ]* 20.4 Write unit tests for navigation and history behavior
    - Using `MemoryRouter` history assertions: feed-card and RelatedFeatures-card navigation push a new entry (not replace); the breadcrumb always targets `/`; a "back to feed" `navigate(-1)` affordance falls back to `/` when no prior in-app history entry exists
    - _Requirements: 15.3, 15.4, 15.5, 15.6_
  - [ ]* 20.5 Write unit tests for FeatureDetailsPage's accessibility behavior
    - Assert every interactive element is reachable via Tab and activatable via Enter/Space; assert Edit/Delete dialog activation moves focus into the dialog, confines Tab/Shift+Tab within it, and returns focus to the triggering control on close; assert `StatusTimeline`'s current stage is exposed via `aria-current` or equivalent text
    - _Requirements: 16.1, 16.3, 16.7, 16.8_

- [x] 21. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 22. Write README Sprint 2B documentation
  - [x] 22.1 Update `README.md`
    - Add a "Sprint 2B Feature Details, Markdown Editor & UI Polish" section documenting the `FeatureDetailResponse` shape (including `is_owner`/`is_admin`/`related_features` and the unchanged `RelatedFeatureCard` fields), `get_related_features()`'s selection/exclusion/ordering/cap behavior, the two-layer markdown sanitization approach (`Markdown_Sanitizer` server-side defense-in-depth versus `MarkdownRenderer`'s structural client-side controls, including the link-scheme allow-list and image suppression), and the new frontend components (`MarkdownEditor`, `AuthorCard`, `StatusTimeline`, `RelatedFeatures`, `ShareButton`, the skeletons, `FeatureNotFoundState`); update the Sprint Status section to mark Sprint 2B completed
    - _Requirements: 1.1, 2.1, 3.1, 3.4, 3.6_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; they cover property tests, unit tests, and integration-style tests only.
- Property tests (1.2, 2.3, 3.2, 3.3, 4.2, 5.2, 8.2, 9.3, 9.4, 10.2, 10.3, 10.4, 11.2, 13.2, 14.2, 15.2, 16.2, 18.3) each validate exactly one Correctness Property from design.md (Properties 1-17) and use Hypothesis (backend, `max_examples=100`) or fast-check (frontend, `numRuns: 100`), matching Sprint 2A's tooling.
- Backend tests use pytest + Hypothesis + FastAPI `TestClient` against a fake in-memory Motor-like collection patched over `feature_service.db`, mirroring Sprint 2A's `test_feature_routes.py`/`feature_service` test pattern. Frontend tests use Vitest + React Testing Library + fast-check, matching Sprint 2A's `SearchBar.test.jsx`/`FeatureCard.test.jsx`-style pattern; pure functions (`toolbarActions.js`, `badgeColors.js`, the character-counter classifier, `copyToClipboard`, `AuthorCard`'s initials derivation, `MarkdownRenderer`'s `isAllowedHref`) are exercised directly with fast-check, while rendering-level tests use `render`/`screen`/`userEvent`/`MemoryRouter`.
- Checkpoints (6, 12, 19, 21) give natural points to validate the backend, the core markdown pipeline (renderer/styles/toolbar/editor), the full new frontend component set, and the full stack respectively before moving on.
- No voting, threaded comments, admin dashboard, Kanban drag-and-drop, or roadmap status-change controls are included, per the Non-Goals in requirements.md.
- The Feed_Endpoint, the Create_Feature_Endpoint/Update_Feature_Endpoint/Delete_Feature_Endpoint contracts, `App.jsx`'s route table (the `features/:featureId` route already exists from Sprint 2A), and `Feature_Hooks`' (`useFeatures.js`) exported signatures/query keys are not modified by any task in this plan.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "4.1", "7.1", "8.1", "17.1", "17.3"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.1", "4.2", "8.2", "9.1", "17.2", "17.4"] },
    { "id": 2, "tasks": ["2.3", "3.2", "3.3", "9.2", "10.1"] },
    { "id": 3, "tasks": ["5.1", "9.3", "9.4", "9.5", "10.2", "10.3", "10.4", "13.1", "14.1", "15.1", "16.1"] },
    { "id": 4, "tasks": ["5.2", "11.1", "13.2", "14.2", "15.2", "16.2"] },
    { "id": 5, "tasks": ["11.2", "11.3", "18.1", "18.2"] },
    { "id": 6, "tasks": ["18.3", "18.4", "20.1"] },
    { "id": 7, "tasks": ["20.2", "20.3", "20.4", "20.5"] },
    { "id": 8, "tasks": ["22.1"] }
  ]
}
```

Wave rationale: Wave 0 covers backend/frontend setup with no intra-sprint dependencies (the model file, the sanitizer module, the auth dependency, the `remark-gfm` install, `badgeColors.js`, and the two independent leaf components `Placeholders.jsx`/`FeatureNotFoundState.jsx` that consume nothing else new this sprint). Waves 1-4 advance backend service/route wiring and the frontend markdown primitives (`MarkdownRenderer`/`markdown.css` before `toolbarActions.js` before `MarkdownEditor`, since the editor's preview pane imports the renderer) in dependency order, mirroring Sprint 2A's wave shape; `badgeColors.js` (wave 0) is consumed by `AuthorCard`/`StatusTimeline`/`RelatedFeatures`/`ShareButton` (wave 3), so those components are placed after it. Tasks that would otherwise share a wave but write to the same file are kept apart: `feature_service.py` is touched by `2.2` (wave 1, the sanitizer call site) and then `3.1` (wave 1 also, but additive - a new function, `get_related_features`, not an edit to `2.2`'s lines, so both are safe as independent additions before `2.3`/`3.2`/`3.3`'s tests in wave 2); `features.py` is touched only once, by `5.1` (wave 3), after `3.1`/`4.1` (the service function and the auth dependency it depends on) are both in place; `CreateFeatureModal.jsx`/`EditFeatureModal.jsx` (18.1/18.2, wave 5) are separate files so they share a wave, but their tests (18.3/18.4) are pushed to wave 6 to avoid colliding with the implementation wave; `FeatureDetailsPage.jsx` is touched only once by `20.1` (wave 6), placed after every component it composes (`MarkdownRenderer`, `AuthorCard`, `StatusTimeline`, `RelatedFeatures`, `ShareButton`, the skeletons, `FeatureNotFoundState`, the upgraded modals) is implemented, with its four independent test additions (20.2-20.5) sharing wave 7 since each is an independent addition to test files rather than conflicting edits to `FeatureDetailsPage.jsx` itself; the README update (22.1) is last, after every implementation task it documents.

</content>
