# Implementation Plan: Sprint 4 — Threaded Discussions

## Overview

This plan converts the Sprint 4 design into discrete coding steps ordered to
enable early validation. The backend comment stack (exceptions → models →
service → routes) is built first so the frontend can be developed against a
real API. Optimistic cache logic is tackled as a dedicated layer after the
base hooks are wired. All property tests use Hypothesis (Python) and
fast-check (JavaScript) as specified in the design document.

---

## Tasks

- [ ] 1. Add comment exception subclasses to `exceptions.py`
  - Append `CommentNotFoundException` (404), `CommentPermissionDeniedException`
    (403), `CommentDeletedException` (410), and `ReplyDepthExceededException`
    (422) as subclasses of `FeatureException` in
    `backend/app/core/exceptions.py`.
  - Do **not** add new exception handlers to `main.py`; the existing
    `@app.exception_handler(FeatureException)` covers all four.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 2. Implement `backend/app/models/comment.py`
  - [ ] 2.1 Write `CommentCreate`, `CommentUpdate`, `CommentResponse`,
        `CommentTreeResponse` Pydantic schemas
    - `CommentCreate`: `content_markdown` (3–2000 chars), optional
      `parent_comment_id: str | None = None`.
    - `CommentUpdate`: `content_markdown` (3–2000 chars).
    - `CommentResponse`: all 12 fields listed in the design; include
      `from_mongo()` classmethod mapping `_id` → `id` (stringified).
    - `CommentTreeResponse(CommentResponse)`: adds `replies:
      list["CommentTreeResponse"] = []`.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7_

  - [ ]* 2.2 Write property tests for `build_comment_tree()` — Properties 1, 2, 3
    - **Property 1: Tree Building — Total Inclusion**
      - Use Hypothesis `@given` with a strategy that generates lists of comment
        dicts with valid parent references (some top-level, some nested).
      - Assert `{n.id for n in flatten_tree(result)} == {str(d["_id"]) for d in docs}`.
      - **Feature: sprint-4-threaded-discussions, Property 1: Tree Building — Total Inclusion**
      - **Validates: Requirements 1.5, 4.1, 4.2**
    - **Property 2: Tree Building — Max Depth Invariant**
      - Use Hypothesis to generate chains of arbitrary depth (including > 3).
      - Assert `max_depth(result) <= 3`.
      - **Feature: sprint-4-threaded-discussions, Property 2: Tree Building — Max Depth Invariant**
      - **Validates: Requirements 1.6, 4.3, 4.4**
    - **Property 3: Tree Building — Oldest-First Ordering**
      - Use Hypothesis to generate comment lists with varying `created_at`.
      - Assert for every node in the tree: `replies` sorted ascending by `created_at`.
      - **Feature: sprint-4-threaded-discussions, Property 3: Tree Building — Oldest-First Ordering**
      - **Validates: Requirements 4.1, 4.2, 24.2**
    - File: `backend/tests/test_comment_properties.py`

  - [ ] 2.3 Write `build_comment_tree()` helper function
    - Implement the depth-tracking algorithm from the design:
      - Build `id_map` and `depth_map`.
      - Attach nodes to their parent if `parent_depth < 3`; otherwise walk
        up to the nearest depth-3 ancestor and attach there.
      - Preserve input (oldest-first) ordering; include soft-deleted nodes unchanged.
    - _Requirements: 1.5, 1.6, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 3. Implement `backend/app/services/comment_service.py`
  - [ ] 3.1 Scaffold service: `_collection()`, `_features_collection()`,
        `ensure_indexes()`, `find_comment_by_id()`
    - `_collection()` returns `db["comments"]`.
    - `_features_collection()` returns `db["features"]`.
    - `ensure_indexes()`: create indexes on `feature_id`, `parent_comment_id`,
      and compound `(feature_id, created_at ASC)`.
    - `find_comment_by_id()`: validate ObjectId, query by `_id`, return doc
      or `None`.
    - _Requirements: 2.4, 11.5_

  - [ ] 3.2 Implement `create_comment(data, feature_id, author)` and
        `reply_to_comment(data, parent_comment_id, author)`
    - `create_comment`: sanitize content, build doc with `parent_comment_id=None`,
      `reply_count=0`, `is_deleted=False`; insert into `comments`; atomically
      `$inc comment_count +1` on `features`.
    - `reply_to_comment`: look up parent (raise `CommentNotFoundException`
      if missing); insert reply doc with `parent_comment_id` set; atomically
      `$inc reply_count +1` on the parent comment and `$inc comment_count +1`
      on the feature.
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 5.2, 5.5_

  - [ ] 3.3 Implement `get_comments_for_feature(feature_id)` and
        `update_comment(comment_id, data, current_user)`
    - `get_comments_for_feature`: query `comments` filtered by `feature_id`,
      sorted `created_at ASC`; return flat list of docs.
    - `update_comment`: find comment → raise `CommentNotFoundException` if
      missing → raise `CommentPermissionDeniedException` if not author →
      raise `CommentDeletedException` if `is_deleted` → sanitize, `$set`
      `content_markdown` and `updated_at`; return updated doc.
    - _Requirements: 2.2, 6.1, 7.2, 7.3, 7.4, 7.5, 10.4, 11.2, 11.5_

  - [ ] 3.4 Implement `delete_comment(comment_id, current_user)`
    - Find comment → raise `CommentNotFoundException` if missing.
    - Check `is_author OR is_admin`; raise `CommentPermissionDeniedException`
      if neither.
    - `$set` `is_deleted=True`, `content_markdown="[deleted]"`,
      `author_name="[deleted]"`, `updated_at=now`.
    - If not `already_deleted`: atomically `$inc comment_count -1` on feature.
    - Return updated doc (idempotent: 200 even if already deleted).
    - _Requirements: 3.2, 3.3, 8.2, 8.3, 8.4, 8.5, 10.1, 10.2, 11.3, 11.5_

  - [ ]* 3.5 Write property test for sanitizer idempotence — Property 4
    - **Property 4: Sanitizer Idempotence**
    - Use Hypothesis `@given(st.text())`.
    - Assert `sanitize_markdown(sanitize_markdown(s)) == sanitize_markdown(s)`.
    - **Feature: sprint-4-threaded-discussions, Property 4: Sanitizer Idempotence**
    - **Validates: Requirements 2.2**
    - File: `backend/tests/test_comment_properties.py`

  - [ ]* 3.6 Write property test for soft-delete tombstone invariant — Property 5
    - **Property 5: Soft-Delete Tombstone Invariant**
    - Use Hypothesis to generate arbitrary comment documents.
    - Apply the soft-delete field transformations directly (pure mapping, no DB).
    - Assert `is_deleted=True`, `content_markdown="[deleted]"`,
      `author_name="[deleted]"`.
    - **Feature: sprint-4-threaded-discussions, Property 5: Soft-Delete Tombstone Invariant**
    - **Validates: Requirements 8.4, 10.1**
    - File: `backend/tests/test_comment_properties.py`

