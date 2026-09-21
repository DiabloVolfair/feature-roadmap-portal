import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import FeatureCard from "./FeatureCard";

// FeatureCard renders VoteButton, which internally calls useAuth(), useToggleVote(),
// and prefersReducedMotion(). Mock all three so FeatureCard tests are fully isolated
// (no real auth context, QueryClient, or matchMedia required).
vi.mock("../context/AuthContext");
vi.mock("../hooks/useFeatureVote");
vi.mock("./voteAnimation");

import { useAuth } from "../context/AuthContext";
import { useToggleVote } from "../hooks/useFeatureVote";
import { prefersReducedMotion } from "./voteAnimation";

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

/** A minimal Feature object that satisfies every FeatureCard prop access. */
const FEATURE = {
  id: "feat-42",
  title: "Dark mode support",
  description_markdown: "Add a **dark mode** toggle to the settings page.",
  category: "UI",
  status: "planned",
  author_name: "Alice",
  author_id: "user-1",
  created_at: "2024-01-15T10:00:00Z",
  comment_count: 7,
  vote_count: 12,
  has_voted: false,
};

/** A viewer who owns the feature (author). */
const AUTHOR_USER = { id: "user-1", role: "user" };

/** A viewer who is an admin but did NOT author the feature. */
const ADMIN_USER = { id: "user-99", role: "admin" };

/** A viewer who has no special permissions. */
const OTHER_USER = { id: "user-2", role: "user" };

function setupVoteMocks() {
  useAuth.mockReturnValue({ isAuthenticated: true, user: { _id: "user-1", is_verified: true } });
  useToggleVote.mockReturnValue({ isPending: false, mutate: vi.fn() });
  prefersReducedMotion.mockReturnValue(false);
}

function renderCard(featureOverrides = {}, { currentUser = null, onEdit = vi.fn(), onDelete = vi.fn() } = {}) {
  const feature = { ...FEATURE, ...featureOverrides };
  return render(
    <MemoryRouter>
      <FeatureCard
        feature={feature}
        currentUser={currentUser}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Task 12.2 — VoteButton integration and layout preservation
// Validates: Requirements 12.1, 12.3
// ---------------------------------------------------------------------------

describe("FeatureCard — VoteButton integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupVoteMocks();
  });

  it("renders the VoteButton with the feature's vote count (Req 12.1)", () => {
    renderCard({ vote_count: 12, has_voted: false });
    // The vote count is rendered as text inside the VoteButton.
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders the VoteButton with aria-pressed=false when has_voted is false (Req 12.1)", () => {
    renderCard({ has_voted: false });
    const btn = screen.getByRole("button", { name: /upvote/i });
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("renders the VoteButton with aria-pressed=true when has_voted is true (Req 12.1)", () => {
    renderCard({ has_voted: true, vote_count: 5 });
    const btn = screen.getByRole("button", { name: /upvote/i });
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("passes a zero vote count through to the VoteButton (Req 12.1)", () => {
    renderCard({ vote_count: 0, has_voted: false });
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

describe("FeatureCard — layout preservation (Req 12.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupVoteMocks();
  });

  it("renders the feature title", () => {
    renderCard();
    expect(screen.getByRole("heading", { name: "Dark mode support" })).toBeInTheDocument();
  });

  it("renders a description preview stripped of markdown syntax", () => {
    // stripMarkdownPreview strips ** bold markers; "Add a dark mode toggle…" should appear.
    renderCard();
    expect(screen.getByText(/Add a dark mode toggle/)).toBeInTheDocument();
  });

  it("renders the category badge", () => {
    renderCard();
    expect(screen.getByText("UI")).toBeInTheDocument();
  });

  it("renders the status badge", () => {
    renderCard();
    expect(screen.getByText("planned")).toBeInTheDocument();
  });

  it("renders the 'View Details' link pointing to the feature's detail page", () => {
    renderCard();
    const link = screen.getByRole("link", { name: "View Details" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/features/feat-42");
  });

  it("renders the author name and comment count in the metadata line", () => {
    renderCard();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/7 comments/)).toBeInTheDocument();
  });
});

describe("FeatureCard — Edit/Delete controls visibility (Req 12.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupVoteMocks();
  });

  it("shows Edit AND Delete for the feature author", () => {
    renderCard({}, { currentUser: AUTHOR_USER });
    expect(screen.getByRole("button", { name: /Edit Dark mode support/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delete Dark mode support/i })).toBeInTheDocument();
  });

  it("shows only Delete (not Edit) for an admin who is not the author", () => {
    renderCard({}, { currentUser: ADMIN_USER });
    expect(screen.queryByRole("button", { name: /Edit Dark mode support/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delete Dark mode support/i })).toBeInTheDocument();
  });

  it("shows neither Edit nor Delete for a viewer with no permissions", () => {
    renderCard({}, { currentUser: OTHER_USER });
    expect(screen.queryByRole("button", { name: /Edit Dark mode support/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete Dark mode support/i })).not.toBeInTheDocument();
  });

  it("shows neither Edit nor Delete when currentUser is null (guest)", () => {
    renderCard({}, { currentUser: null });
    expect(screen.queryByRole("button", { name: /Edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete/i })).not.toBeInTheDocument();
  });

  it("calls onEdit with the feature when Edit is clicked", async () => {
    const onEdit = vi.fn();
    const { user } = await import("@testing-library/user-event");
    // Use userEvent.setup() pattern consistent with other tests in the repo.
    const userEvent = (await import("@testing-library/user-event")).default;
    const ue = userEvent.setup();

    render(
      <MemoryRouter>
        <FeatureCard
          feature={FEATURE}
          currentUser={AUTHOR_USER}
          onEdit={onEdit}
          onDelete={vi.fn()}
        />
      </MemoryRouter>
    );

    await ue.click(screen.getByRole("button", { name: /Edit Dark mode support/i }));
    expect(onEdit).toHaveBeenCalledWith(FEATURE);
  });

  it("calls onDelete with the feature when Delete is clicked", async () => {
    const onDelete = vi.fn();
    const userEvent = (await import("@testing-library/user-event")).default;
    const ue = userEvent.setup();

    render(
      <MemoryRouter>
        <FeatureCard
          feature={FEATURE}
          currentUser={AUTHOR_USER}
          onEdit={vi.fn()}
          onDelete={onDelete}
        />
      </MemoryRouter>
    );

    await ue.click(screen.getByRole("button", { name: /Delete Dark mode support/i }));
    expect(onDelete).toHaveBeenCalledWith(FEATURE);
  });
});
