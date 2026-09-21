# Requirements Document

## Introduction

Sprint 4 adds a complete threaded discussion system to the Feature Roadmap Portal.
Authenticated, verified users can post top-level comments and nested replies (up to
depth 3) on any feature request. Comments support markdown content, soft-delete
(deleted content is tombstoned in place, not removed from the tree), and author-only
editing. The feature's `comment_count` is maintained atomically on the feature
document. On the frontend, the existing `CommentsPlaceholder` is replaced by a live
`DiscussionSection` component that renders the full comment tree with optimistic
updates, loading skeletons, and a guest-friendly banner.

Sprint 0–3 work (auth, feature CRUD, voting, feed) is complete and must not be
modified by this sprint.

---

## Glossary

- **Comment_Model**: The Pydantic schemas (`CommentCreate`, `CommentUpdate`,
  `CommentResponse`, `CommentTreeResponse`) defined in
  `backend/app/models/comment.py`.
- **Comment_Service**: The module `backend/app/services/comment_service.py`
  containing all business logic for creating, reading, editing, and deleting
  comments, as well as updating `features.comment_count`.
- **Comment_API**: The FastAPI routes in `backend/app/api/v1/comments.py`
  (reply, edit, delete) plus the two comment routes added to
  `backend/app/api/v1/features.py` (create top-level comment, get comment tree).
- **Comment_Collection**: The MongoDB collection named `comments` that stores
  comment documents.
- **Comment_Document**: A single document in the Comment_Collection with the
  fields: `_id`, `feature_id`, `author_id`, `author_name`, `author_role`,
  `is_verified`, `parent_comment_id`, `content_markdown`, `reply_count`,
  `created_at`, `updated_at`, `is_deleted`.
- **Comment_Tree**: The nested structure of `CommentTreeResponse` objects
  produced by `build_comment_tree()`, where each node carries a `replies`
  list containing its direct children, to a maximum rendered depth of 3.
- **Top-Level_Comment**: A comment whose `parent_comment_id` is `null`.
- **Reply**: A comment whose `parent_comment_id` refers to an existing comment.
- **Soft_Delete**: Setting `is_deleted = True` on a Comment_Document without
  removing it; the tree position is preserved and the content is replaced with
  the tombstone value `"[deleted]"`.
- **Discussion_Section**: The React component
  `frontend/src/components/DiscussionSection.jsx` that replaces
  `CommentsPlaceholder` in `FeatureDetailsPage`.
- **Comment_Composer**: The React component
  `frontend/src/components/CommentComposer.jsx` used for both top-level
  comment creation and inline reply/edit forms.
- **Comment_Card**: The React component
  `frontend/src/components/CommentCard.jsx` that renders a single comment
  node and recursively renders its replies.
- **Comment_Service_JS**: The frontend module
  `frontend/src/services/commentService.js` that wraps HTTP calls to the
  Comment_API.
- **Comment_Hooks**: The React Query hooks in
  `frontend/src/hooks/useComments.js` that wrap Comment_Service_JS.
- **Optimistic_Comment**: A temporary comment object inserted into the React
  Query cache before the server confirms creation, identified by an id
  prefixed `"optimistic-"`.
- **Depth**: The nesting level of a comment: 0 = top-level, 1 = reply to
  top-level, 2 = reply to depth-1, 3 = reply to depth-2. Depth > 3 is
  flattened to depth 3.
- **Feature_Service**: The existing module
  `backend/app/services/feature_service.py`; Sprint 4 adds no new functions
  to it — `comment_count` changes are issued by Comment_Service directly
  against the `features` collection using `$inc`.
- **FeatureException**: The base class for all feature-domain exceptions in
  `backend/app/core/exceptions.py`; all new comment exceptions subclass it.
- **Markdown_Sanitizer**: The existing `sanitize_markdown` function in
  `backend/app/utils/markdown_sanitizer.py`, applied to
  `content_markdown` at write-time.
