/**
 * Pure optimistic-transform and reduced-motion helpers for the voting UI.
 *
 * These functions carry no React or DOM dependency (aside from the guarded
 * `matchMedia` read) so they can be exercised directly in tests and reused by
 * the Vote_Hook's optimistic cache updates.
 *
 * Requirements: 10.1, 10.2, 10.5, 15.3, 17.1
 */

/**
 * Flip `has_voted` and adjust `vote_count` by exactly +/-1 for the target
 * feature, leaving every other field untouched. Never drives the count below
 * zero (Req 10.1, 10.5, 17.1).
 *
 * @param {{ has_voted?: boolean, vote_count?: number }} feature
 * @returns {object} a new feature object with the optimistic vote applied
 */
export function applyOptimisticVote(feature) {
  const nextVoted = !feature.has_voted;
  const delta = nextVoted ? 1 : -1;
  return {
    ...feature,
    has_voted: nextVoted,
    vote_count: Math.max(0, feature.vote_count + delta),
  };
}

/**
 * Rewrite a single ["features", ...] feed page's `items`, applying the
 * optimistic transform to the one entry matching `featureId` and leaving all
 * other entries and the page's other fields unchanged. Returns the page
 * unchanged when it has no `items` (Req 10.2).
 *
 * @param {{ items?: Array<{ id: * }> }} page
 * @param {*} featureId
 * @returns {object} the (possibly) rewritten feed page
 */
export function applyOptimisticVoteToPage(page, featureId) {
  if (!page?.items) return page;
  return {
    ...page,
    items: page.items.map((f) => (f.id === featureId ? applyOptimisticVote(f) : f)),
  };
}

/**
 * Report whether the user has requested reduced motion, guarded for
 * environments without `window`/`matchMedia` (Req 15.3).
 *
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
