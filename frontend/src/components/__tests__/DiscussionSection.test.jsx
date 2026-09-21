/**
 * Task 11.1 — Unit tests for DiscussionSection guest, empty, and loading states.
 *
 * Covers:
 *   1. Unauthenticated (guest): "Log in to join the discussion" banner visible,
 *      CommentComposer NOT rendered.
 *   2. Authenticated, empty tree: empty-state message visible.
 *   3. Loading: skeleton (aria-busy="true" / aria-label="Loading comments") visible,
 *      no comment tree rendered.
 *
 * Requirements: 18.3, 18.4, 18.5, 18.6, 22.3
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DiscussionSection from "../DiscussionSection";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../context/AuthContext");
vi.mock("../../hooks/useComments");

// Shallow mock CommentCard — avoids deep recursive rendering
vi.mock("../CommentCard", () => ({
  default: function MockCommentCard({ comment }) {
    return <div data-testid="comment-card">{comment.id}</div>;
  },
}));

// Shallow mock CommentComposer — avoids markdown editor / dependency chain
vi.mock("../CommentComposer", () => ({
  default: function MockCommentComposer() {
    return <div data-testid="comment-composer" />;
  },
}));

// MarkdownRenderer is not used directly in DiscussionSection, but mock
// defensively in case a transitive import pulls it in.
vi.mock("../markdown/MarkdownRenderer", () => ({
  default: function MockMarkdownRenderer({ children }) {
    return <div>{children}</div>;
  },
}));

// ---------------------------------------------------------------------------
// Re-import mocked modules after vi.mock hoisting
// ---------------------------------------------------------------------------

import { useAuth } from "../../context/AuthContext";
import { useComments, useCreateComment } from "../../hooks/useComments";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOGGED_IN_USER = {
  id: "u1",
  name: "Alice",
  role: "user",
  is_verified: true,
};

function mockAuth(user) {
  useAuth.mockReturnValue({ user });
}

function mockComments({ data, isLoading = false, isError = false } = {}) {
  useComments.mockReturnValue({
    data,
    isLoading,
    isError,
    refetch: vi.fn(),
  });
}

function mockCreateComment() {
  useCreateComment.mockReturnValue({ mutate: vi.fn(), isPending: false });
}

function renderSection(featureId = "feat-1", commentCount = 0) {
  return render(
    <MemoryRouter>
      <DiscussionSection featureId={featureId} commentCount={commentCount} />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateComment();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DiscussionSection", () => {
  /**
   * Test 1 — Guest banner (Req 22.3, 18.6)
   * When the user is unauthenticated (useAuth returns { user: null }):
   *   - the "Log in to join the discussion" banner must be visible
   *   - CommentComposer must NOT be rendered
   */
  it("unauthenticated: shows guest banner and no CommentComposer (Req 22.3, 18.6)", () => {
    mockAuth(null);
    mockComments({ data: [], isLoading: false });

    renderSection();

    // Guest banner text — the component renders this in a <span>
    expect(screen.getByText(/log in to join the discussion/i)).toBeInTheDocument();

    // The "Log in" link must be present (links to /login)
    const loginLink = screen.getByRole("link", { name: /log in/i });
    expect(loginLink).toBeInTheDocument();

    // CommentComposer must NOT be rendered for guests
    expect(screen.queryByTestId("comment-composer")).not.toBeInTheDocument();
  });

  /**
   * Test 2 — Authenticated + empty tree (Req 18.4, 18.5)
   * When the user is authenticated and the comment tree is empty (data = []):
   *   - "No comments yet" empty-state message is visible
   */
  it("authenticated, empty tree: shows empty-state message (Req 18.4, 18.5)", () => {
    mockAuth(LOGGED_IN_USER);
    mockComments({ data: [], isLoading: false });

    renderSection();

    // The empty-state paragraph
    expect(screen.getByText(/no comments yet/i)).toBeInTheDocument();

    // CommentComposer IS rendered for authenticated users
    expect(screen.getByTestId("comment-composer")).toBeInTheDocument();

    // No comment cards in tree
    expect(screen.queryByTestId("comment-card")).not.toBeInTheDocument();
  });

  /**
   * Test 3 — Loading state (Req 18.3, 23.1)
   * When useComments returns { isLoading: true, data: undefined }:
   *   - the loading skeleton (aria-busy="true") is visible
   *   - no comment cards are rendered
   */
  it("loading: renders skeleton with aria-busy and no comment tree (Req 18.3, 23.1)", () => {
    mockAuth(LOGGED_IN_USER);
    mockComments({ data: undefined, isLoading: true });

    renderSection();

    // Find specifically the aria-busy element
    const busyEl = document.querySelector('[aria-busy="true"]');
    expect(busyEl).not.toBeNull();
    expect(busyEl).toHaveAttribute("aria-label", "Loading comments");

    // No comment cards while loading
    expect(screen.queryByTestId("comment-card")).not.toBeInTheDocument();

    // No empty-state message while loading
    expect(screen.queryByText(/no comments yet/i)).not.toBeInTheDocument();
  });
});