- [ ] 4. Backend checkpoint — ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement `backend/app/api/v1/comments.py` and update `features.py`
  - [ ] 5.1 Create `backend/app/api/v1/comments.py` with three routes
    - `POST /comments/{comment_id}/reply` → `require_verified_user` →
      call `comment_service.reply_to_comment`; return 201 with
      `CommentResponse.from_mongo(doc)`.
    - `PATCH /comments/{comment_id}` → `get_current_user` →
      call `comment_service.update_comment`; return 200 with
      `CommentResponse.from_mongo(doc)`.
    - `DELETE /comments/{comment_id}` → `get_current_user` →
      call `comment_service.delete_comment`; return 200 with
      `CommentResponse.from_mongo(doc)`.
    - All responses use `success_response()` envelope.
    - _Requirements: 5.4, 5.6, 7.1, 7.5, 8.1, 8.6_

  - [ ] 5.2 Add two comment routes to `backend/app/api/v1/features.py`
    - `POST /{feature_id}/comments` → `require_verified_user` →
      check feature exists (raise `FeatureNotFoundException` if not) →
      call `comment_service.create_comment`; return 201 with
      `CommentResponse.from_mongo(doc)`.
    - `GET /{feature_id}/comments` → no auth dependency →
      check feature exists (raise `FeatureNotFoundException` if not) →
      call `comment_service.get_comments_for_feature`; call
      `build_comment_tree(docs)`; return 200 with list of
      `CommentTreeResponse.model_dump()`.
    - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4_

  - [ ] 5.3 Register `comments` router in `backend/app/api/v1/__init__.py`
    - Import `comments` and call `api_router.include_router(comments.router,
      tags=["comments"])`.
    - _Requirements: 12.1, 12.2, 12.3_

  - [ ]* 5.4 Write integration tests for comment count synchronization
    - Test: create comment → feature `comment_count` incremented by 1.
    - Test: delete non-deleted comment → `comment_count` decremented by 1.
    - Test: delete already-deleted comment → `comment_count` unchanged.
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 5.5 Write unit tests for authorization rules
    - Edit: author succeeds (200), non-author gets 403, admin gets 403.
    - Delete: author succeeds (200), admin succeeds (200), stranger gets 403.
    - Delete already-deleted: 200 returned, `comment_count` not decremented.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 6. Implement `frontend/src/services/commentService.js`
  - Expose five methods using existing `httpClient`:
    - `getComments(featureId)` → GET `/api/v1/features/{featureId}/comments`
    - `createComment(featureId, payload)` → POST `/api/v1/features/{featureId}/comments`
    - `replyToComment(commentId, payload)` → POST `/api/v1/comments/{commentId}/reply`
    - `updateComment(commentId, payload)` → PATCH `/api/v1/comments/{commentId}`
    - `deleteComment(commentId)` → DELETE `/api/v1/comments/{commentId}`
  - Each returns `data.data` from the response.
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

