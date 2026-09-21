import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import FeatureDetailsPage from "./FeatureDetailsPage";
import { useFeature, useDeleteFeature } from "../hooks/useFeatures";
import { useAuth } from "../context/AuthContext";
import { useToggleVote } from "../hooks/useFeatureVote";
import { prefersReducedMotion } from "../components/voteAnimation";
import { useComments, useCreateComment } from "../hooks/useComments";

// FeatureDetailsPage composes many sub-components (VoteButton, AuthorCard,
// MarkdownRenderer, StatusTimeline, RelatedFeatures, EditFeatureModal,
// ConfirmDialog, ShareButton, Placeholders, Skeletons). All data-fetching and
// auth hooks it (and its sub-components) depend on are mocked here so the
// test exercises only FeatureDetailsPage's composition and wiring logic.
//
// useToggleVote (consumed by VoteButton) and prefersReducedMotion (consumed by
// VoteButton's animation logic) are mocked to prevent them from reaching out
// to a real QueryClient or matchMedia.
//
// react-router-dom is NOT mocked — MemoryRouter is used so useParams()
// resolves the `:featureId` segment correctly.
vi.mock("../hooks/useFeatures");
vi.mock("../context/AuthContext");
vi.mock("../hooks/useFeatureVote");
vi.mock("../components/voteAnimation");
vi.mock("../hooks/useComments");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Renders FeatureDetailsPage inside a MemoryRouter whose initial entry
 * matches the `/features/:featureId` route pattern, so `useParams()` sees
 * featureId = "feat-1".
 */