- **AuthorCard**: The existing React component
  `frontend/src/components/AuthorCard.jsx` with props
  `{ authorName, role, isVerified, createdAt }`.
- **MarkdownEditor**: The existing fully-controlled React component
  `frontend/src/components/MarkdownEditor.jsx` with props
  `{ value, onChange }`.
- **MarkdownRenderer**: The existing React component
  `frontend/src/components/markdown/MarkdownRenderer.jsx` that accepts
  a markdown string as children.
- **CharacterCounter**: The existing React component
  `frontend/src/components/CharacterCounter.jsx` with props
  `{ length, max }`.

---

## Requirements

### Requirement 1: Comment Model

**User Story:** As a developer, I want well-defined Pydantic schemas for comments,
so that the API boundary is type-safe and consistently validated.

#### Acceptance Criteria

1. THE Comment_Model SHALL define a `CommentCreate` schema with a required
   `content_markdown` field validated to 3–2000 characters and an optional
   `parent_comment_id` string field (defaulting to `None`).
2. THE Comment_Model SHALL define a `CommentUpdate` schema with a required
   `content_markdown` field validated to 3–2000 characters.
3. THE Comment_Model SHALL define a `CommentResponse` schema with fields:
   `id` (str), `feature_id` (str), `author_id` (str), `author_name` (str),
   `author_role` (str), `is_verified` (bool), `parent_comment_id`
   (str | None), `content_markdown` (str), `reply_count` (int),
   `created_at` (datetime), `updated_at` (datetime), `is_deleted` (bool).
4. THE Comment_Model SHALL define a `CommentTreeResponse` schema that extends
   `CommentResponse` with a `replies` field typed as a list of
   `CommentTreeResponse` (recursive), defaulting to an empty list.
5. THE Comment_Model SHALL provide a `build_comment_tree()` helper function
   that accepts a flat list of Comment_Documents and returns a list of
   `CommentTreeResponse` objects ordered oldest-first at every depth level.
6. WHEN `build_comment_tree()` processes a comment whose computed depth
   exceeds 3, THE Comment_Model SHALL attach that comment as a direct child
   of the deepest depth-3 ancestor instead of nesting further.
7. THE Comment_Model SHALL provide a `CommentResponse.from_mongo()` classmethod
   that maps `doc["_id"]` → `id` (stringified) and reads all declared fields
   from the document.

---

### Requirement 2: Comment Document Storage

**User Story:** As a developer, I want comments stored as structured MongoDB
documents, so that queries and atomic updates are efficient.

#### Acceptance Criteria

1. THE Comment_Service SHALL store each new Comment_Document in the
   `comments` collection with fields: `feature_id` (str), `author_id` (str),
   `author_name` (str), `author_role` (str), `is_verified` (bool),
   `parent_comment_id` (str | None), `content_markdown` (sanitized str),
   `reply_count` (int, default 0), `created_at` (datetime, UTC),
   `updated_at` (datetime, UTC), `is_deleted` (bool, default False).
2. THE Comment_Service SHALL call `Markdown_Sanitizer.sanitize_markdown` on
   `content_markdown` before every write (create and edit).
3. WHEN a new comment is created with a non-null `parent_comment_id`, THE
   Comment_Service SHALL atomically increment the parent comment's
   `reply_count` by 1 using `$inc`.
4. THE Comment_Service SHALL create indexes on `feature_id` and
   `parent_comment_id` in `ensure_indexes()`.

---

### Requirement 3: Comment Count Synchronization

**User Story:** As a user, I want the feature's comment count to accurately
reflect all active comments, so that the feed and detail views show consistent
discussion activity.

#### Acceptance Criteria

1. WHEN any comment (top-level or reply) is created, THE Comment_Service SHALL
   atomically increment `features.comment_count` by 1 using `$inc` on the
   `features` collection.
