# Requirements Document

## Introduction

This specification covers Sprint 2B of the Feature Request & Public Roadmap Portal: Feature Details, Markdown Editor & UI Polish. Sprint 0 delivered the scaffolding, Sprints 1A/1B delivered complete authentication, and Sprint 2A delivered the `features` collection, `Feature_Service`, the versioned `Feature_API` (create/feed/get/update/delete), and the frontend feed (`HomePage`, `FeatureCard`, `CreateFeatureModal`, `EditFeatureModal`, `ConfirmDialog`, `SearchBar`, `FilterDropdown`, `Pagination`, `Feature_Hooks`, `Frontend_Feature_Service`). Sprint 2A deliberately deferred two things to this sprint: full markdown rendering (`FeatureDetailsPage` currently renders `description_markdown` inside a `<pre>` block) and a polished single-feature view (the current `FeatureDetailsPage` shows only plain-text metadata).

This sprint builds a polished Feature Details experience on top of that foundation: an extended `Get_Feature_Endpoint` response carrying author/ownership/related-feature metadata, a `get_related_features()` `Feature_Service` helper, a shared, sanitized markdown-rendering pipeline used by both the read-only detail view and a new live editor, a rewritten `FeatureDetailsPage`, a reusable `MarkdownEditor` used by both `CreateFeatureModal` and `EditFeatureModal`, and five new presentational components (`AuthorCard`, `StatusTimeline`, `RelatedFeatures`, `ShareButton`, plus the loading/error/placeholder states described below).

This spec preserves the Sprint 0/1A/1B/2A architecture exactly: strict layering (routes → services → database), the `{success, message, data}` / `{success, message, errors}` response envelope, the `FeatureException` family and its single-handler-per-family registration in `main.py`, `Feature_Service` as the sole owner of the `features` collection, `get_current_user`/`get_current_admin` middleware, and `Feature_Hooks`' existing hook signatures and query keys. `GET /api/v1/features` (the Feed_Endpoint), `POST /api/v1/features`, `PATCH /api/v1/features/{feature_id}`, and `DELETE /api/v1/features/{feature_id}` are not modified by this sprint beyond what is explicitly stated. This spec does not cover upvoting, threaded comments, the admin dashboard, Kanban drag-and-drop, or roadmap status-change controls — those remain scoped to later sprints (see Non-Goals).

## Glossary