function renderDetailsPage() {
  return render(
    <MemoryRouter initialEntries={["/features/feat-1"]}>
      <Routes>
        <Route path="/features/:featureId" element={<FeatureDetailsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Sample fixture
// ---------------------------------------------------------------------------

/** A fully-populated FeatureDetailResponse fixture (Sprint 2B shape + Sprint 3
 * voting fields). The owner/admin flags are set to exercise the Edit/Delete
 * controls, and `has_voted`/`vote_count` drive the VoteButton assertions. */
const OWNER_FEATURE = {
  id: "feat-1",
  title: "Dark Mode Support",
  description_markdown: "## Dark Mode\n\nPlease add a dark mode toggle.",
  category: "ui_ux",
  status: "under_review",
  author_id: "user-1",
  author_name: "Ada Lovelace",
  vote_count: 7,
  has_voted: false,
  is_owner: true,
  is_admin: false,
  comment_count: 2,
  created_at: "2024-03-01T10:00:00Z",
  updated_at: "2024-03-01T10:00:00Z",
  related_features: [
    {
      id: "feat-2",
      title: "High-contrast theme",
      status: "open",
      vote_count: 3,
    },
  ],
};

/** Same feature but viewed by an admin who is NOT the owner. */
const ADMIN_NON_OWNER_FEATURE = {
  ...OWNER_FEATURE,
  id: "feat-1",
  is_owner: false,
  is_admin: true,
  has_voted: true,
  vote_count: 8,
};

/** Feature viewed by a non-owner, non-admin viewer (read-only). */
const VIEWER_FEATURE = {
  ...OWNER_FEATURE,
  is_owner: false,
  is_admin: false,
  has_voted: false,
  vote_count: 5,
};

// ---------------------------------------------------------------------------
// Mock bootstrap
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Auth: a verified, authenticated user by default.
  useAuth.mockReturnValue({
    isAuthenticated: true,
    user: { _id: "user-1", role: "user", is_verified: true },
  });

  // Mutation hooks that FeatureDetailsPage and VoteButton depend on.
  useDeleteFeature.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useToggleVote.mockReturnValue({ mutate: vi.fn(), isPending: false });

  // DiscussionSection hooks (mocked to avoid QueryClient dependency).
  useComments.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
  useCreateComment.mockReturnValue({ mutate: vi.fn(), isPending: false });

  // Disable the hand-rolled CSS animation so it doesn't interfere with
  // class assertions.
  prefersReducedMotion.mockReturnValue(true);
});

// ---------------------------------------------------------------------------
// Task 13.2 — VoteButton wiring in FeatureDetailsPage
// Validates: Requirements 13.1, 13.3
// ---------------------------------------------------------------------------

describe("FeatureDetailsPage — VoteButton integration", () => {
  it("renders the VoteButton with the feature's vote_count and has_voted wired from the detail response", () => {
    useFeature.mockReturnValue({
      data: OWNER_FEATURE,
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderDetailsPage();

    // The VoteButton is rendered as an accessible button labelled "Upvote".
    const voteBtn = screen.getByRole("button", { name: /upvote/i });
    expect(voteBtn).toBeInTheDocument();

    // aria-pressed reflects has_voted (false → "false").
    expect(voteBtn).toHaveAttribute("aria-pressed", "false");

    // The vote_count (7) is displayed inside the button.
    expect(voteBtn).toHaveTextContent("7");
  });

  it("reflects has_voted=true and the correct count when the viewer has already voted", () => {
    useFeature.mockReturnValue({
      data: ADMIN_NON_OWNER_FEATURE,
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderDetailsPage();

    const voteBtn = screen.getByRole("button", { name: /upvote/i });
    expect(voteBtn).toHaveAttribute("aria-pressed", "true");
    expect(voteBtn).toHaveTextContent("8");
  });

  it("the VoteButton appears in the page header alongside the feature title (Req 13.1)", () => {
    useFeature.mockReturnValue({
      data: OWNER_FEATURE,
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderDetailsPage();

    // The h1 title and the VoteButton should both be present.
    expect(screen.getByRole("heading", { name: "Dark Mode Support" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upvote/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Task 13.2 — Sprint 2B sections remain intact after VoteButton addition
// Validates: Requirements 13.3
// ---------------------------------------------------------------------------

describe("FeatureDetailsPage — Sprint 2B section preservation", () => {
  beforeEach(() => {
    useFeature.mockReturnValue({
      data: OWNER_FEATURE,
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });
  });

  it("renders the breadcrumb navigation back to the feed", () => {
    renderDetailsPage();
    expect(screen.getByRole("link", { name: /back to feed/i })).toBeInTheDocument();
  });

  it("renders the feature title in an h1 heading", () => {
    renderDetailsPage();
    expect(screen.getByRole("heading", { name: "Dark Mode Support", level: 1 })).toBeInTheDocument();
  });

  it("renders the status and category badges", () => {
    renderDetailsPage();
    expect(screen.getByText("under_review")).toBeInTheDocument();
    expect(screen.getByText("ui_ux")).toBeInTheDocument();
  });

  it("renders the author name", () => {
    renderDetailsPage();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("renders the related features section with linked titles", () => {
    renderDetailsPage();
    expect(screen.getByText("High-contrast theme")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Task 13.2 — Edit/Delete ownership-gated controls remain intact (Req 13.3)
// ---------------------------------------------------------------------------

describe("FeatureDetailsPage — Edit/Delete controls preservation", () => {
  it("renders both Edit and Delete controls for the feature owner", () => {
    useFeature.mockReturnValue({
      data: OWNER_FEATURE, // is_owner: true, is_admin: false
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderDetailsPage();

    expect(screen.getAllByRole("button", { name: /edit feature request/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /delete feature request/i }).length).toBeGreaterThan(0);
  });

  it("renders Delete (but not Edit) for an admin who is not the owner", () => {
    useFeature.mockReturnValue({
      data: ADMIN_NON_OWNER_FEATURE, // is_owner: false, is_admin: true
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderDetailsPage();

    expect(screen.queryByRole("button", { name: /edit feature request/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /delete feature request/i }).length).toBeGreaterThan(0);
  });

  it("renders neither Edit nor Delete for a read-only viewer", () => {
    useFeature.mockReturnValue({
      data: VIEWER_FEATURE, // is_owner: false, is_admin: false
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderDetailsPage();

    expect(screen.queryByRole("button", { name: /edit feature request/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete feature request/i })).not.toBeInTheDocument();
  });

  it("still renders the VoteButton alongside the correct ownership controls", () => {
    useFeature.mockReturnValue({
      data: OWNER_FEATURE,
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderDetailsPage();

    // VoteButton is present (Sprint 3 addition).
    expect(screen.getByRole("button", { name: /upvote/i })).toBeInTheDocument();

    // Edit/Delete buttons also present (Sprint 2B controls, undisturbed).
    expect(screen.getAllByRole("button", { name: /edit feature request/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /delete feature request/i }).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Loading / error states (confirming VoteButton is not rendered prematurely)
// ---------------------------------------------------------------------------

describe("FeatureDetailsPage — loading and error states", () => {
  it("renders a loading skeleton while the feature is loading (no VoteButton yet)", () => {
    useFeature.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderDetailsPage();

    expect(screen.queryByRole("button", { name: /upvote/i })).not.toBeInTheDocument();
  });

  it("renders FeatureNotFoundState on a 404 error (no VoteButton)", () => {
    useFeature.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { response: { status: 404 } },
      isFetching: false,
      refetch: vi.fn(),
    });

    renderDetailsPage();

    expect(screen.queryByRole("button", { name: /upvote/i })).not.toBeInTheDocument();
  });
});
