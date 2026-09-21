import { describe, it, test, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import VoteButton, { selectVoteButtonState } from "./VoteButton";
import { useAuth } from "../context/AuthContext";
import { useToggleVote } from "../hooks/useFeatureVote";
import { prefersReducedMotion } from "./voteAnimation";

// VoteButton reads the viewer from useAuth(), drives the toggle through
// useToggleVote(featureId), and gates its hand-rolled animation on
// prefersReducedMotion(). All three are mocked so each test controls the
// authenticated/verified viewer, the mutation's isPending/mutate, and whether
// reduced motion is requested — without a real auth context, QueryClient, or
// matchMedia. LoginRequiredModal (rendered on guest activation) uses
// react-router's useNavigate, so the component is wrapped in MemoryRouter.
vi.mock("../context/AuthContext");
vi.mock("../hooks/useFeatureVote");
vi.mock("./voteAnimation");

// ---------------------------------------------------------------------------
// Task 10.2 - Property 7: VoteButton state selection is a total function of
// its inputs. For any combination of the four boolean inputs,
// selectVoteButtonState returns exactly one of loading/guest/inactive/active,
// with isPending always yielding loading, an unauthenticated OR unverified
// viewer yielding guest, and an authenticated + verified viewer yielding
// active iff hasVoted else inactive.
// Validates: Requirements 11.2, 11.3, 11.4, 11.5, 16.1
// ---------------------------------------------------------------------------
describe("selectVoteButtonState total function (Property 7)", () => {
  const STATES = ["loading", "guest", "inactive", "active"];

  test("returns exactly one valid state for every boolean combination", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (isAuthenticated, isVerified, hasVoted, isPending) => {
          const result = selectVoteButtonState({
            isAuthenticated,
            isVerified,
            hasVoted,
            isPending,
          });

          // Totality: the result is always exactly one of the four states.
          expect(STATES).toContain(result);

          if (isPending) {
            // isPending always wins (Req 16.1).
            expect(result).toBe("loading");
          } else if (!isAuthenticated || !isVerified) {
            // Unauthenticated OR unverified viewer -> guest (Req 11.2).
            expect(result).toBe("guest");
          } else {
            // Authenticated + verified -> active iff hasVoted else inactive
            // (Req 11.3, 11.4, 11.5).
            expect(result).toBe(hasVoted ? "active" : "inactive");
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Task 10.3 - Unit tests for the VoteButton states, guest flow, loading guard,
// and animation.
// Validates: Requirements 11.2, 11.3, 11.5, 14.2, 15.1, 15.3, 16.1, 16.2, 16.3
// ---------------------------------------------------------------------------

// Default: a mutation that is not pending and records mutate() calls.
let mutate;

function mockAuth({ isAuthenticated = false, isVerified = false } = {}) {
  useAuth.mockReturnValue({
    isAuthenticated,
    user: isAuthenticated ? { _id: "u1", is_verified: isVerified } : null,
  });
}

function mockToggleVote({ isPending = false } = {}) {
  mutate = vi.fn();
  useToggleVote.mockReturnValue({ isPending, mutate });
}

function renderButton(props = {}) {
  return render(
    <MemoryRouter>
      <VoteButton featureId="feat-1" voteCount={3} hasVoted={false} {...props} />
    </MemoryRouter>
  );
}

describe("VoteButton states, guest flow, loading guard, and animation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Motion allowed by default; reduced-motion tests override this.
    prefersReducedMotion.mockReturnValue(false);
  });

  it("guest activation opens the login modal and casts NO vote (Req 11.2, 14.2)", async () => {
    const user = userEvent.setup();
    mockAuth({ isAuthenticated: false });
    mockToggleVote();

    renderButton();

    // No modal on initial render.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /upvote/i }));

    // The LoginRequiredModal opens...
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Log in to vote for feature requests.")).toBeInTheDocument();

    // ...and no vote is cast.
    expect(mutate).not.toHaveBeenCalled();
  });

  it("treats an authenticated-but-unverified viewer as a guest (Req 11.2)", async () => {
    const user = userEvent.setup();
    mockAuth({ isAuthenticated: true, isVerified: false });
    mockToggleVote();

    renderButton();

    await user.click(screen.getByRole("button", { name: /upvote/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("verified activation calls mutate (Req 11.3)", async () => {
    const user = userEvent.setup();
    mockAuth({ isAuthenticated: true, isVerified: true });
    mockToggleVote();

    renderButton();

    await user.click(screen.getByRole("button", { name: /upvote/i }));

    expect(mutate).toHaveBeenCalledTimes(1);
    // No login modal for a verified viewer.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reflects the toggle state through aria-pressed (Req 11.5)", () => {
    mockAuth({ isAuthenticated: true, isVerified: true });
    mockToggleVote();

    const { rerender } = renderButton({ hasVoted: false });
    expect(screen.getByRole("button", { name: /upvote/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    rerender(
      <MemoryRouter>
        <VoteButton featureId="feat-1" voteCount={4} hasVoted={true} />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: /upvote/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("a pending mutation disables the button, shows a spinner, and ignores rapid repeated clicks (Req 16.1, 16.2, 16.3)", async () => {
    const user = userEvent.setup();
    mockAuth({ isAuthenticated: true, isVerified: true });
    mockToggleVote({ isPending: true });

    renderButton();

    const button = screen.getByRole("button", { name: /upvote/i });

    // Disabled while a vote is in flight (Req 16.2).
    expect(button).toBeDisabled();

    // The spinner replaces the arrow (animate-spin marks the spinner SVG).
    expect(button.querySelector("svg.animate-spin")).toBeInTheDocument();

    // Rapid repeated clicks are ignored: at most one mutate — here zero, since
    // the click handler's loading guard returns before mutate and the disabled
    // button suppresses events entirely (Req 16.1, 16.3).
    await user.click(button);
    await user.click(button);
    await user.click(button);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("re-enables and fires exactly one mutate once the pending mutation settles (Req 16.2, 16.3)", async () => {
    const user = userEvent.setup();
    mockAuth({ isAuthenticated: true, isVerified: true });

    // Start pending: the button is disabled and rapid clicks do nothing.
    mockToggleVote({ isPending: true });
    const { rerender } = renderButton();

    let button = screen.getByRole("button", { name: /upvote/i });
    expect(button).toBeDisabled();
    await user.click(button);
    await user.click(button);
    expect(mutate).not.toHaveBeenCalled();

    // Settle: the mutation is no longer pending. Re-render with the settled
    // hook state (same mutate spy) — the button re-enables and a single click
    // now fires exactly one mutate.
    useToggleVote.mockReturnValue({ isPending: false, mutate });
    rerender(
      <MemoryRouter>
        <VoteButton featureId="feat-1" voteCount={3} hasVoted={false} />
      </MemoryRouter>
    );

    button = screen.getByRole("button", { name: /upvote/i });
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(button.querySelector("svg.animate-spin")).not.toBeInTheDocument();

    await user.click(button);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("applies the animation class when motion is allowed (Req 15.1)", () => {
    prefersReducedMotion.mockReturnValue(false);
    mockAuth({ isAuthenticated: true, isVerified: true });
    mockToggleVote();

    renderButton();

    expect(screen.getByRole("button", { name: /upvote/i })).toHaveClass("vote-btn-animated");
  });

  it("suppresses the animation class under a reduced-motion preference (Req 15.3)", () => {
    // Emulate a mocked matchMedia(prefers-reduced-motion: reduce) match by
    // having the reduced-motion helper report true (the component reads motion
    // preference exclusively through prefersReducedMotion()).
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    prefersReducedMotion.mockReturnValue(true);

    mockAuth({ isAuthenticated: true, isVerified: true });
    mockToggleVote();

    renderButton();

    expect(screen.getByRole("button", { name: /upvote/i })).not.toHaveClass(
      "vote-btn-animated"
    );
  });
});