- **Backend_Application**: The FastAPI application located in `backend/app/` (established in Sprint 0, extended in Sprints 1A/1B/2A).
- **Frontend_Application**: The React + Vite single-page application located in `frontend/src/` (established in Sprint 0, extended in Sprints 1A/1B/2A).
- **Feature_Model**: The module `backend/app/models/feature.py`, established in Sprint 2A, extended in this sprint with `FeatureDetailResponse` and `RelatedFeatureCard`.
- **Feature_Service**: The module `backend/app/services/feature_service.py`, established in Sprint 2A as the sole module permitted to read from or write to the `features` collection, extended in this sprint with `get_related_features()`.
- **Feature_API**: The FastAPI router mounted at `/api/v1/features`, established in Sprint 2A.
- **Get_Feature_Endpoint**: The Feature_API route handler for `GET /api/v1/features/{feature_id}`, established in Sprint 2A, extended in this sprint to return `FeatureDetailResponse` in place of `FeatureResponse`.
- **Feed_Endpoint**: The Feature_API route handler for `GET /api/v1/features`, established in Sprint 2A. Not modified by this sprint.
- **FeatureDetailResponse**: The new response schema returned by the Get_Feature_Endpoint, a superset of `FeatureResponse` adding `is_owner`, `is_admin`, and `related_features`.
- **RelatedFeatureCard**: The new, lightweight response schema for one entry of `FeatureDetailResponse.related_features`, containing `id`, `title`, `status`, `category`, `vote_count`, and `created_at`.
- **Markdown_Sanitizer**: The new module `backend/app/utils/markdown_sanitizer.py` (or equivalent), providing a single server-side function that sanitizes raw HTML produced from `description_markdown` before that HTML is trusted anywhere; introduced because `description_markdown` is user-supplied free text and this sprint is the first to render it as HTML rather than plain text.
- **Markdown_Renderer**: The new, single frontend rendering entry point (a component or hook, e.g. `frontend/src/components/markdown/MarkdownRenderer.jsx`) wrapping `react-markdown` + `remark-gfm` with the disallowed-elements/sanitization configuration defined in Requirement 3; the sole component permitted to call `react-markdown` directly, so that FeatureDetailsPage's read-only view and MarkdownEditor's live preview render markdown identically without duplicated rendering logic (per this sprint's Coding Standards).
- **Markdown_Styles**: The new, centralized CSS (e.g. `frontend/src/styles/markdown.css`, imported once and applied via a shared class such as `markdown-body`) providing GitHub-like styling for every element Markdown_Renderer can produce; the sole source of markdown-specific styling in the Frontend_Application.
- **FeatureDetailsPage**: The component `frontend/src/pages/FeatureDetailsPage.jsx`, a bare-bones placeholder as of Sprint 2A, rewritten in this sprint into the full Feature Details experience.
- **MarkdownEditor**: The new, reusable component `frontend/src/components/MarkdownEditor.jsx`, combining a toolbar, a textarea, and a Markdown_Renderer-backed live preview, used by both CreateFeatureModal and EditFeatureModal in place of their Sprint 2A plain textareas.
- **AuthorCard**: The new component `frontend/src/components/AuthorCard.jsx`, displaying a feature's author summary.
- **StatusTimeline**: The new component `frontend/src/components/StatusTimeline.jsx`, displaying the four-stage Feature_Status workflow with the current stage highlighted, read-only.
- **RelatedFeatures**: The new component `frontend/src/components/RelatedFeatures.jsx`, rendering the `related_features` array from FeatureDetailResponse as horizontal cards.
- **ShareButton**: The new component `frontend/src/components/ShareButton.jsx`, copying the current feature's URL to the clipboard.
- **VotingPlaceholder**, **CommentsPlaceholder**: The two new, static placeholder components (or a single parametrized component reused twice) rendered at the bottom of FeatureDetailsPage, carrying no interactive behavior.
- **FeatureDetailsSkeleton**, **RelatedFeaturesSkeleton**, **MarkdownContentSkeleton**: The new skeleton components shown while FeatureDetailsPage's underlying query is loading.
- **FeatureNotFoundState**: The new not-found presentational state rendered by FeatureDetailsPage when the Get_Feature_Endpoint responds 404, distinct from the project-wide `NotFoundPage` (which handles unmatched routes, not valid-route-but-missing-resource).
- **CreateFeatureModal**, **EditFeatureModal**: Established in Sprint 2A; modified in this sprint to render MarkdownEditor in place of a plain textarea.
- **validateFeatureForm**: The pure validator function established in Sprint 2A, colocated in `CreateFeatureModal.jsx` and imported by `EditFeatureModal.jsx`; not modified by this sprint (its bounds — title 5-120 chars, description 20-10,000 chars — are reused, not redefined).
- **Feature_Hooks**: The module `frontend/src/hooks/useFeatures.js`, established in Sprint 2A (`useFeatureFeed`, `useFeature`, `useCreateFeature`, `useUpdateFeature`, `useDeleteFeature`); its exported hook names, signatures, and query keys are not modified by this sprint. `useFeature`'s resolved data shape grows (per Requirement 1) without any change to the hook itself.
- **Frontend_Feature_Service**: The module `frontend/src/services/featureService.js`, established in Sprint 2A; not modified by this sprint beyond the `getFeature` response naturally carrying the new `FeatureDetailResponse` fields.
- **HomePage**: The component `frontend/src/pages/HomePage.jsx`, established in Sprint 2A as the feed page; FeatureDetailsPage's back-navigation (Requirement 15) returns here.
- **AuthContext**: Established in Sprint 1A/1B (`useAuth()` returning `{ user, isAuthenticated, loading, login, logout, signup }`); `user.id` and `user.role` are read by FeatureDetailsPage to compute the display-only `is_owner`/`is_admin` affordances described in Requirement 4 (the authoritative `is_owner`/`is_admin` values still come from FeatureDetailResponse per Requirement 1).

## Requirements

### Backend: Feature Detail Response

#### Requirement 1: Extended Feature Detail Response Shape

**User Story:** As a frontend developer, I want the Get_Feature_Endpoint to return everything the Feature Details page needs in one response, so that the page does not need multiple round trips to render author info, ownership-gated controls, and related features.

##### Acceptance Criteria

1. THE Feature_Model SHALL define a `FeatureDetailResponse` schema containing every field already present on `FeatureResponse` (`id`, `title`, `description_markdown`, `category`, `status`, `author_id`, `author_name`, `vote_count`, `comment_count`, `created_at`, `updated_at`) plus three additional fields: `is_owner` (boolean), `is_admin` (boolean), and `related_features` (a list of `RelatedFeatureCard`, per Requirement 2).
2. WHEN the Get_Feature_Endpoint receives a request from an authenticated user whose `id` matches the requested feature's `author_id`, THE Get_Feature_Endpoint SHALL set `is_owner` to `true` in the response.
3. WHEN the Get_Feature_Endpoint receives a request from an authenticated user whose `id` does not match the requested feature's `author_id`, or receives a request with no authenticated user, THE Get_Feature_Endpoint SHALL set `is_owner` to `false` in the response.
4. WHEN the Get_Feature_Endpoint receives a request from an authenticated user whose `role` field is `"admin"`, THE Get_Feature_Endpoint SHALL set `is_admin` to `true` in the response.
5. WHEN the Get_Feature_Endpoint receives a request from an authenticated user whose `role` field is not `"admin"`, or receives a request with no authenticated user, THE Get_Feature_Endpoint SHALL set `is_admin` to `false` in the response.
6. THE Get_Feature_Endpoint SHALL resolve the requesting user, if any, via a dependency that does not raise when no `Authorization` header is present, or when a Bearer token is present but invalid (malformed, expired, an unrecognized `type` claim, or naming a `sub` that does not resolve to an existing user) — every such case SHALL be treated identically to an absent token, resolving to "no authenticated user" rather than raising an error, because the Get_Feature_Endpoint SHALL remain publicly accessible without authentication per Sprint 2A's Requirement 6.4, and computing `is_owner`/`is_admin` SHALL NOT impose an authentication requirement, nor a token-validity requirement, where none existed before.
7. WHEN the Get_Feature_Endpoint receives a request for an existing `feature_id`, THE Get_Feature_Endpoint SHALL respond with HTTP status 200 and a success envelope containing a `FeatureDetailResponse` in the `data` field, in place of the `FeatureResponse` returned by this endpoint prior to this sprint.
8. IF the Get_Feature_Endpoint receives a request for a `feature_id` that does not match any persisted feature request document, THEN THE Feature_API SHALL respond with HTTP status 404 and an error envelope, via the propagated `FeatureNotFoundException`, unchanged from Sprint 2A's Requirement 6.9.
9. THE Feed_Endpoint SHALL continue to return `PaginatedFeatureResponse` (items typed as `FeatureFeedResponse`) exactly as defined in Sprint 2A, and SHALL NOT be modified to include `is_owner`, `is_admin`, or `related_features`, because computing related features and per-item ownership for every feed row would multiply the Feed_Endpoint's query cost across a full page of results for no requirement stated in this sprint's brief ("Do not change feed endpoint").
10. THE Create_Feature_Endpoint, Update_Feature_Endpoint, and Delete_Feature_Endpoint SHALL continue to accept `FeatureCreate`/`FeatureUpdate` and return `FeatureResponse` exactly as defined in Sprint 2A, unmodified by this sprint.

#### Requirement 2: Related Features Selection Logic

**User Story:** As a user viewing a feature's details, I want to see other feature requests in the same category, so that I can discover related ideas without leaving the page.

##### Acceptance Criteria

1. THE Feature_Service SHALL provide a function `get_related_features(feature_id, category, limit=4)` that returns up to `limit` feature request documents, where `limit` SHALL only ever be invoked with a positive integer value not exceeding 4 within this sprint's own call sites.
2. THE Feature_Service's `get_related_features()` function SHALL select only feature request documents whose `category` field equals the given `category`.
3. THE Feature_Service's `get_related_features()` function SHALL exclude the feature request document whose `id` equals the given `feature_id` from its results.
4. THE Feature_Service's `get_related_features()` function SHALL order its results by `created_at` descending (newest first), breaking any tie between documents sharing an identical `created_at` timestamp by ordering those documents by `id` descending (Mongo `ObjectId` descending, which correlates with insertion order), so that the result order is fully deterministic for any given set of matching documents.
5. THE Feature_Service's `get_related_features()` function SHALL return at most 4 documents, matching the brief's "max 4" requirement, whether invoked with an explicit `limit` argument or its default.
6. WHEN fewer than 4 feature request documents match the category filter (after excluding the current feature), THE Feature_Service's `get_related_features()` function SHALL return only the matching documents, without padding the result with documents from a different category; WHEN zero feature request documents match, THE Feature_Service's `get_related_features()` function SHALL return an empty list, not `None` and not an error.
7. THE Get_Feature_Endpoint SHALL invoke `get_related_features()` with the requested feature's own `category` and `id` after successfully resolving that feature, and SHALL map its result into `FeatureDetailResponse.related_features`, mapping a zero-match result to an empty `related_features` array.
8. THE Feature_Model SHALL define a `RelatedFeatureCard` schema containing exactly `id`, `title`, `status`, `category`, `vote_count`, and `created_at`, and this schema SHALL NOT contain `description_markdown`, `author_id`, `author_name`, or `comment_count`, because the RelatedFeatures component (Requirement 11) never displays those fields and Requirement 2's brief explicitly calls this "lightweight cards only."
9. THE Feature_Service's `get_related_features()` function SHALL query the `features` collection using the existing `category` and `created_at` descending indexes established in Sprint 2A's Requirement 3.2, and SHALL NOT require a new index.

### Backend: Markdown Sanitization

#### Requirement 3: Markdown Rendering Safety Rules

**User Story:** As a platform operator, I want markdown-derived HTML sanitized before it reaches a browser, so that no user-supplied `description_markdown` can execute a script or inject arbitrary HTML in another user's session.

##### Acceptance Criteria

1. THE Markdown_Renderer SHALL allow the following elements when rendering `description_markdown`: headings (`h1`-`h6`), unordered and ordered lists (`ul`, `ol`, `li`), links (`a`), tables (`table`, `thead`, `tbody`, `tr`, `th`, `td`), code blocks and inline code (`pre`, `code`), blockquotes (`blockquote`), bold and italic emphasis (`strong`, `em`), paragraphs (`p`), line breaks (`br`), and horizontal rules (`hr`); this allow-list governs Markdown_Renderer's `react-markdown`/`remark-gfm` rendering configuration (frontend), distinct from Markdown_Sanitizer's server-side raw-HTML sanitization (Requirement 3.4, 3.6). WHEN a link (`a`) element's `href` value, produced from markdown link syntax (`[text](url)`), uses a scheme other than `http`, `https`, `mailto`, or is a relative/scheme-less URL, THE Markdown_Renderer SHALL render the link's text as plain, non-linked text and SHALL discard the `href` value entirely, rather than rendering an `<a href="...">` tag with that value, so that markdown-native syntax cannot be used to smuggle a `javascript:` or other executable-scheme URI past the Requirement 3.4 raw-HTML sanitization, which does not cover AST-generated links.
2. WHEN `description_markdown` contains image syntax (`![alt](url)`), THE Markdown_Renderer SHALL NOT render an `<img>` element, and SHALL instead render the image's alt text as plain, non-linked text, discarding the image URL entirely, rather than rendering the URL as a clickable link or rendering the raw, unrendered markdown source. This specific behavior — alt text only, URL discarded — is the chosen resolution of the brief's "images should not render yet": treating an image as a broken/absent visual (alt text is what a browser shows when an image fails to load) is more consistent with "not implemented yet" than silently upgrading it into a link the author never wrote, and discarding the URL (rather than merely hiding the `<img>` tag) removes any incentive to treat this as a disguised way to leak or probe arbitrary URLs.
3. THE Markdown_Renderer SHALL implement Requirements 3.1's link-scheme restriction and 3.2's image suppression by passing `a` and `img` in `remark-gfm`/`react-markdown`'s component-override or `disallowedElements` configuration, mapping each to a component that applies the Requirement 3.1/3.2 behavior, rather than by pre-processing the markdown source string to strip link/image syntax before it reaches `react-markdown`; this is chosen because `remark-gfm` and `react-markdown`'s AST-level component overrides are the documented, structural mechanism for this exact case and avoid the false-positive/false-negative risk of a regular-expression-based pre-processing pass over arbitrary markdown source.
4. THE Markdown_Sanitizer SHALL sanitize any raw HTML embedded inside `description_markdown` (i.e. markdown source containing literal HTML tags), removing or neutralizing `script`, `style`, `iframe`, `object`, `embed`, and `on*` event-handler attributes, and any `href`/`src` attribute value using the `javascript:` URI scheme, regardless of the Requirement 3.1 allow-list.
5. THE Markdown_Renderer SHALL NOT pass `rehype-raw` (or any equivalent plugin that re-parses embedded raw HTML back into rendered elements) into its `react-markdown` configuration; `react-markdown` treats raw HTML in its input as plain text by default, and omitting `rehype-raw` is the primary sanitization mechanism for Requirement 3.4 — a defense that is structural (nothing to bypass) rather than pattern-matching-based (potentially bypassable).
6. WHERE the Backend_Application additionally sanitizes `description_markdown` server-side before persistence or before including it in a Feature_API response (e.g. stripping raw HTML tags from the stored/returned string), THE Markdown_Sanitizer SHALL apply that additional sanitization identically regardless of whether the request originated from the Create_Feature_Endpoint, Update_Feature_Endpoint, or is being read back through the Get_Feature_Endpoint or Feed_Endpoint, so that no code path can persist or return a differently-sanitized copy of the same field. Server-side sanitization is a defense-in-depth layer; it does not replace the frontend rendering-time controls in Requirements 3.1-3.5, because a raw API response (consumed by something other than the Frontend_Application) should not depend solely on a specific frontend renderer's configuration for safety.
7. THE Markdown_Renderer SHALL be the only component in the Frontend_Application that imports and invokes `react-markdown`, so that FeatureDetailsPage's read-only rendering (Requirement 4) and MarkdownEditor's live preview (Requirement 6) share one sanitization/rendering configuration and cannot drift apart, per this sprint's "do not duplicate markdown rendering logic" coding standard.

### Frontend: Feature Details Page

#### Requirement 4: Feature Details Page Sections

**User Story:** As a user, I want a feature's details page to show everything about that feature in a clear, organized layout, so that I can understand the request, its author, and its status at a glance.

##### Acceptance Criteria

1. THE FeatureDetailsPage SHALL render, in this order: a breadcrumb trail back to the feed, the feature's title, a status badge, a category badge, an AuthorCard, the feature's created date, the feature's updated date (only when it differs from the created date, per Requirement 4.2), the rendered markdown content (via Markdown_Renderer), a ShareButton, an Edit button (visible only per Requirement 4.4), a Delete button (visible only per Requirement 4.5), a StatusTimeline, a RelatedFeatures section, a VotingPlaceholder, and a CommentsPlaceholder.
2. WHEN a feature's `updated_at` timestamp differs from its `created_at` timestamp, THE FeatureDetailsPage SHALL display the updated date alongside the created date; WHEN a feature's `updated_at` timestamp equals its `created_at` timestamp, THE FeatureDetailsPage SHALL display only the created date, because an "updated" date identical to the creation date carries no information for the reader.
3. THE FeatureDetailsPage SHALL render its status badge and category badge using the badge color conventions defined in Requirement 17.4.
4. WHEN the resolved feature's `is_owner` field is `true`, THE FeatureDetailsPage SHALL render an Edit button that opens EditFeatureModal pre-filled with the feature's current data; WHEN the resolved feature's `is_owner` field is `false`, THE FeatureDetailsPage SHALL NOT render an Edit button, matching the Update_Feature_Endpoint's author-only authorization (Sprint 2A Requirement 5.2, 5.3).
5. WHEN the resolved feature's `is_owner` field is `true` OR its `is_admin` field is `true`, THE FeatureDetailsPage SHALL render a Delete button that opens the existing ConfirmDialog before calling `useDeleteFeature()`'s mutation; WHEN both `is_owner` and `is_admin` are `false`, THE FeatureDetailsPage SHALL NOT render a Delete button, matching the Delete_Feature_Endpoint's author-or-admin authorization (Sprint 2A Requirement 5.4, 5.5).
6. WHEN a Delete button's ConfirmDialog is confirmed and `useDeleteFeature()`'s mutation succeeds, THE FeatureDetailsPage SHALL show a success Toast and navigate back to the feed (HomePage). IF a Delete button's ConfirmDialog is confirmed and `useDeleteFeature()`'s mutation fails, THEN THE FeatureDetailsPage SHALL show an error Toast, SHALL close the ConfirmDialog, and SHALL remain on the feature's details page without navigating away, so a failed deletion never silently strands or misleads the user about the feature's deletion state.
7. THE FeatureDetailsPage SHALL render at the single-column, mobile viewport width with all sections stacked vertically in the Requirement 4.1 order, and SHALL render at desktop viewport width with the primary content (title, badges, author card, dates, markdown content) in a main column and the StatusTimeline in a secondary column or sticky sidebar, consistent with the sticky-action-bar requirement in Requirement 17.2.
8. THE FeatureDetailsPage SHALL fetch its data exclusively via the existing `useFeature(featureId)` hook from Feature_Hooks, without modification to that hook's signature or query key, per this sprint's "Keep React Query hooks unchanged" coding standard.

### Frontend: Markdown Editor

#### Requirement 5: Markdown Editor Toolbar and Textarea

**User Story:** As a user creating or editing a feature request, I want a toolbar that inserts markdown syntax for me, so that I can format my description without memorizing markdown syntax.

##### Acceptance Criteria

1. THE MarkdownEditor SHALL render a `<textarea>` bound to a controlled `value`/`onChange` pair supplied by its parent (CreateFeatureModal or EditFeatureModal), and a toolbar containing one button each for: Heading 1, Heading 2, Bold, Italic, Bullet List, Numbered List, Quote, Code Block, Link, Horizontal Rule, and Table template.
2. THE MarkdownEditor SHALL NOT depend on any rich-text-editor library (e.g. TipTap, Slate, Draft.js, Quill); every toolbar action SHALL be implemented as a plain-string insertion into the textarea's `value`, matching this sprint's explicit "No rich text editor library" constraint.
3. WHEN a user selects a non-empty range of text in the textarea and activates the Bold or Italic toolbar button, THE MarkdownEditor SHALL wrap the entire selected range as a single unit in the corresponding markdown syntax (`**selected**` or `*selected*`), even if the selection spans multiple lines, and preserve the wrapped text as the new selection. WHEN a user selects a non-empty range of text and activates the Quote toolbar button, THE MarkdownEditor SHALL prefix each line within the selected range with `> ` and preserve the resulting text as the new selection.
4. WHEN a user activates the Bold, Italic, or Code Block toolbar button with no text selected (an empty/collapsed selection), THE MarkdownEditor SHALL insert the syntax's placeholder pair at the cursor position (e.g. `**bold text**`, `*italic text*`, or a triple-backtick-fenced ` ```\ncode\n``` `) and SHALL place the cursor so the placeholder's inner text is selected, ready to be typed over. WHEN a user activates the Link toolbar button with no text selected, THE MarkdownEditor SHALL insert the placeholder `[link text](url)` at the cursor position and SHALL place the cursor so that the `link text` span (not the `url` span) is selected first, ready to be typed over.
5. WHEN a user activates the Heading 1, Heading 2, Bullet List, Numbered List, or Horizontal Rule toolbar button with an empty/collapsed selection (no text selected), THE MarkdownEditor SHALL insert its markdown prefix (`# `, `## `, `- `, `1. `, or `---`) at the start of the current line (for the heading/list variants) or on its own new line (for the horizontal rule). WHEN a user activates the Heading 1, Heading 2, Bullet List, or Numbered List toolbar button with a non-empty selection spanning one or more lines, THE MarkdownEditor SHALL prefix every line within the selected range with that button's markdown prefix (using the literal prefix `1. ` on each line for Numbered List, without renumbering), rather than wrapping the selection as a span, because these are line-level, not span-level, markdown constructs.
6. WHEN a user activates the Table template toolbar button, THE MarkdownEditor SHALL insert a fixed 2-column-by-2-row markdown table skeleton (a header row, a separator row, and one data row, e.g. `| Header | Header |\n| --- | --- |\n| Cell | Cell |`) at the cursor position, on its own line.
7. AFTER any toolbar insertion, THE MarkdownEditor SHALL return keyboard focus to the textarea, so a user can continue typing immediately without an extra click.
8. THE MarkdownEditor SHALL render a live-preview toggle control that switches the editor between an editing-only view (textarea and toolbar only) and a preview-enabled view (per Requirement 6); WHEN the MarkdownEditor is first rendered, THE MarkdownEditor SHALL default to the preview-enabled view.

#### Requirement 6: Live Markdown Preview

**User Story:** As a user creating or editing a feature request, I want to see a live rendering of my markdown as I type, so that I can verify formatting before submitting.

##### Acceptance Criteria

1. WHILE the MarkdownEditor's live-preview toggle is in the preview-enabled state, THE MarkdownEditor SHALL render the textarea's current `value` through Markdown_Renderer (the same component used by FeatureDetailsPage, per Requirement 3.7) in a preview pane adjacent to or below the textarea; WHEN the textarea's current `value` is empty, THE MarkdownEditor SHALL render an empty preview pane (no placeholder text), rather than omitting the pane or showing example content.
2. WHILE the MarkdownEditor's live-preview toggle is in the preview-enabled state, THE MarkdownEditor SHALL update the preview pane's rendered content on every textarea `value` change, with no explicit "render" action required from the user.
3. THE MarkdownEditor SHALL use `remark-gfm` as a `react-markdown` plugin (inside Markdown_Renderer) so that GitHub-Flavored-Markdown constructs — tables, and the allowed subset of other GFM syntax consistent with Requirement 3.1 — render correctly in both the preview pane and FeatureDetailsPage's read-only view.
4. THE MarkdownEditor SHALL render the textarea and the preview pane side by side (split layout) at desktop viewport width, and SHALL render the textarea above the preview pane (stacked layout) at mobile viewport width.
5. WHILE the MarkdownEditor's live-preview toggle is in the editing-only state, THE MarkdownEditor SHALL NOT render the preview pane, allowing the textarea to occupy the full available width; toggling between the editing-only and preview-enabled states SHALL NOT discard, clear, or otherwise alter the textarea's `value` in either direction.

#### Requirement 7: Centralized Markdown Styling

**User Story:** As a user, I want markdown content to look clean and readable everywhere it appears, so that feature descriptions are easy to read regardless of where they're rendered.

##### Acceptance Criteria

1. THE Frontend_Application SHALL define Markdown_Styles as a single, centralized stylesheet providing GitHub-like visual styling for every element Requirement 3.1 allows (`h1`-`h6`, `ul`/`ol`/`li`, `a`, `table`/`thead`/`tbody`/`tr`/`th`/`td`, `pre`/`code`, `blockquote`, `strong`/`em`, `p`, `br`, `hr`): headings with progressively decreasing size/weight from `h1` to `h6`, spaced list items with visible bullets/numbers, styled tables with cell borders and header shading, styled blockquotes with a left border and a text color visually distinct from the surrounding body text, styled inline code and fenced code blocks with a monospace font and a background color visually distinct from the surrounding page background, styled links with an accent color and underline-on-hover, and consistent vertical spacing between block-level elements.
2. THE Markdown_Renderer SHALL apply Markdown_Styles' root class (e.g. `markdown-body`) to its rendered output container.
3. Every consumer of Markdown_Renderer (FeatureDetailsPage's read-only view, MarkdownEditor's preview pane) SHALL inherit Requirement 7.1's styling solely through Markdown_Renderer's root class, and SHALL NOT declare any CSS rule, in any file, that selects an element listed in Requirement 7.1 by tag name or by a class applied only within markdown-rendered content, satisfying the "keep markdown styles centralized" coding standard.
4. THE Markdown_Styles stylesheet SHALL be implemented as static CSS (a plain `.css` file imported once, or Tailwind's `@apply`-based utility composition), and SHALL NOT be duplicated or re-declared in more than one file.

### Frontend: Create/Edit Modal Upgrades

#### Requirement 8: Modal Markdown Editing

**User Story:** As a user creating or editing a feature request, I want the same rich markdown editing experience in both the create and edit modals, so that my authoring experience is consistent regardless of which action I'm performing.

##### Acceptance Criteria

1. THE CreateFeatureModal SHALL render MarkdownEditor in place of its Sprint 2A plain `description_markdown` textarea, passing the modal's local `description_markdown` state and setter as MarkdownEditor's controlled `value`/`onChange` pair.
2. THE EditFeatureModal SHALL render MarkdownEditor in place of its Sprint 2A plain `description_markdown` textarea, passing the modal's local `description_markdown` state and setter as MarkdownEditor's controlled `value`/`onChange` pair, pre-filled from the target feature exactly as the Sprint 2A textarea was.
3. THE CreateFeatureModal and EditFeatureModal SHALL each display a live character counter beneath MarkdownEditor's textarea, showing the current `description_markdown` length against the 10,000-character maximum (e.g. `"1,234 / 10,000"`), updating on every keystroke.
4. WHEN a user's `description_markdown` length in either modal reaches or exceeds 9,000 characters (90% of the 10,000-character maximum) but remains below 10,000 characters, THE character counter SHALL visually indicate approaching the limit (e.g. a warning color), because a numeric-only counter easily goes unnoticed.
5. WHEN a user's `description_markdown` length in either modal reaches or exceeds 10,000 characters (the maximum), THE character counter SHALL visually indicate the limit has been reached (e.g. an error color), without preventing further keystrokes — the existing `validateFeatureForm` gate at submit time (Sprint 2A Requirement 17.3/18.3, reused unmodified by this sprint) remains the sole enforcement mechanism, consistent with every other Sprint 2A form field.
6. THE CreateFeatureModal and EditFeatureModal SHALL continue to validate their fields via the existing, unmodified `validateFeatureForm` function before calling their respective mutation hooks, reusing its established bounds (title 5-120 characters, description 20-10,000 characters) without redefining or duplicating those bounds inside MarkdownEditor.
7. THE MarkdownEditor's textarea SHALL automatically grow its height to fit its content up to a single fixed maximum height shared identically by CreateFeatureModal's and EditFeatureModal's instances, beyond which it becomes internally scrollable, rather than remaining a fixed-height box that clips or forces a small internal scroll region below that shared maximum.
8. WHILE a CreateFeatureModal or EditFeatureModal instance remains open (mounted), THE MarkdownEditor's `value` state SHALL be preserved across toggling the live-preview toggle, switching focus between the textarea and other modal fields, or any re-render caused by those interactions, because the state is held in the parent modal's `useState` for the modal's mount lifetime.
9. WHEN a CreateFeatureModal or EditFeatureModal instance is closed (unmounted) and the same modal is subsequently reopened, THE modal SHALL NOT restore the previously entered, unsubmitted `description_markdown`/`title`/`category` values; CreateFeatureModal SHALL reopen with empty fields (matching its Sprint 2A behavior) and EditFeatureModal SHALL reopen pre-filled from the target feature's current, persisted data (matching its Sprint 2A behavior). This resolves the brief's "draft preserved while modal open" ambiguity by scoping "while open" strictly to the current mount: this sprint does not add any new persistence layer (e.g. `localStorage`, a context-level draft store) for unsubmitted modal content, because doing so is not stated in the brief and would be a scope addition beyond "polish" that introduces its own stale-draft and multi-feature-conflict edge cases; a future sprint MAY introduce cross-session draft persistence as a deliberate, separately-specified feature.

### Frontend: New Presentational Components

#### Requirement 9: Author Card Component

**User Story:** As a user viewing a feature's details, I want to see who submitted it, so that I have context on the request's origin.

##### Acceptance Criteria

1. THE AuthorCard SHALL accept the author's name, role, verification status, and the feature's `created_at` timestamp as props, and SHALL NOT fetch any data itself.
2. THE AuthorCard SHALL render a circular avatar placeholder: WHEN the author's name contains one or more words, THE AuthorCard SHALL render the uppercased first letter of the first word and, if a second word is present, the uppercased first letter of that second word (e.g. "Ada Lovelace" renders "AL"; "Ada" alone renders "A") over a solid background; WHEN the author's name is empty or not provided, THE AuthorCard SHALL render a generic person icon in place of initials.
3. THE AuthorCard SHALL render the author's name and a role badge that visually distinguishes exactly two states — `"user"` and `"admin"` — reflecting the author's `role` value, with no third or blank badge state.
4. WHEN the author's `is_verified` field is `true`, THE AuthorCard SHALL render a verified badge; WHEN the author's `is_verified` field is `false`, THE AuthorCard SHALL NOT render a verified badge.
5. THE AuthorCard SHALL render the feature's `created_at` date using the same `toLocaleDateString()`-based date formatting already used elsewhere in the Frontend_Application (e.g. by FeatureCard and FeatureDetailsPage in Sprint 2A), framed as "Submitted on [date]", rather than introducing a new date-formatting convention.
6. THE AuthorCard SHALL NOT render as a link or navigable element, because no user profile page exists in this sprint (per the brief's "No profile page yet").
7. WHEN the requesting viewer is the feature's author (i.e. FeatureDetailResponse's `is_owner` field is `true`), THE FeatureDetailsPage SHALL supply AuthorCard with that viewer's own `role` and `is_verified` values read from `AuthContext`'s `user`. WHEN the requesting viewer is not the feature's author, THE FeatureDetailsPage SHALL supply AuthorCard using only the `author_name` field present on FeatureDetailResponse, SHALL supply AuthorCard's role prop as the generic `"user"` value, and SHALL supply AuthorCard's verification-status prop as `false` (omitting the verified badge per Requirement 9.4), because FeatureDetailResponse does not expose the author's `role` or `is_verified` fields and this sprint does not extend FeatureDetailResponse with author-role/verification data (no requirement in this sprint's brief calls for exposing another user's role/verification status, and doing so unprompted would be a scope addition with its own information-disclosure considerations). A future sprint MAY extend FeatureDetailResponse with an explicit, deliberately-scoped author-role field if that becomes a real product requirement.

#### Requirement 10: Status Timeline Component

**User Story:** As a user viewing a feature's details, I want to see where a feature stands in its lifecycle, so that I understand its current progress at a glance.

##### Acceptance Criteria

1. THE StatusTimeline SHALL accept a feature's `status` value as a prop and, WHEN that value is one of the four valid Feature_Status values (`under_review`, `planned`, `in_progress`, `completed`), SHALL render exactly four stages in order: Under Review, Planned, In Progress, Completed.
2. THE StatusTimeline SHALL visually distinguish the stage matching the supplied `status` prop from the other three stages through at least one non-color-dependent means (e.g. a filled vs. unfilled marker shape, or a bold vs. regular label weight) in addition to any color difference, so the current stage remains identifiable without relying on color perception alone.
3. THE StatusTimeline SHALL render as read-only: it SHALL NOT render any control (button, dropdown, drag handle) that allows changing a feature's status, because status-change controls are explicitly out of scope for this sprint (roadmap status changes are a Non-Goal).
4. THE StatusTimeline SHALL be used exclusively within FeatureDetailsPage in this sprint, and SHALL NOT be rendered on HomePage's feed cards or anywhere else.
5. IF the StatusTimeline receives a `status` prop value that is missing, `null`, `undefined`, or not one of the four valid Feature_Status values, THEN THE StatusTimeline SHALL render its four stages with none of them highlighted as current, and SHALL NOT raise an error or fail to render.

#### Requirement 11: Related Features Component

**User Story:** As a user viewing a feature's details, I want to see related feature requests in the same category, so that I can discover similar ideas.

##### Acceptance Criteria

1. THE RelatedFeatures component SHALL accept the `related_features` array from FeatureDetailResponse as a prop.
2. WHEN the `related_features` prop contains one or more entries, THE RelatedFeatures component SHALL render exactly one card per entry, up to the 4-item maximum already enforced server-side (Requirement 2.5).
3. THE RelatedFeatures component SHALL render each card showing that entry's `title`, `category`, `status`, and `vote_count`, using the same badge color conventions as FeatureDetailsPage (Requirement 17.4) for `category` and `status`.
4. WHEN a user activates a RelatedFeatures card (click, or Enter/Space while the card is focused), THE RelatedFeatures component SHALL navigate to that related feature's own `/features/{id}` details page; each card SHALL be exposed to assistive technology as a single focusable, activatable element (e.g. a link or button role) whose accessible name includes that entry's `title`.
5. THE RelatedFeatures component SHALL lay out its cards horizontally in a row at viewport widths of 768px and above, and SHALL lay out its cards as either a horizontally-scrollable row or a stacked column (implementer's choice) at viewport widths below 768px, such that every card remains fully visible and independently activatable without any card being clipped or overlapping another.
6. WHEN the `related_features` array is empty, THE RelatedFeatures component SHALL render nothing (no heading, no container, no message).

#### Requirement 12: Share Button Component

**User Story:** As a user viewing a feature's details, I want to copy a shareable link to the feature, so that I can send it to someone else.

##### Acceptance Criteria

1. WHEN a user activates the ShareButton, THE ShareButton SHALL attempt to copy the feature's current, full browser URL (`window.location.href`) to the system clipboard using the Clipboard API (`navigator.clipboard.writeText`).
2. WHEN the Clipboard API copy succeeds, THE ShareButton SHALL display a Sonner success toast with the exact text `"Feature link copied."`.
3. WHEN `navigator.clipboard` is unavailable (e.g. the Clipboard API is not exposed in the current browser/context) or `navigator.clipboard.writeText` rejects, THE ShareButton SHALL fall back to a `document.execCommand("copy")`-based copy against a temporary, off-screen, focused, selected text input/textarea element containing the feature's URL, created and removed for the duration of the copy operation, and SHALL display the same success toast (`"Feature link copied."`) when that fallback copy succeeds.
4. IF both the Clipboard API and the `document.execCommand("copy")` fallback fail, THEN THE ShareButton SHALL display a Sonner error toast indicating that the link could not be copied and instructing the user to copy it manually, rather than the success toast, so a user is never told a copy succeeded when it did not.
5. WHEN a user activates the ShareButton, THE ShareButton SHALL display exactly one toast (either the success toast from Criterion 2/3 or the error toast from Criterion 4) as the outcome of that activation, never both and never neither.
6. THE ShareButton SHALL render as an icon-and-label or icon-only button with an `aria-label` of `"Copy feature link"` (or equivalent descriptive text), satisfying Requirement 16's icon-button labeling rule.

### Frontend: Placeholders

#### Requirement 13: Voting and Comments Placeholders

**User Story:** As a user viewing a feature's details, I want to know that voting and discussion are coming, so that I understand the current absence of those features is intentional, not missing functionality.

##### Acceptance Criteria

1. THE FeatureDetailsPage SHALL render a VotingPlaceholder card near the bottom of the page (per the Requirement 4.1 section order), displaying a distinguishing heading identifying it as the voting section and containing the exact text `"Voting available in Sprint 3."`.
2. THE FeatureDetailsPage SHALL render a CommentsPlaceholder card near the bottom of the page (per the Requirement 4.1 section order), displaying a distinguishing heading identifying it as the comments/discussion section and containing the exact text `"Threaded discussions available in Sprint 4."`.
3. THE VotingPlaceholder and CommentsPlaceholder SHALL render as static, non-interactive cards: neither SHALL contain a button, input, or any element that submits a vote or a comment, because implementing that functionality is explicitly out of scope for this sprint.
4. THE VotingPlaceholder and CommentsPlaceholder SHALL visually match the page's existing card styling (spacing, border, background) established by Requirement 17, so they read as an intentional part of the page rather than debug scaffolding.

### Frontend: Loading, Error, and 404 States

#### Requirement 14: Loading and Error UX

**User Story:** As a user navigating to a feature's details page, I want clear loading and error feedback, so that I understand what the page is doing while data loads or when something goes wrong.

##### Acceptance Criteria

1. WHILE `useFeature(featureId)`'s query is in its loading state, THE FeatureDetailsPage SHALL render FeatureDetailsSkeleton in place of the title/badges/author-card/dates/markdown-content region, RelatedFeaturesSkeleton in place of the RelatedFeatures section, and MarkdownContentSkeleton in place of the rendered markdown content region, replacing this sprint's Sprint 2A placeholder ("Loading...") text entirely.
2. WHEN `useFeature(featureId)`'s query resolves to an error whose HTTP status is 404, THE FeatureDetailsPage SHALL render FeatureNotFoundState in place of the skeletons, showing a message stating the feature could not be found and a link back to the feed using the same breadcrumb affordance and navigation target defined in Requirement 15.5.
3. WHEN `useFeature(featureId)`'s query resolves to an error whose HTTP status is not 404 (e.g. a network failure or 500), THE FeatureDetailsPage SHALL render an error state in place of the skeletons, showing a message stating that loading the feature's details failed without affecting any other part of the application, and a retry control.
4. WHEN a user activates the error state's retry control, THE FeatureDetailsPage SHALL re-trigger `useFeature(featureId)`'s underlying query (e.g. via React Query's `refetch`) without a full page reload; WHILE that retry request is in flight, THE retry control SHALL be disabled or otherwise indicate that a retry is in progress, THE FeatureDetailsPage SHALL NOT issue a second concurrent retry request from a repeated activation during that time, and THE FeatureDetailsPage SHALL continue displaying the error state (not the skeletons) until the retry resolves.
5. THE FeatureDetailsSkeleton, RelatedFeaturesSkeleton, and MarkdownContentSkeleton SHALL be implemented as pulsing/shimmering placeholder blocks approximating the shape of the content they precede (title-width bar, badge-width chips, paragraph-width lines), consistent with the "Skeleton Loader" reusable-component category already named in PROJECT_SPEC.md's UI Components list.

### Frontend: URL and Navigation

#### Requirement 15: Direct Navigation, Refresh, and Back Navigation

**User Story:** As a user, I want feature detail links to work when shared or bookmarked, and I want the back button to return me to the feed exactly as I left it, so that navigating to and from a feature's details never loses my place.

##### Acceptance Criteria

1. THE Frontend_Application SHALL continue to serve `/features/{featureId}` via the `features/:featureId` route already registered in `App.jsx` in Sprint 2A, requiring no route-table change in this sprint.
2. WHEN a user directly navigates to `/features/{featureId}` (a fresh page load, e.g. from a bookmark or shared link) or refreshes the browser while on that URL, THE Frontend_Application SHALL render FeatureDetailsPage for that `featureId`, fetching the feature via `useFeature(featureId)` exactly as it would for an in-app navigation, because the route and its data-fetching hook are already refresh-safe by construction (URL-driven `useParams()`, no client-only navigation state).
3. WHEN a user navigates to a feature's details page from HomePage's feed (e.g. by clicking a FeatureCard) or from another feature's details page (e.g. by activating a RelatedFeatures card), THE Frontend_Application SHALL push a new browser history entry for the destination `/features/{featureId}` via `react-router-dom`'s standard `<Link>`/`navigate()` navigation, rather than replacing the current history entry, so the browser's native Back button always has the previous page's entry to return to.
4. WHEN a user activates the browser's Back button (or an in-page "back to feed" affordance implemented as `navigate(-1)`) from a feature's details page that was reached by feed navigation, THE Frontend_Application SHALL return to HomePage with its `search`, `category`, `status`, `sort`, and `page` URL parameters exactly as they were before navigating away, because HomePage's feed state is already stored entirely in the URL via `useFeedQueryParams` (established in Sprint 2A), and native browser history back-navigation to that same URL restores that state with no additional passthrough mechanism required; this sprint SHALL NOT introduce a query-param-forwarding hack (e.g. appending a `returnTo` parameter to the feature details URL) because the existing URL-driven feed state already makes native history navigation sufficient.
5. THE FeatureDetailsPage's breadcrumb (Requirement 4.1) SHALL link back to the feed's root path (`/`) using a plain `<Link to="/">`, which does not carry forward the previous feed's filter/search/sort/page state, distinct from Requirement 15.4's native Back button behavior; this distinction is deliberate — a breadcrumb is a "go to the top-level feed" affordance and is not expected to preserve transient filter state, while browser Back is expected to return to exactly where the user was.
6. WHEN a feature's details page was reached other than by in-app feed or related-feature navigation (e.g. a direct page load, a browser refresh, or arrival from an external referrer), THE Frontend_Application SHALL have no prior in-app history entry to return to; in that case, an in-page "back to feed" affordance implemented as `navigate(-1)` SHALL instead behave as the breadcrumb does (Requirement 15.5), navigating to the feed's root path (`/`) rather than navigating to an unrelated page, a blank page, or outside the application, so "back to feed" always lands on the feed regardless of how the details page was reached.

### Frontend: Accessibility

#### Requirement 16: Accessibility Requirements

**User Story:** As a user relying on the keyboard or a screen reader, I want the Feature Details page and its new components to be fully operable and understandable without a mouse, so that I can use every feature this sprint adds.

##### Acceptance Criteria

1. THE FeatureDetailsPage and every new component introduced in this sprint (MarkdownEditor, AuthorCard, StatusTimeline, RelatedFeatures, ShareButton) SHALL be fully operable via keyboard alone: every interactive element (the ShareButton, Edit button, Delete button, the MarkdownEditor toolbar buttons, and the live-preview toggle) SHALL be reachable via Tab and activatable via Enter or Space, and every RelatedFeatures card SHALL be reachable via Tab and activatable via Enter, consistent with its implementation as a navigable link rather than a button; StatusTimeline and AuthorCard SHALL NOT be required to receive keyboard focus, as neither renders an interactive control.
2. THE Frontend_Application SHALL render a visible focus indicator (e.g. a focus ring via Tailwind's `focus-visible` utilities) on every interactive element introduced or modified in this sprint, such that the indicator forms a continuous, unbroken outline or ring fully surrounding the focused element and is visually distinguishable from both the element's own resting-state appearance and the surrounding page background; THE Frontend_Application SHALL NOT suppress the browser's default focus outline without supplying a replacement meeting this same criterion.
3. THE Tab order across the FeatureDetailsPage's interactive elements (ShareButton, Edit button, Delete button, RelatedFeatures cards, and, within MarkdownEditor, the toolbar buttons and live-preview toggle) SHALL follow the same sequence as their visual top-to-bottom, left-to-right reading order at the viewport width being tested, without a `tabindex` value greater than `0` on any element.
4. THE ShareButton, Edit button, Delete button, and every MarkdownEditor toolbar button SHALL carry an `aria-label` (or accessible, visible text equivalent) describing its action, because several of these render as icon-only or icon-plus-terse-label controls where the accessible name would otherwise be ambiguous or absent; any icon glyph rendered inside these buttons SHALL be hidden from assistive technology (e.g. via `aria-hidden="true"`) so that the icon is not announced as redundant or unlabeled content alongside the button's accessible name.
5. THE MarkdownEditor's toolbar SHALL be implemented as a `<div role="toolbar">` (or a semantically equivalent grouping) containing individually-labeled `<button type="button">` elements, each with an `aria-label` naming its markdown action (e.g. `"Insert heading 1"`, `"Insert bold text"`, `"Insert link"`), so a screen reader user can identify each toolbar action without relying on an icon alone.
6. THE MarkdownEditor's live-preview toggle SHALL expose its current state to assistive technology (e.g. `aria-pressed` on a toggle button, or a labeled checkbox/switch), so a screen reader user can determine whether the preview is currently shown.
7. THE StatusTimeline SHALL expose which of the four Feature_Status stages is the feature's current stage to assistive technology by a means other than color or visual highlighting alone (e.g. text such as `"Current status"` associated with that stage, or an `aria-current` attribute on that stage's element), so a screen reader user can determine the feature's current status without relying on visual presentation.
8. WHEN the Edit button opens EditFeatureModal, or a Delete button's confirmation opens ConfirmDialog, THE Frontend_Application SHALL move keyboard focus into the opened dialog, SHALL confine Tab and Shift+Tab navigation to the elements within that dialog while it is open, and SHALL return keyboard focus to the control that opened it once the dialog is closed (by confirmation, cancellation, or dismissal).

### Frontend: Visual Polish

#### Requirement 17: General Visual Polish

**User Story:** As a user, I want the Feature Details page and its surrounding components to feel cohesive and polished, so that the product feels complete rather than assembled from disconnected pieces.

##### Acceptance Criteria

1. THE FeatureDetailsPage SHALL apply responsive spacing (padding/margin/gap utilities that scale with viewport width via Tailwind's responsive prefixes) consistent with the spacing conventions already used by HomePage and FeatureCard in Sprint 2A.
2. WHILE the viewport is at desktop width, THE FeatureDetailsPage SHALL render its Edit/Delete/Share action controls in a section that remains visible (fixed in place within the viewport) while the user scrolls the page's markdown content; WHILE the viewport is at mobile width, THE FeatureDetailsPage SHALL render those same action controls as a non-sticky, full-width-friendly button group sized for touch targets (minimum 44x44 CSS pixels per control), because a fixed/sticky bar competes for limited vertical space on small viewports.
3. THE FeatureDetailsPage and its new components SHALL use consistent badge colors per Feature_Category (`ui_ux`, `integrations`, `performance`, `general`) and per Feature_Status (`under_review`, `planned`, `in_progress`, `completed`) applied identically everywhere a category or status badge is rendered in this sprint (FeatureDetailsPage's own badges, RelatedFeatures cards, StatusTimeline stages), so the same category or status always reads as the same color across the page; the specific color-to-value mapping is an implementation detail left to the design document, provided it is defined once and reused everywhere rather than redefined per component.
4. THE FeatureDetailsPage and its new components SHALL apply a visible hover state (e.g. a background or border color shift) to every clickable, mouse-operable element (buttons, RelatedFeatures cards, the breadcrumb link) using Tailwind's `hover:` utilities, and SHALL apply a visible focus state to every keyboard-focusable element among them, consistent with Requirement 16.2.
5. THE FeatureDetailsPage and its new components SHALL apply CSS transitions (Tailwind's `transition` utilities, e.g. `transition-colors`) to hover/focus state changes, and SHALL NOT introduce any JavaScript animation library (e.g. Framer Motion, React Spring, GSAP) to implement those transitions, per this sprint's explicit "No animation libraries" constraint.

## Non-Goals

This sprint explicitly does NOT implement:

1. Upvote functionality of any kind — no vote button, no vote-casting API call, no optimistic vote count change. `VotingPlaceholder` (Requirement 13) is a static, non-functional card only.
2. Threaded comments of any kind — no comment list, no comment submission, no reply UI. `CommentsPlaceholder` (Requirement 13) is a static, non-functional card only.
3. An admin dashboard or any admin-only moderation UI beyond the existing, unmodified `AdminDashboardPage` placeholder from prior sprints.
4. Kanban drag-and-drop or any other roadmap visualization change.
5. Any control that changes a feature request's `status` (roadmap status changes remain an administrative capability reserved for a future sprint, per Sprint 2A's Requirement 5.6 and this sprint's `StatusTimeline` being explicitly read-only, Requirement 10.3).
6. Rendering markdown image syntax as an actual `<img>` element (Requirement 3.2); image rendering is deferred to a future sprint.
7. Any modification to the Feed_Endpoint's (`GET /api/v1/features`) request parameters, response shape, sorting, filtering, or search behavior (Requirement 1.9).
8. Any modification to the Create_Feature_Endpoint, Update_Feature_Endpoint, or Delete_Feature_Endpoint's request/response contracts established in Sprint 2A (Requirement 1.10).
9. Any modification to `Feature_Hooks`' (`useFeatures.js`) exported hook names, signatures, or React Query keys (Requirement 4.8).
10. Any new rich-text-editor library dependency (e.g. TipTap, Slate, Draft.js, Quill) — MarkdownEditor is implemented as a plain textarea plus string-insertion toolbar (Requirement 5.2).
11. Any new JavaScript animation library dependency (e.g. Framer Motion, React Spring, GSAP) — all transitions are CSS-only (Requirement 17.5).
12. A user profile page or any author-profile navigation target — AuthorCard renders as a non-navigable summary only (Requirement 9.6).
13. Cross-session (close-and-reopen, or cross-browser-session) draft persistence for CreateFeatureModal/EditFeatureModal's in-progress, unsubmitted content (Requirement 8.9); "draft preserved while open" is scoped strictly to the current modal mount.