- [ ] 7. Implement `frontend/src/hooks/useComments.js` — base queries and mutations
  - [ ] 7.1 Implement `useComments(featureId)` and the four base mutations
        without optimistic logic
    - `useComments`: `useQuery({ queryKey: ["comments", featureId], queryFn:
      () => commentService.getComments(featureId), enabled: Boolean(featureId) })`.
    - `useCreateComment`, `useReplyToComment`, `useUpdateComment`,
      `useDeleteComment`: wire to `commentService.*` with `onSuccess`
      invalidating `["comments", featureId]`.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [ ] 7.2 Add optimistic insert to `useCreateComment` and `useReplyToComment`
    - Implement `onMutate` → cancel queries → snapshot → build Optimistic_Comment
      → `setQueryData` to insert node.
    - Implement `onError` → rollback snapshot → `toast.error(...)`.
    - Implement `onSettled` → invalidate `["comments", featureId]` → update
      `comment_count` on `["feature", featureId]` and invalidate `["features"]`.
    - _Requirements: 14.6, 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ] 7.3 Add optimistic edit to `useUpdateComment` and optimistic soft-delete
        to `useDeleteComment`
    - `useUpdateComment` `onMutate`: snapshot → walk tree → update
      `content_markdown` and `updated_at` in-place → `setQueryData`.
    - `useDeleteComment` `onMutate`: snapshot → walk tree → set
      `is_deleted=true`, `content_markdown="[deleted]"`,
      `author_name="[deleted]"` → `setQueryData`.
    - Both: rollback on error + `toast.error`; invalidate on settled; delete
      also decrements `comment_count`.
    - _Requirements: 14.7, 16.1, 16.2, 16.3, 17.1, 17.2, 17.3_

  - [ ]* 7.4 Write property test for Optimistic_Comment shape — Property 6
    - **Property 6: Optimistic Comment Shape Completeness**
    - Use fast-check: `fc.record({ user: ..., featureId: fc.string(), content:
      fc.string(), parentCommentId: fc.option(fc.string()) })`.
    - For each generated tuple, call the optimistic-comment builder function
      (extracted as a pure helper) and assert all required fields are present
      with correct values.
    - **Feature: sprint-4-threaded-discussions, Property 6: Optimistic Comment Shape Completeness**
    - **Validates: Requirements 15.1, 15.2**
    - File: `frontend/src/hooks/__tests__/useComments.property.test.js`

- [ ] 8. Frontend comment stack checkpoint — ensure all frontend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement `frontend/src/components/CommentComposer.jsx`
  - Accept props: `{ onSubmit, onCancel, initialValue = "", mode = "compose",
    isLoading = false }`.
  - Render controlled `MarkdownEditor` + `CharacterCounter` (max 2000).
  - Disable submit button when `content.length < 3 || content.length > 2000 ||
    isLoading`; set `aria-disabled="true"` on the disabled button.
  - Show Cancel button in `"edit"` or `"reply"` mode; call `onCancel()`.
  - Submit calls `onSubmit(content)`.
  - Textarea has `aria-label` for accessibility.
  - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 25.2, 25.6_

  - [ ]* 9.1 Write property test for submit button disabled state — Property 7
    - **Property 7: CommentComposer Submit Disabled on Invalid Length**
    - Use fast-check: generate strings of various lengths (0 to 2500).
    - Mount `CommentComposer` with each string as initial value, query button
      disabled state.
    - Assert: disabled when `length < 3 || length > 2000`, enabled otherwise.
    - **Feature: sprint-4-threaded-discussions, Property 7: CommentComposer Submit Disabled on Invalid Length**
    - **Validates: Requirements 19.4, 19.5**
    - File: `frontend/src/components/__tests__/CommentComposer.property.test.jsx`