2. WHEN a comment that is NOT already deleted is soft-deleted, THE
   Comment_Service SHALL atomically decrement `features.comment_count` by 1
   using `$inc` on the `features` collection.
3. WHEN a comment that IS already deleted (`is_deleted == True`) is targeted
   by a delete request, THE Comment_Service SHALL NOT change
   `features.comment_count`.
4. THE Comment_Service SHALL never compute `comment_count` by counting
   Comment_Documents at query time; it SHALL only maintain it via `$inc`.

---

### Requirement 4: Thread Building Rules

**User Story:** As a user, I want to see comments in a clear nested structure,
so that I can follow conversation threads naturally.

#### Acceptance Criteria

1. THE `build_comment_tree()` function SHALL produce a tree where each node's
   `replies` list contains only its direct children, ordered by `created_at`
   ascending (oldest-first).
2. THE `build_comment_tree()` function SHALL place top-level comments
   (`parent_comment_id == None`) at the root of the returned list, ordered by
   `created_at` ascending.
3. THE `build_comment_tree()` function SHALL support a maximum rendered depth
   of 3 (depth 0 = top-level, depth 3 = maximum).
4. WHEN `build_comment_tree()` encounters a comment whose natural depth
   exceeds 3, THE function SHALL attach that comment to the `replies` list of
   its nearest depth-3 ancestor rather than creating a deeper level.
5. THE `build_comment_tree()` function SHALL include soft-deleted comments in
   the tree with `content_markdown = "[deleted]"` and `author_name =
   "[deleted]"`, preserving their tree position.

---

### Requirement 5: Comment API Routes — Create

**User Story:** As a verified user, I want to post a comment or reply on a
feature request, so that I can participate in the discussion.

#### Acceptance Criteria

1. THE Comment_API SHALL expose `POST /api/v1/features/{feature_id}/comments`
   in `backend/app/api/v1/features.py`, protected by `require_verified_user`.
2. WHEN a `POST /api/v1/features/{feature_id}/comments` request is received
   for a feature that does not exist, THE Comment_API SHALL return HTTP 404
   using `FeatureNotFoundException`.
3. WHEN a valid `POST /api/v1/features/{feature_id}/comments` request is
   received, THE Comment_API SHALL return HTTP 201 with a
   `{success, message, data}` envelope where `data` is the serialized
   `CommentResponse`.
4. THE Comment_API SHALL expose `POST /api/v1/comments/{comment_id}/reply` in
   `backend/app/api/v1/comments.py`, protected by `require_verified_user`.
5. WHEN a `POST /api/v1/comments/{comment_id}/reply` request is received for
   a comment that does not exist, THE Comment_API SHALL return HTTP 404 using
   `CommentNotFoundException`.
6. WHEN a valid `POST /api/v1/comments/{comment_id}/reply` request is received,
   THE Comment_API SHALL return HTTP 201 with a `{success, message, data}`
   envelope where `data` is the serialized `CommentResponse`.

---

### Requirement 6: Comment API Routes — Read

**User Story:** As any visitor, I want to read all comments on a feature request,
so that I can understand the community discussion without logging in.

#### Acceptance Criteria

1. THE Comment_API SHALL expose `GET /api/v1/features/{feature_id}/comments`
   in `backend/app/api/v1/features.py`, with no authentication requirement
   (using `get_optional_current_user` or no auth dependency).
2. WHEN a `GET /api/v1/features/{feature_id}/comments` request is received for
   a feature that does not exist, THE Comment_API SHALL return HTTP 404 using
   `FeatureNotFoundException`.
3. WHEN a valid `GET /api/v1/features/{feature_id}/comments` request is received,
   THE Comment_API SHALL return HTTP 200 with a `{success, message, data}`
   envelope where `data` is a list of `CommentTreeResponse` objects.
4. THE Comment_API SHALL return the full comment tree including soft-deleted
   nodes; soft-deleted nodes SHALL have `content_markdown = "[deleted]"` and
   `author_name = "[deleted]"`.

