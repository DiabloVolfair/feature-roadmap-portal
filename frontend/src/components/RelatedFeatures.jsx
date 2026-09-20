import { useNavigate } from "react-router-dom";
import { categoryBadgeClass, statusBadgeClass } from "../utils/badgeColors";

/**
 * RelatedFeatures renders the `related_features` array from
 * FeatureDetailResponse as a row of activatable cards, one per entry, up
 * to the 4-item maximum already enforced server-side (Req 11.2).
 *
 * Each card shows `title`, `category`, `status` (via the shared
 * `badgeColors` conventions, Req 11.3, 17.3), and `vote_count`, and is
 * exposed to assistive technology as a single focusable, activatable
 * button whose accessible name includes the entry's `title` (Req 11.4).
 * Activating a card navigates (push, not replace) to that related
 * feature's own `/features/{id}` details page.
 *
 * Cards lay out horizontally in a row at >=768px, and as a horizontally
 * scrollable row below that breakpoint (Req 11.5).
 *
 * WHEN `relatedFeatures` is empty (or absent), renders nothing - no
 * heading, no container, no message (Req 11.6).
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */
function RelatedFeatures({ relatedFeatures }) {
  const navigate = useNavigate();

  if (!relatedFeatures || relatedFeatures.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="font-semibold text-slate-900">Related Features</h3>
      <div className="mt-3 flex gap-3 overflow-x-auto md:overflow-visible">
        {relatedFeatures.map((related) => (
          <button
            key={related.id}
            type="button"
            onClick={() => navigate(`/features/${related.id}`)}
            aria-label={`View related feature: ${related.title}`}
            className="w-48 flex-shrink-0 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <p className="truncate text-sm font-medium text-slate-900">
              {related.title}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${categoryBadgeClass(
                  related.category,
                )}`}
              >
                {related.category}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
                  related.status,
                )}`}
              >
                {related.status}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {related.vote_count} votes
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

export default RelatedFeatures;
