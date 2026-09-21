import { useState } from "react";
import AuthorCard from "./AuthorCard";
import MarkdownRenderer from "./markdown/MarkdownRenderer";
import CommentComposer from "./CommentComposer";
import ConfirmDialog from "./ConfirmDialog";
import { useReplyToComment, useUpdateComment, useDeleteComment } from "../hooks/useComments";
import { useAuth } from "../context/AuthContext";

/**
 * Tailwind left-margin classes per nesting depth.
 * depth 0 → no indent, depth 1 → ml-4 (sm:ml-6), depth 2 → ml-8 (sm:ml-12),
 * depth 3+ → ml-12 (sm:ml-16).
 */
function depthMargin(depth) {
  if (depth <= 0) return "";
  if (depth === 1) return "ml-4 sm:ml-6";
  if (depth === 2) return "ml-8 sm:ml-12";
  return "ml-12 sm:ml-16";
}

/**
 * CommentCard renders a single comment node and recursively renders its
 * replies. Supports:
 *  - Tombstone state when `comment.is_deleted === true`
 *  - AuthorCard + MarkdownRenderer for live comments
 *  - "(edited)" badge when `updated_at !== created_at`
 *  - Depth-based left-margin indentation (0–3+)
 *  - Recursive rendering of `comment.replies`
 *  - Reply, Edit, Delete action buttons with appropriate visibility rules
 *  - Inline CommentComposer for reply and edit flows
 *  - Collapse/Expand toggle for replies (Req 20.11)
 *  - ConfirmDialog for destructive delete action
 *
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9,
 *               20.11, 21.1, 21.2, 21.3, 25.1, 25.3, 25.4, 25.5
 */
function CommentCard({ comment, depth = 0, featureId, currentUser }) {
  const margin = depthMargin(depth);
  const isDeleted = comment.is_deleted === true;

  // ── Collapse/Expand state for replies (Req 20.11) ──
  const [isExpanded, setIsExpanded] = useState(true);

  // ── Inline composer visibility ──
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [showEditComposer, setShowEditComposer] = useState(false);

  // ── Delete confirmation dialog ──
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── Mutation hooks ──
  const replyMutation = useReplyToComment();
  const updateMutation = useUpdateComment();
  const deleteMutation = useDeleteComment();

  // ── Auth ──
  const { user } = useAuth();

  // Tombstone: preserve position in tree, render a muted placeholder only
  if (isDeleted) {
    return (
      <div className={margin}>
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
          <p className="text-sm italic text-slate-400">[deleted]</p>
        </div>
        {/* Render replies even for deleted nodes to preserve tree structure */}
        {Array.isArray(comment.replies) && comment.replies.length > 0 && (
          <div className="mt-2 space-y-2">
            {comment.replies.map((reply) => (
              <CommentCard
                key={reply.id}
                comment={reply}
                depth={depth + 1}
                featureId={featureId}
                currentUser={currentUser}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isEdited =
    comment.updated_at &&
    comment.created_at &&
    comment.updated_at !== comment.created_at;

  const hasReplies = Array.isArray(comment.replies) && comment.replies.length > 0;

  // ── Visibility rules ──
  // Reply: authenticated + verified + depth < 3 (Req 20.5, 21.3)
  const canReply =
    user &&
    user.is_verified === true &&
    depth < 3;

  // Edit: comment author only (Req 20.6, 20.8)
  const canEdit =
    user &&
    user.id === comment.author_id;

  // Delete: author OR admin (Req 20.7, 20.9)
  const canDelete =
    user &&
    (user.id === comment.author_id || user.role === "admin");

  // ── Handlers ──
  function handleReplySubmit(content) {
    replyMutation.mutate(
      {
        commentId: comment.id,
        featureId,
        content,
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
          is_verified: user.is_verified,
        },
      },
      {
        onSuccess: () => {
          setShowReplyComposer(false);
          // Auto-expand replies so the new reply is visible
          setIsExpanded(true);
        },
      }
    );
  }

  function handleEditSubmit(content) {
    updateMutation.mutate(
      { commentId: comment.id, featureId, content },
      {
        onSuccess: () => setShowEditComposer(false),
      }
    );
  }

  function handleDeleteConfirm() {
    deleteMutation.mutate(
      { commentId: comment.id, featureId },
      {
        onSuccess: () => setShowDeleteConfirm(false),
      }
    );
  }

  return (
    <div className={margin}>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        {/* Author meta */}
        <AuthorCard
          authorName={comment.author_name}
          role={comment.author_role}
          isVerified={comment.is_verified}
          createdAt={comment.created_at}
        />

        {/* Edited badge */}
        {isEdited && (
          <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            edited
          </span>
        )}

        {/* Comment body */}
        {!showEditComposer && (
          <div className="mt-3">
            <MarkdownRenderer>{comment.content_markdown}</MarkdownRenderer>
          </div>
        )}

        {/* Inline edit composer (replaces body while editing) */}
        {showEditComposer && (
          <div className="mt-3">
            <CommentComposer
              mode="edit"
              initialValue={comment.content_markdown}
              isLoading={updateMutation.isPending}
              onSubmit={handleEditSubmit}
              onCancel={() => setShowEditComposer(false)}
            />
          </div>
        )}

        {/* Action buttons (Req 20.5–20.9, 20.11, 25.1, 25.3, 25.4, 25.5) */}
        {!showEditComposer && (
          <div className="mt-3 flex items-center gap-3">
            {/* Reply button (Req 20.5, 21.3) */}
            {canReply && (
              <button
                type="button"
                aria-label={showReplyComposer ? "Cancel reply" : "Reply to comment"}
                onClick={() => {
                  setShowReplyComposer((prev) => !prev);
                  // Close edit composer if open
                  setShowEditComposer(false);
                }}
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                {showReplyComposer ? "Cancel reply" : "Reply"}
              </button>
            )}

            {/* Edit button (Req 20.6, 20.8) */}
            {canEdit && (
              <button
                type="button"
                aria-label="Edit comment"
                onClick={() => {
                  setShowEditComposer((prev) => !prev);
                  // Close reply composer if open
                  setShowReplyComposer(false);
                }}
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Edit
              </button>
            )}

            {/* Delete button (Req 20.7, 20.9) */}
            {canDelete && (
              <button
                type="button"
                aria-label="Delete comment"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-sm font-medium text-red-500 hover:text-red-700"
              >
                Delete
              </button>
            )}

            {/* Collapse/Expand toggle (Req 20.11) */}
            {hasReplies && (
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-label={isExpanded ? "Hide replies" : "Show replies"}
                onClick={() => setIsExpanded((prev) => !prev)}
                className="ml-auto text-sm font-medium text-slate-500 hover:text-slate-800"
              >
                {isExpanded ? "Hide replies" : "Show replies"}
              </button>
            )}
          </div>
        )}

        {/* Inline reply composer — below content, above replies (Req 20.5) */}
        {showReplyComposer && (
          <div className="mt-4">
            <CommentComposer
              mode="reply"
              isLoading={replyMutation.isPending}
              onSubmit={handleReplySubmit}
              onCancel={() => setShowReplyComposer(false)}
            />
          </div>
        )}
      </div>

      {/* Recursive replies — conditionally rendered based on isExpanded */}
      {hasReplies && isExpanded && (
        <div className="mt-2 space-y-2">
          {comment.replies.map((reply) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              featureId={featureId}
              currentUser={currentUser}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete comment"
        message="Are you sure you want to delete this comment? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

export default CommentCard;