---

### Requirement 7: Comment API Routes — Edit

**User Story:** As a comment author, I want to edit my own comments, so that I
can correct mistakes or update my thoughts.

#### Acceptance Criteria

1. THE Comment_API SHALL expose `PATCH /api/v1/comments/{comment_id}` in
   `backend/app/api/v1/comments.py`, protected by `get_current_user`.
2. WHEN a `PATCH /api/v1/comments/{comment_id}` request targets a comment that
   does not exist, THE Comment_API SHALL return HTTP 404 using
   `CommentNotFoundException`.
3. WHEN a `PATCH /api/v1/comments/{comment_id}` request is made by a user who
   is not the comment's author, THE Comment_API SHALL return HTTP 403 using
   `CommentPermissionDeniedException`.
4. WHEN a `PATCH /api/v1/comments/{comment_id}` request targets a comment that
   is already deleted (`is_deleted == True`), THE Comment_API SHALL return HTTP
   410 using `CommentDeletedException`.
5. WHEN a valid `PATCH /api/v1/comments/{comment_id}` request is received, THE
   Comment_API SHALL update `content_markdown` (sanitized) and set
   `updated_at` to the current UTC time, then return HTTP 200 with a
   `{success, message, data}` envelope where `data` is the updated
   `CommentResponse`.

---

### Requirement 8: Comment API Routes — Delete

**User Story:** As a comment author or admin, I want to delete comments, so that
inappropriate or mistaken content can be removed.

#### Acceptance Criteria

1. THE Comment_API SHALL expose `DELETE /api/v1/comments/{comment_id}` in
   `backend/app/api/v1/comments.py`, protected by `get_current_user`.
2. WHEN a `DELETE /api/v1/comments/{comment_id}` request targets a comment that
   does not exist, THE Comment_API SHALL return HTTP 404 using
   `CommentNotFoundException`.
3. WHEN a `DELETE /api/v1/comments/{comment_id}` request is made by a user who
   is neither the comment's author nor an admin, THE Comment_API SHALL return
   HTTP 403 using `CommentPermissionDeniedException`.
4. WHEN a valid `DELETE /api/v1/comments/{comment_id}` request is received, THE
   Comment_Service SHALL perform a soft-delete: set `is_deleted = True`,
   `content_markdown = "[deleted]"`, `author_name = "[deleted]"`, and
   `updated_at` to the current UTC time.
5. WHEN a `DELETE /api/v1/comments/{comment_id}` request targets a comment that
   is already soft-deleted, THE Comment_Service SHALL still return HTTP 200
   (idempotent) without changing `features.comment_count`.
6. WHEN a valid `DELETE /api/v1/comments/{comment_id}` request is received for
   a non-deleted comment, THE Comment_API SHALL return HTTP 200 with a
   `{success, message, data}` envelope where `data` is the soft-deleted
   `CommentResponse`.

---

### Requirement 9: Comment Exceptions

**User Story:** As a developer, I want a consistent exception hierarchy for
comment-domain errors, so that errors map cleanly to HTTP status codes without
adding new exception handlers to `main.py`.

#### Acceptance Criteria

1. THE Comment_Exception SHALL add `CommentNotFoundException` (HTTP 404) as a
   subclass of `FeatureException` in `backend/app/core/exceptions.py`.
2. THE Comment_Exception SHALL add `CommentPermissionDeniedException` (HTTP 403)
   as a subclass of `FeatureException` in `backend/app/core/exceptions.py`.
3. THE Comment_Exception SHALL add `CommentDeletedException` (HTTP 410) as a
   subclass of `FeatureException` in `backend/app/core/exceptions.py`.
4. THE Comment_Exception SHALL add `ReplyDepthExceededException` (HTTP 422) as a
   subclass of `FeatureException` in `backend/app/core/exceptions.py`.
5. THE `backend/app/main.py` SHALL NOT be modified to add new exception
   handlers; the existing `@app.exception_handler(FeatureException)` SHALL
   handle all four new exception subclasses.

