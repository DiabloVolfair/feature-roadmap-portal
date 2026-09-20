import { Link } from "react-router-dom";
import { stripMarkdownPreview } from "../utils/stripMarkdownPreview";

/**
 * FeatureCard renders a single feed item's summary: title, a client-side
 * truncated description preview, category/status badges, author/date/
 * vote-count/comment-count metadata, a "View Details" link to
 * FeatureDetailsPage, and author-gated Edit / author-or-admin-gated Delete
 * trigger controls.
 *
 * No vote button and no comment-thread affordance are rendered — voting and
 * threaded comments are out of scope for this sprint (Req 15.2). Vote/
 * comment counts are shown only as static, read-only numbers.
 *
 * `currentUser` is the `UserResponse`-shaped object returned by
 * `useAuth()` (has an `id` field, not `_id`, and a `role` field restricted
 * to `"user"`/`"admin"`).
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 19.2, 28.4
 */
function FeatureCard({ feature, currentUser, onEdit, onDelete }) {
  const preview = stripMarkdownPreview(feature.description_markdown, 160);
  const canEdit = currentUser?.id === feature.author_id;
  const canDelete = canEdit || currentUser?.role === "admin";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-900">{feature.title}</h3>
      <p className="text-sm text-slate-600">{preview}</p>
      <div className="flex gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {feature.category}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {feature.status}
        </span>
      </div>
      <div className="text-xs text-slate-500">
        {feature.author_name} · {new Date(feature.created_at).toLocaleDateString()} ·{" "}
        {feature.vote_count} votes · {feature.comment_count} comments
      </div>
      <Link
        to={`/features/${feature.id}`}
        className="text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        View Details
      </Link>
      <div className="flex gap-2">
        {canEdit && (
          <button
            type="button"
            onClick={() => onEdit(feature)}
            aria-label={`Edit ${feature.title}`}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 border border-slate-300"
          >
            Edit
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(feature)}
            aria-label={`Delete ${feature.title}`}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 border border-red-300"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export default FeatureCard;
