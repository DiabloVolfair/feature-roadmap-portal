/**
 * Task 10.4 — Unit tests for CommentCard rendering states.
 *
 * Covers:
 *   1. Tombstone (is_deleted=true) — no action buttons, dimmed "[deleted]" content
 *   2. Edited badge (updated_at !== created_at, not deleted) — "edited" badge visible
 *   3. Guest (useAuth returns { user: null }) — no Reply button
 *   4. Depth-3 card — no Reply button (excess depth rule, Req 21.3)
 *
 * Requirements: 20.3, 20.4, 20.5, 21.3
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CommentCard from "../CommentCard";
import { useAuth } from "../../context/AuthContext";
import {
  useReplyToComment,
  useUpdateComment,
  useDeleteComment,
} from "../../hooks/useComments";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../context/AuthContext");
vi.mock("../../hooks/useComments");

// MarkdownRenderer is the actual render target inside CommentCard. Mock it to
// a plain div to keep the test free of remark/react-markdown setup.
vi.mock("../markdown/MarkdownRenderer", () => ({
  default: function MockMarkdownRenderer({ children }) {
    return <div data-testid="markdown-content">{children}</div>;
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOGGED_IN_USER = {
  id: "u1",
  name: "Test User",
  role: "user",
  is_verified: true,
};

function mockAuthUser(user) {
  useAuth.mockReturnValue({ user });
}

function mockMutationHooks() {
  const noopMutation = { mutate: vi.fn(), isPending: false };
  useReplyToComment.mockReturnValue(noopMutation);
  useUpdateComment.mockReturnValue(noopMutation);
  useDeleteComment.mockReturnValue(noopMutation);
}

/**
 * Minimal comment fixture. Override fields as needed per test.
 */
function makeComment(overrides = {}) {
  const now = "2024-01-01T12:00:00.000Z";
  return {
    id: "c1",
    author_id: "u1",
    author_name: "Test User",
    author_role: "user",
    is_verified: true,
    content_markdown: "Hello world",
    created_at: now,
    updated_at: now,
    is_deleted: false,
    replies: [],
    reply_count: 0,
    feature_id: "feat-1",
    parent_comment_id: null,
    ...overrides,
  };
}

function renderCard(comment, depth = 0) {
  return render(
    <MemoryRouter>
      <CommentCard comment={comment} depth={depth} featureId="feat-1" />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockMutationHooks();
  // Default: a logged-in, verified user who owns the comment (author_id matches).
  mockAuthUser(LOGGED_IN_USER);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CommentCard rendering states", () => {
  /**
   * Test 1 — Tombstone (Req 20.3)
   * When is_deleted=true the card renders the muted "[deleted]" placeholder
   * and no action buttons (Reply / Edit / Delete) are present in the DOM.
   */
  it("tombstone: renders dimmed [deleted] text and no action buttons when is_deleted=true (Req 20.3)", () => {
    const comment = makeComment({ is_deleted: true });

    renderCard(comment);

    // Muted placeholder must be present.
    expect(screen.getByText("[deleted]")).toBeInTheDocument();

    // No action buttons should be rendered at all.
    expect(screen.queryByRole("button", { name: /reply/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  /**
   * Test 2 — Edited badge (Req 20.4)
   * When updated_at !== created_at (and not deleted) the "(edited)" badge
   * should be visible.
   */
  it("edited badge: shows 'edited' badge when updated_at differs from created_at (Req 20.4)", () => {
    const comment = makeComment({
      created_at: "2024-01-01T10:00:00.000Z",
      updated_at: "2024-01-01T11:00:00.000Z",
    });

    renderCard(comment);

    expect(screen.getByText("edited")).toBeInTheDocument();
  });

  /**
   * Test 2b — No edited badge when timestamps match (sanity check)
   */
  it("edited badge: does NOT show 'edited' badge when updated_at equals created_at (Req 20.4)", () => {
    const comment = makeComment(); // created_at === updated_at by default

    renderCard(comment);

    expect(screen.queryByText("edited")).not.toBeInTheDocument();
  });

  /**
   * Test 3 — Guest (Req 20.5)
   * When useAuth returns { user: null } the Reply button should not be
   * rendered (guests cannot post replies).
   */
  it("guest: no Reply button when user is not authenticated (Req 20.5)", () => {
    mockAuthUser(null);

    const comment = makeComment({ author_id: "someone-else" });
    renderCard(comment, 0);

    expect(screen.queryByRole("button", { name: /reply/i })).not.toBeInTheDocument();
  });

  /**
   * Test 4 — Depth-3 card (Req 21.3)
   * At depth >= 3 the Reply button must not be rendered regardless of
   * authentication state.
   */
  it("depth-3: no Reply button when depth is 3 (excess depth rule, Req 21.3)", () => {
    // Author is someone else so the user isn't the owner; still verified.
    const comment = makeComment({ author_id: "other-user" });

    renderCard(comment, 3);

    expect(screen.queryByRole("button", { name: /reply/i })).not.toBeInTheDocument();
  });

  /**
   * Positive sanity: verified user at depth < 3 DOES see the Reply button.
   */
  it("verified user at depth 0 sees the Reply button", () => {
    const comment = makeComment({ author_id: "other-user" });

    renderCard(comment, 0);

    expect(screen.getByRole("button", { name: /reply to comment/i })).toBeInTheDocument();
  });
});