---

### Requirement 10: Soft Delete Behavior

**User Story:** As a user, I want deleted comments to remain visible as
tombstones in the thread, so that conversation context is preserved even after
removal.

#### Acceptance Criteria

1. WHEN a comment is soft-deleted, THE Comment_Service SHALL set `is_deleted =
   True`, `content_markdown = "[deleted]"`, `author_name = "[deleted]"`, and
   `updated_at` to current UTC time in a single atomic update.
2. THE Comment_Service SHALL never perform a hard-delete (physical removal) of
   a comment document.
3. WHEN fetching the comment tree, THE Comment_API SHALL include soft-deleted
   comments at their original tree position.
4. THE Comment_Service SHALL prevent editing a soft-deleted comment by raising
   `CommentDeletedException`.

---

### Requirement 11: Permissions

**User Story:** As a user, I want clear access control on comments, so that
only authorized users can perform mutations.

#### Acceptance Criteria

1. THE Comment_Service SHALL require `require_verified_user` for creating
   top-level comments and replies.
2. THE Comment_Service SHALL allow only the comment's author to edit the
   comment; any other user (including admins) SHALL receive HTTP 403.
3. THE Comment_Service SHALL allow the comment's author OR any admin to delete
   a comment; any other user SHALL receive HTTP 403.
4. THE Comment_API SHALL expose the comment tree read endpoint without any
   authentication requirement.
5. WHEN checking authorization for edit or delete, THE Comment_Service SHALL
   check for existence first (raising `CommentNotFoundException` before
   `CommentPermissionDeniedException`).

---

### Requirement 12: Router Registration

**User Story:** As a developer, I want the comment routes registered alongside
existing routes, so that the API is consistently namespaced.

#### Acceptance Criteria

1. THE `backend/app/api/v1/__init__.py` SHALL import and include the router
   from `backend/app/api/v1/comments.py` with the `"comments"` tag.
2. THE Comment_API routes in `comments.py` SHALL use the prefix `/comments`
   on the router.
3. THE two comment routes added to `features.py` (`POST
   /api/v1/features/{feature_id}/comments` and `GET
   /api/v1/features/{feature_id}/comments`) SHALL remain in `features.py` and
   not move to `comments.py`.

---

### Requirement 13: Frontend Comment Service

**User Story:** As a developer, I want a clean HTTP service layer for comment
operations, so that components are decoupled from raw fetch calls.

#### Acceptance Criteria

1. THE Comment_Service_JS SHALL expose `getComments(featureId)` that calls
   `GET /api/v1/features/{featureId}/comments` and returns `data.data`.
2. THE Comment_Service_JS SHALL expose `createComment(featureId, payload)` that
   calls `POST /api/v1/features/{featureId}/comments` and returns `data.data`.
3. THE Comment_Service_JS SHALL expose `replyToComment(commentId, payload)`
   that calls `POST /api/v1/comments/{commentId}/reply` and returns `data.data`.
4. THE Comment_Service_JS SHALL expose `updateComment(commentId, payload)` that
   calls `PATCH /api/v1/comments/{commentId}` and returns `data.data`.
5. THE Comment_Service_JS SHALL expose `deleteComment(commentId)` that calls
   `DELETE /api/v1/comments/{commentId}` and returns `data.data`.
6. THE Comment_Service_JS SHALL use the existing `httpClient` from
   `frontend/src/services/httpClient.js` for all HTTP calls.

---

### Requirement 14: Frontend Comment Hooks

**User Story:** As a developer, I want React Query hooks for comment operations,
so that server state is managed consistently across the app.

#### Acceptance Criteria

1. THE Comment_Hooks SHALL export `useComments(featureId)` as a `useQuery`
   with key `["comments", featureId]`.
2. THE Comment_Hooks SHALL export `useCreateComment()` as a `useMutation` that
   calls `commentService.createComment`.
