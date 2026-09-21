import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToggleVote } from "../hooks/useFeatureVote";
import { prefersReducedMotion } from "./voteAnimation";
import LoginRequiredModal from "./LoginRequiredModal";
import "./voteButton.css";

/**
 * Pure state-selection for the VoteButton, extracted so it can be exercised
 * directly with property tests (Req 11.2-11.5, 16.1).
 *
 * Precedence, highest first:
 * - `isPending` → `loading` (a pending mutation ALWAYS wins, Req 16.1).
 * - unauthenticated OR unverified → `guest` (an unverified viewer is treated
 *   like a guest for the click affordance, Req 11.2).
 * - otherwise → `active` iff the viewer has already voted, else `inactive`
 *   (Req 11.3, 11.4).
 *
 * It is a total function of its four boolean inputs, returning exactly one of
 * `"loading"`, `"guest"`, `"active"`, or `"inactive"`.
 *
 * @param {{ isAuthenticated?: boolean, isVerified?: boolean, hasVoted?: boolean, isPending?: boolean }} state
 * @returns {"loading" | "guest" | "active" | "inactive"}
 */
export function selectVoteButtonState({ isAuthenticated, isVerified, hasVoted, isPending }) {
  if (isPending) return "loading"; // pending always wins (Req 16.1)
  if (!isAuthenticated) return "guest"; // Req 11.2
  if (!isVerified) return "guest"; // unverified is treated like guest for the click affordance
  return hasVoted ? "active" : "inactive"; // Req 11.3, 11.4
}

/** Upvote arrow (inline SVG — no icon library is added, per design). */
function UpvoteArrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

/** Loading spinner shown in place of the arrow while a vote is in flight. */
function Spinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 animate-spin"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" className="opacity-75" strokeLinecap="round" />
    </svg>
  );
}

/**
 * VoteButton renders an upvote control for a single feature: an upvote arrow
 * icon followed by the current `voteCount` (Req 11.1). It reads the current
 * viewer from `useAuth()` and drives the optimistic toggle through
 * `useToggleVote(featureId)`.
 *
 * Behaviour by resolved state (see `selectVoteButtonState`):
 * - `loading`: the icon is replaced by a spinner, the button is `disabled`,
 *   and clicks are ignored — a double-click guard so a rapid second press can
 *   never fire a second mutation (Req 11.6, 16.1, 16.2).
 * - `guest` (unauthenticated OR unverified): activation opens
 *   `LoginRequiredModal` and casts NO vote (Req 11.2, 14.2).
 * - `active`/`inactive` (authenticated + verified): activation calls
 *   `mutate()` to toggle the vote (Req 11.3, 11.4).
 *
 * `aria-pressed={hasVoted}` communicates the toggle state to assistive tech
 * (Req 11.5). Hand-rolled scale/color/count-transition CSS classes
 * (`voteButton.css`) are applied ONLY when `prefersReducedMotion()` is false;
 * no animation library is used (Req 15.1, 15.2, 15.3).
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 14.2, 15.1, 15.2, 15.3, 16.1, 16.2, 16.3
 */
function VoteButton({ featureId, voteCount, hasVoted }) {
  const { user, isAuthenticated } = useAuth();
  const toggleVote = useToggleVote(featureId);
  const [modalOpen, setModalOpen] = useState(false);

  const reduce = prefersReducedMotion(); // Req 15.3

  const state = selectVoteButtonState({
    isAuthenticated,
    isVerified: Boolean(user?.is_verified),
    hasVoted,
    isPending: toggleVote.isPending,
  });

  const isLoading = state === "loading";

  // Trigger the one-shot count-pop only on a genuine vote toggle, and only
  // when motion is allowed. Keyed off `hasVoted` transitions so it does not
  // replay on unrelated re-renders.
  const [popCount, setPopCount] = useState(false);
  const prevHasVoted = useRef(hasVoted);
  useEffect(() => {
    if (prevHasVoted.current !== hasVoted) {
      prevHasVoted.current = hasVoted;
      if (!reduce) {
        setPopCount(true);
      }
    }
  }, [hasVoted, reduce]);

  function handleClick() {
    if (isLoading) return; // double-click guard (Req 16.1, 16.2)
    if (state === "guest") {
      setModalOpen(true); // Req 11.2, 14.2 — no vote is cast
      return;
    }
    toggleVote.mutate(); // Req 11.3, 11.4
  }

  const animated = !reduce; // hand-rolled animation gated on reduced-motion (Req 15.3)

  const activeColor = hasVoted
    ? "text-blue-600 border-blue-400 bg-blue-50"
    : "text-slate-700 border-slate-300 bg-white";

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        aria-pressed={hasVoted}
        aria-label="Upvote"
        className={[
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium",
          activeColor,
          isLoading ? "cursor-not-allowed opacity-70" : "",
          animated ? "vote-btn-animated" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {isLoading ? <Spinner /> : <UpvoteArrow />}
        <span
          className={animated && popCount ? "vote-count-animated" : ""}
          onAnimationEnd={() => setPopCount(false)}
        >
          {voteCount}
        </span>
      </button>

      <LoginRequiredModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

export default VoteButton;
