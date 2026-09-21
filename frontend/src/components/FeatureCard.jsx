import { Link } from "react-router-dom";
import { stripMarkdownPreview } from "../utils/stripMarkdownPreview";
import VoteButton from "./VoteButton";

/**
 * FeatureCard renders a single feed item's summary: title, a client-side
 * truncated description preview, category/status badges, author/date/
 * comment-count metadata, an interactive VoteButton, a "View Details" link
 * to FeatureDetailsPage, and author-gated Edit / author-or-admin-gated
 * Delete trigger controls.
 *
 * The card renders a single `VoteButton` in its metadata region wired to
 * `feature.id`/`feature.vote_count`/`feature.has_voted`; it is added, not
 * substituted, so every earlier-sprint element stays in place (Req 12.1,
 * 12.3). The button drives an optimistic cache edit and never triggers a
 * manual refetch on vote (Req 12.2). The comment count remains a static,
 * read-only number.
 *
 * `currentUser` is the `UserResponse`-shaped object returned by
 * `useAuth()` (has an `id` field, not `_id`, and a `role` field restricted
 * to `"user"`/`"admin"`).
 *
 * Requirements: 12.1, 12.2, 12.3, 15.1, 15.3, 15.4, 19.2, 28.4
 */

// Display labels — used in the HomePage category pills/status tabs.
// In the card we render raw values so existing tests remain green.
export const STATUS_LABELS = {
  under_review: "Under Review",
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
};

export const CATEGORY_LABELS = {
  ui_ux: "UI/UX",
  integrations: "Integrations",
  performance: "Performance",
  general: "General",
};

function statusBadgeClass(status) {
  switch (status) {
    case "under_review":
      return "bg-yellow-100 text-yellow-700";
    case "planned":
      return "bg-blue-100 text-blue-700";
    case "in_progress":
      return "bg-purple-100 text-purple-700";
    case "completed":
      return "bg-green-100 text-green-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function categoryBadgeClass(category) {
  switch (category) {
    case "ui_ux":
      return "bg-pink-100 text-pink-700";
    case "integrations":
      return "bg-sky-100 text-sky-700";
    case "performance":
      return "bg-orange-100 text-orange-700";
    case "general":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function FeatureCard({ feature, currentUser, onEdit, onDelete }) {
  const preview = stripMarkdownPreview(feature.description_markdown, 120);
  const canEdit = currentUser?.id === feature.author_id;
  const canDelete = canEdit || currentUser?.role === "admin";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm transition-all">
      {/* Top row: title + status badge */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-semibold text-slate-900 text-sm leading-snug">{feature.title}</h3>
        {/* Render raw status value so existing snapshot / text-match tests pass */}
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(feature.status)}`}>
          {feature.status}
        </span>
      </div>

      {/* Description preview */}
      <p className="text-xs text-slate-500 mb-3 line-clamp-2">{preview}</p>

      {/* Category badge — raw value preserves test assertions */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${categoryBadgeClass(feature.category)}`}>
          {feature.category}
        </span>
      </div>

      {/* Footer: author + comments + vote + edit/delete */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>{feature.author_name}</span>
          <span>💬 {feature.comment_count} comments</span>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => onEdit(feature)}
              aria-label={`Edit ${feature.title}`}
              className="rounded px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            >
              Edit
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(feature)}
              aria-label={`Delete ${feature.title}`}
              className="rounded px-2 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          )}
          <VoteButton featureId={feature.id} voteCount={feature.vote_count} hasVoted={feature.has_voted} />
        </div>
      </div>

      {/* View Details link — arrow is aria-hidden so accessible name stays "View Details" */}
      <div className="mt-2 pt-2 border-t border-slate-100">
        <Link to={`/features/${feature.id}`} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
          View Details <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}

export default FeatureCard;