3. THE Comment_Hooks SHALL export `useReplyToComment()` as a `useMutation`
   that calls `commentService.replyToComment`.
4. THE Comment_Hooks SHALL export `useUpdateComment()` as a `useMutation` that
   calls `commentService.updateComment`.
5. THE Comment_Hooks SHALL export `useDeleteComment()` as a `useMutation` that
   calls `commentService.deleteComment`.
6. WHEN `useCreateComment` or `useReplyToComment` succeeds, THE Comment_Hooks
   SHALL invalidate `["comments", featureId]` and update `comment_count` on
   `["feature", featureId]` and `["features"]` query caches.
7. WHEN `useDeleteComment` succeeds on a non-deleted comment, THE Comment_Hooks
   SHALL invalidate `["comments", featureId]` and decrement `comment_count`
   on `["feature", featureId]` and `["features"]` query caches.
8. THE Comment_Hooks SHALL NOT modify `useFeatures.js` or `featureService.js`.

---

### Requirement 15: Optimistic Comment Creation

**User Story:** As a user, I want my comment to appear instantly in the thread
when I submit it, so that the UI feels responsive.

#### Acceptance Criteria

1. WHEN `useCreateComment` or `useReplyToComment` is called, THE Comment_Hooks
   SHALL perform an optimistic insert into the `["comments", featureId]`
   cache before the server responds.
2. THE Optimistic_Comment inserted SHALL have the shape:
   `{ id: "optimistic-${Date.now()}", feature_id, author_id, author_name,
   author_role, is_verified, parent_comment_id, content_markdown, reply_count: 0,
   replies: [], created_at, updated_at, is_deleted: false }`.
3. WHEN the mutation fails, THE Comment_Hooks SHALL roll back the cache to the
   snapshot taken before the optimistic insert and display a Sonner error toast.
4. WHEN the mutation settles (success or failure), THE Comment_Hooks SHALL
   invalidate `["comments", featureId]` to sync with server state.
5. WHEN optimistic insert succeeds and the server responds, THE Comment_Hooks
   SHALL replace the Optimistic_Comment with the server-confirmed comment.

---

### Requirement 16: Optimistic Edit

**User Story:** As a user, I want my edited comment to update immediately in
the UI, so that the editing experience is smooth.

#### Acceptance Criteria

1. WHEN `useUpdateComment` is called, THE Comment_Hooks SHALL perform an
   optimistic update of the matching comment in the `["comments", featureId]`
   cache using `setQueryData`, updating `content_markdown` and `updated_at`.
2. WHEN the mutation fails, THE Comment_Hooks SHALL roll back the cache and
   display a Sonner error toast.
3. WHEN the mutation settles, THE Comment_Hooks SHALL invalidate
   `["comments", featureId]`.

---

### Requirement 17: Optimistic Delete

**User Story:** As a user, I want deleted comments to show as tombstones
immediately, so that the tree structure remains visible while the server confirms.

#### Acceptance Criteria

1. WHEN `useDeleteComment` is called, THE Comment_Hooks SHALL perform an
   optimistic soft-delete in the `["comments", featureId]` cache: set
   `is_deleted: true`, `content_markdown: "[deleted]"`, `author_name:
   "[deleted]"` on the matching comment.
2. WHEN the mutation fails, THE Comment_Hooks SHALL roll back the cache and
   display a Sonner error toast.
3. WHEN the mutation settles, THE Comment_Hooks SHALL invalidate
   `["comments", featureId]`.

---

### Requirement 18: Discussion Section

**User Story:** As a user, I want to see the threaded discussion on a feature
details page, so that I can read and participate in the conversation.

#### Acceptance Criteria

1. THE Discussion_Section SHALL replace `CommentsPlaceholder` in
   `frontend/src/pages/FeatureDetailsPage.jsx`.
2. THE Discussion_Section SHALL display a heading showing the current
   `comment_count` from the feature (e.g. "Discussion (5)").
