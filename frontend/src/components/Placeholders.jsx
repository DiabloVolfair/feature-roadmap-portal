/**
 * Placeholders renders two static, non-interactive cards shown near the
 * bottom of FeatureDetailsPage: VotingPlaceholder and CommentsPlaceholder.
 *
 * Neither component contains a button, input, or any element that submits
 * a vote or a comment — voting and threaded comments are out of scope for
 * this sprint (Req 13.3). Both match the page's existing card styling
 * (spacing, border, background) established by Requirement 17 (Req 13.4).
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */

/**
 * Static placeholder card identifying the (not-yet-implemented) voting
 * section of a feature's details page.
 *
 * Requirements: 13.1, 13.3, 13.4
 */
export function VotingPlaceholder() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-900">Voting</h3>
      <p className="text-sm text-slate-600">Voting available in Sprint 3.</p>
    </div>
  );
}

/**
 * Static placeholder card identifying the (not-yet-implemented) threaded
 * discussion/comments section of a feature's details page.
 *
 * Requirements: 13.2, 13.3, 13.4
 */
export function CommentsPlaceholder() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-900">Discussion</h3>
      <p className="text-sm text-slate-600">
        Threaded discussions available in Sprint 4.
      </p>
    </div>
  );
}
