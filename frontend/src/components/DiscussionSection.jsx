import { Link } from "react-router-dom";
import { useComments, useCreateComment } from "../hooks/useComments";
import { useAuth } from "../context/AuthContext";
import CommentCard from "./CommentCard";
import CommentComposer from "./CommentComposer";

/**
 * DiscussionSection renders the threaded discussion for a feature request.
 *
 * - Heading shows the feature's `commentCount` (kept in sync with the
 *   feature document; not re-derived from the comment tree).
 * - Loading state renders a skeleton placeholder (pulsing grey divs).
 * - Error state renders an inline error with a retry button wired to
 *   `refetch()`.
 * - Authenticated users see a top-level CommentComposer above the tree.
 * - Guests see a persistent "Log in to join the discussion" banner instead
 *   of the composer.
 * - The comment tree is rendered via CommentCard starting at depth 0.
 * - When the tree is empty (and not loading), a friendly empty-state
 *   message is displayed.
 *
 * Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7,
 *               22.1, 22.3, 22.4, 23.1, 23.4
 */
function DiscussionSection({ featureId, commentCount }) {
  const { data, isLoading, isError, refetch } = useComments(featureId);
  const { user } = useAuth();
  const createComment = useCreateComment();

  function handleTopLevelSubmit(content) {
    createComment.mutate({
      featureId,
      content,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        is_verified: user.is_verified,
      },
    });
  }

  return (
    <section aria-label="Discussion" className="flex flex-col gap-6">
      {/* Heading — always visible (Req 18.2) */}
      <h2 className="text-xl font-bold text-slate-900">
        Discussion ({commentCount ?? 0})
      </h2>

      {/* Guest banner — persistent, shown regardless of comments (Req 22.3, 22.4) */}
      {!user && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <span>Log in to join the discussion.</span>
          <Link
            to="/login"
            className="font-medium underline hover:text-blue-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Log in
          </Link>
        </div>
      )}

      {/* Top-level composer — authenticated users only (Req 18.6) */}
      {user && (
        <CommentComposer
          mode="compose"
          isLoading={createComment.isPending}
          onSubmit={handleTopLevelSubmit}
        />
      )}

      {/* Loading skeleton — replaces comment tree while fetching (Req 18.3, 23.1) */}
      {isLoading && (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading comments">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-lg border border-slate-100 bg-slate-50 p-4">
              <div className="mb-3 h-4 w-1/4 rounded bg-slate-200" />
              <div className="space-y-2">
                <div className="h-3 w-full rounded bg-slate-200" />
                <div className="h-3 w-5/6 rounded bg-slate-200" />
                <div className="h-3 w-4/6 rounded bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state with retry (Req 23.4) */}
      {isError && !isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-red-300 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">
            Failed to load comments. Please try again.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Retry
          </button>
        </div>
      )}

      {/* Comment tree (Req 18.7, 22.1) */}
      {!isLoading && !isError && data && data.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              depth={0}
              featureId={featureId}
              currentUser={user}
            />
          ))}
        </div>
      )}

      {/* Empty state (Req 18.4, 18.5) */}
      {!isLoading && !isError && data && data.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
          No comments yet. Be the first to start the discussion!
        </p>
      )}
    </section>
  );
}

export default DiscussionSection;