3. WHEN comments are loading, THE Discussion_Section SHALL render a loading
   skeleton in place of the comment tree.
4. WHEN the comment tree is empty and the user is authenticated, THE
   Discussion_Section SHALL display an empty-state message inviting the user
   to post the first comment.
5. WHEN the comment tree is empty and the user is a guest, THE Discussion_Section
   SHALL display the empty-state message alongside a guest banner.
6. THE Discussion_Section SHALL render the top-level Comment_Composer for
   authenticated users only; guests SHALL see a login prompt banner instead.
7. THE Discussion_Section SHALL render the comment tree using `CommentCard`
   recursively.
8. THE `Placeholders.jsx` file SHALL be kept; `CommentsPlaceholder` SHALL
   remain exported (possibly marked deprecated) to avoid breaking other imports.

---

### Requirement 19: Comment Composer

**User Story:** As a user, I want a markdown-capable composer for writing
comments and replies, so that I can format my contributions consistently with
the rest of the portal.

#### Acceptance Criteria

1. THE Comment_Composer SHALL reuse `MarkdownEditor` (controlled, `{ value,
   onChange }`) and `CharacterCounter` (with max 2000) unchanged.
2. THE Comment_Composer SHALL support two modes: "compose" (new top-level
   comment or new reply) and "edit" (editing an existing comment).
3. THE Comment_Composer SHALL be disabled (textarea and submit button not
   interactive) while the mutation is pending.
4. WHEN the content is fewer than 3 characters, THE Comment_Composer SHALL
   disable the submit button.
5. WHEN the content exceeds 2000 characters, THE Comment_Composer SHALL
   disable the submit button.
6. WHEN the submit button is activated with valid content, THE Comment_Composer
   SHALL call the provided `onSubmit(content)` callback.
7. THE Comment_Composer SHALL provide a Cancel button in edit mode that calls
   the provided `onCancel()` callback without submitting.

---

### Requirement 20: Comment Card

**User Story:** As a user, I want each comment to display its author, content,
and actions clearly, so that I can understand who said what and respond.

#### Acceptance Criteria

1. THE Comment_Card SHALL render `AuthorCard` (compact variant) with
   `authorName`, `role`, `isVerified`, and `createdAt` from the comment.
2. THE Comment_Card SHALL render `MarkdownRenderer` with the comment's
   `content_markdown`.
3. WHEN `is_deleted` is true, THE Comment_Card SHALL render the tombstone state:
   dimmed text, no author details, no action buttons.
4. WHEN `updated_at` differs from `created_at` and `is_deleted` is false, THE
   Comment_Card SHALL display an "(edited)" badge.
5. THE Comment_Card SHALL display a Reply button visible to authenticated,
   verified users for non-deleted comments.
6. THE Comment_Card SHALL display Edit and Delete buttons to the comment's
   author; Delete only (no Edit) is displayed to admins who are not the author.
7. WHEN the Reply button is activated, THE Comment_Card SHALL inline-render a
   Comment_Composer in reply mode.
8. WHEN the Edit button is activated, THE Comment_Card SHALL inline-render a
   Comment_Composer in edit mode pre-filled with the current content.
9. WHEN the Delete button is activated, THE Comment_Card SHALL open
   `ConfirmDialog` before calling `useDeleteComment`.
10. THE Comment_Card SHALL render its `replies` list recursively, each at one
    additional level of visual indentation.
11. WHEN a comment has at least one reply, THE Comment_Card SHALL render a
    Collapse/Expand toggle for the replies list.

---

### Requirement 21: Nested Replies Display

**User Story:** As a user, I want replies indented visually under their parent
comment, so that the thread hierarchy is immediately clear.

#### Acceptance Criteria

1. THE Comment_Card SHALL indent reply cards by a fixed amount per depth level
   (e.g. `ml-4` or `pl-4` Tailwind class) relative to the parent card.
