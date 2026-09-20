import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import HomePage from "./HomePage";
import { useHealthCheck } from "../hooks/useHealthCheck";
import { useFeatureFeed, useDeleteFeature, useCreateFeature, useUpdateFeature } from "../hooks/useFeatures";
import { useAuth } from "../context/AuthContext";

// HomePage now composes the rewritten feed (SearchBar/FilterDropdown/
// Pagination/FeatureCard/CreateFeatureModal/EditFeatureModal/ConfirmDialog)
// driven by useFeatureFeed/useFeedQueryParams/useAuth, rather than the
// Sprint 0/1A/1B placeholder. Every data-fetching/auth hook it (or the
// modals it renders unconditionally, which call the mutation hooks before
// their own `isOpen` early-return) depends on is mocked here so this test
// exercises only HomePage's own composition logic.
vi.mock("../hooks/useHealthCheck");
vi.mock("../hooks/useFeatures");
vi.mock("../context/AuthContext");

// useFeedQueryParams (unmocked, real) wraps react-router-dom's
// useSearchParams, which requires a Router ancestor.
function renderHomePage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );
}

const SAMPLE_FEATURE = {
  id: "feature-1",
  title: "Dark mode",
  description_markdown: "Add a dark mode toggle to the settings page.",
  category: "ui_ux",
  status: "under_review",
  author_id: "author-1",
  author_name: "Ada Lovelace",
  vote_count: 3,
  comment_count: 1,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const EMPTY_PAGINATION = { page: 1, limit: 20, total_items: 0, total_pages: 0, has_next: false, has_previous: false };

describe("HomePage", () => {
  beforeEach(() => {
    useHealthCheck.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
    });
    useAuth.mockReturnValue({ user: null, isAuthenticated: false });
    useDeleteFeature.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useCreateFeature.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useUpdateFeature.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("renders the project title", () => {
    useFeatureFeed.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });

    renderHomePage();

    expect(
      screen.getByRole("heading", {
        name: "Feature Request & Public Roadmap Portal",
      })
    ).toBeInTheDocument();
  });

  it("renders a project description under 200 characters", () => {
    useFeatureFeed.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });

    renderHomePage();

    const description = screen.getByText(
      /Submit feature ideas, vote on what matters most/i
    );

    expect(description).toBeInTheDocument();
    expect(description.textContent.length).toBeLessThanOrEqual(200);
  });

  it("renders a loading skeleton while the feed is loading", () => {
    useFeatureFeed.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });

    renderHomePage();

    expect(screen.getByLabelText("Loading feature requests")).toBeInTheDocument();
  });

  it("renders an error message with a working retry control on error", async () => {
    const refetch = vi.fn();
    useFeatureFeed.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });

    renderHomePage();

    expect(screen.getByText(/Something went wrong loading feature requests/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders "No feature requests found." when the feed loads with no items', () => {
    useFeatureFeed.mockReturnValue({
      data: { items: [], pagination: EMPTY_PAGINATION },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderHomePage();

    expect(screen.getByText("No feature requests found.")).toBeInTheDocument();
  });

  it("renders a FeatureCard for each item in the feed", () => {
    useFeatureFeed.mockReturnValue({
      data: {
        items: [SAMPLE_FEATURE],
        pagination: { page: 1, limit: 20, total_items: 1, total_pages: 1, has_next: false, has_previous: false },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderHomePage();

    expect(screen.getByText("Dark mode")).toBeInTheDocument();
  });

  it('does not render the "New Feature Request" control when logged out', () => {
    useAuth.mockReturnValue({ user: null, isAuthenticated: false });
    useFeatureFeed.mockReturnValue({
      data: { items: [], pagination: EMPTY_PAGINATION },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderHomePage();

    expect(screen.queryByRole("button", { name: "New Feature Request" })).not.toBeInTheDocument();
  });

  it('renders the "New Feature Request" control when logged in', () => {
    useAuth.mockReturnValue({ user: { id: "user-1", role: "user" }, isAuthenticated: true });
    useFeatureFeed.mockReturnValue({
      data: { items: [], pagination: EMPTY_PAGINATION },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderHomePage();

    expect(screen.getByRole("button", { name: "New Feature Request" })).toBeInTheDocument();
  });
});