- [ ] 10. Implement `frontend/src/components/CommentCard.jsx`
  - [ ] 10.1 Implement base comment card rendering
    - Render `AuthorCard` with `authorName`, `role`, `isVerified`, `createdAt`
      from comment.
    - Render `MarkdownRenderer` with `content_markdown`.
    - When `is_deleted`: render tombstone state (dimmed, no actions, no author
      details).
    - When `updated_at !== created_at && !is_deleted`: render "(edited)" badge.
    - _Requirements: 20.1, 20.2, 20.3, 20.4_

  - [ ] 10.2 Implement action buttons: Reply, Edit, Delete, and Collapse toggle
    - Reply button: visible to authenticated verified users on non-deleted
      comments at depth < 3.
    - Edit button: visible to comment author only.
    - Delete button: visible to author or admin.
    - Collapse/Expand toggle with `aria-expanded` when `replies.length > 0`.
    - Delete activates `ConfirmDialog`.
    - Reply activates inline `CommentComposer` in `"reply"` mode.
    - Edit activates inline `CommentComposer` in `"edit"` mode pre-filled
      with current content.
    - _Requirements: 20.5, 20.6, 20.7, 20.8, 20.9, 20.11, 21.3, 25.1, 25.3, 25.4, 25.5_

  - [ ] 10.3 Implement recursive reply rendering with depth indentation
    - Recursively render `CommentCard` for each item in `comment.replies`.
    - Indent: `ml-2 sm:ml-4` per depth level; stop adding indentation at depth 3.
    - Pass `depth + 1` to child `CommentCard`.
    - _Requirements: 21.1, 21.2_

  - [ ]* 10.4 Write unit tests for CommentCard rendering states
    - Test tombstone: `is_deleted=true` → no action buttons, dimmed content.
    - Test edited badge: `updated_at !== created_at, is_deleted=false` → badge visible.
    - Test guest: not authenticated → no Reply button visible.
    - Test depth-3 card: no Reply button (excess depth flattening).
    - _Requirements: 20.3, 20.4, 20.5, 21.3_

- [ ] 11. Implement `frontend/src/components/DiscussionSection.jsx`
  - Accept props: `{ featureId, commentCount }`.
  - Use `useComments(featureId)` for the comment tree; `useAuth()` for the
    current user.
  - Heading: "Discussion ({commentCount})".
  - Loading state: skeleton placeholder in place of tree.
  - Error state: inline error with retry button.
  - Authenticated users: top-level `CommentComposer`.
  - Guests: persistent guest banner "Log in to join the discussion" linking
    to `/login`.
  - Empty state: friendly message when tree is empty.
  - Render tree via `CommentCard` starting at `depth=0`.
  - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 22.1, 22.3, 22.4,
    23.1, 23.4_

  - [ ]* 11.1 Write unit tests for DiscussionSection guest and empty states
    - Test: unauthenticated → guest banner visible, no CommentComposer.
    - Test: authenticated, empty tree → empty-state message visible.
    - Test: loading → skeleton visible, no comment tree.
    - _Requirements: 18.3, 18.4, 18.5, 18.6, 22.3_

- [ ] 12. Wire `DiscussionSection` into `FeatureDetailsPage` and deprecate placeholder
  - In `frontend/src/pages/FeatureDetailsPage.jsx`:
    - Replace `import { VotingPlaceholder, CommentsPlaceholder }` with
      `import { VotingPlaceholder } from "../components/Placeholders"`.
    - Add `import DiscussionSection from "../components/DiscussionSection"`.
    - Replace `<CommentsPlaceholder />` with
      `<DiscussionSection featureId={feature.id} commentCount={feature.comment_count} />`.
  - In `frontend/src/components/Placeholders.jsx`:
    - Keep `CommentsPlaceholder` exported unchanged (backward-compat);
      optionally add a JSDoc `@deprecated` comment.
  - _Requirements: 18.1, 18.7, 18.8_

- [ ] 13. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- All property tests (Properties 1–7) require Hypothesis ≥ 6.x for Python and
  fast-check ≥ 3.x for JavaScript — both already in the project's dev dependencies
  or can be added without new production libraries.
- Each property test is tagged with its feature and property number in a comment
  for traceability back to the design document.
- Checkpoints (tasks 4, 8, 13) are integration checkpoints: run the full test
  suite and confirm no regressions in Sprint 0–3 functionality.
- `backend/app/main.py` must not be modified — the existing `FeatureException`
  handler covers all four new exception subclasses.
- The `comments.py` router uses prefix `/comments`; the two feature-scoped
  comment routes remain in `features.py`.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.3", "3.2"] },
    { "id": 3, "tasks": ["2.2", "3.3", "3.4"] },
    { "id": 4, "tasks": ["3.5", "3.6", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3"] },
    { "id": 6, "tasks": ["5.4", "5.5", "6"] },
    { "id": 7, "tasks": ["7.1"] },
    { "id": 8, "tasks": ["7.2"] },
    { "id": 9, "tasks": ["7.3"] },
    { "id": 10, "tasks": ["7.4", "9"] },
    { "id": 11, "tasks": ["9.1", "10.1"] },
    { "id": 12, "tasks": ["10.2"] },
    { "id": 13, "tasks": ["10.3"] },
    { "id": 14, "tasks": ["10.4", "11"] },
    { "id": 15, "tasks": ["11.1", "12"] }
  ]
}
```