2. THE Comment_Card SHALL stop adding indentation beyond depth 3; depth-3+
   excess-depth comments are rendered at the same visual indentation as their
   depth-3 parent.
3. THE Comment_Card SHALL not render a Reply button on comments at depth 3,
   since replies would be flattened.

---

### Requirement 22: Guest Experience

**User Story:** As a guest (unauthenticated visitor), I want to read all
comments but be clearly directed to log in before I can participate, so that
the experience is welcoming without requiring registration just to browse.

#### Acceptance Criteria

1. THE Discussion_Section SHALL display the full comment tree to guests without
   requiring authentication.
2. WHEN a guest activates a Reply button (if visible), THE Discussion_Section
   SHALL open `LoginRequiredModal` instead of opening the reply composer.
3. THE Discussion_Section SHALL display a persistent guest banner with
   "Log in to join the discussion" that links to the login page.
4. THE Guest banner SHALL not block the display of existing comments.

---

### Requirement 23: Loading and Error UX

**User Story:** As a user, I want clear feedback during loading and on errors,
so that I understand what's happening when the app is working.

#### Acceptance Criteria

1. WHEN `useComments` is loading, THE Discussion_Section SHALL render a
   skeleton placeholder in place of the comment tree.
2. WHEN a comment mutation (create, reply, edit, delete) fails, THE
   Comment_Hooks SHALL display a Sonner error toast with a descriptive message.
3. WHEN a comment mutation (create, reply, edit, delete) succeeds, THE
   Comment_Hooks or the calling component SHALL display a Sonner success toast.
4. IF `useComments` returns an error, THE Discussion_Section SHALL render an
   inline error state with a retry button.

---

### Requirement 24: Comment Sorting

**User Story:** As a user, I want comments displayed oldest-first within each
level, so that conversations flow chronologically.

#### Acceptance Criteria

1. THE Comment_Service SHALL fetch comments for a feature ordered by
   `created_at` ascending before passing them to `build_comment_tree()`.
2. THE `build_comment_tree()` function SHALL preserve oldest-first ordering
   at every depth level in the resulting tree.

---

### Requirement 25: Accessibility

**User Story:** As a user relying on assistive technologies, I want the
discussion section to be fully navigable by keyboard and screen reader, so
that I can participate regardless of how I interact with the page.

#### Acceptance Criteria

1. THE Discussion_Section and Comment_Card SHALL use semantic HTML elements
   (`<article>`, `<section>`, `<button>`) with appropriate ARIA labels.
2. THE Comment_Composer textarea SHALL have an associated `<label>` or
   `aria-label`.
3. THE Collapse/Expand toggle SHALL have `aria-expanded` set to the current
   expansion state.
4. THE ConfirmDialog opened for delete SHALL be a `role="dialog"` with
   `aria-modal="true"` and `aria-labelledby` (already provided by the
   existing `ConfirmDialog` component).
5. ALL interactive elements (Reply, Edit, Delete, Submit, Cancel, Collapse)
   SHALL be reachable and activatable via keyboard (Tab + Enter/Space).
6. THE Comment_Composer submit button SHALL have `aria-disabled="true"` when
   disabled to remain discoverable by screen readers.

---

### Requirement 26: Responsive UX

**User Story:** As a user on any screen size, I want the discussion section to
be fully usable, so that I can read and post comments from mobile or desktop.

#### Acceptance Criteria

1. THE Discussion_Section SHALL display correctly at viewport widths from 320px
   to 1280px+.
2. THE Comment_Composer textarea SHALL be at least 80px tall and expand as
   content grows.
3. THE comment action buttons (Reply, Edit, Delete) SHALL be touch-friendly
   with a minimum tap target of 44×44px on mobile widths.
4. THE depth indentation per level SHALL be smaller on mobile widths (e.g.
   `ml-2` mobile, `ml-4` desktop) to avoid horizontal overflow on narrow
   screens.
