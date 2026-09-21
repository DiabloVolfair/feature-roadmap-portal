import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminBoardPage from "../AdminBoardPage";
import { useAdminBoard, useUpdateFeatureStatus } from "../../hooks/useAdminBoard";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../hooks/useAdminBoard");

// Stub DnD kit to avoid PointerSensor / real DOM event setup.
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }) => <>{children}</>,
  DragOverlay: ({ children }) => <>{children}</>,
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  sortableKeyboardCoordinates: vi.fn(),
}));

// Stub KanbanColumn to expose status/label via data attributes for assertions.
vi.mock("../../components/KanbanColumn", () => ({
  default: ({ status, label }) => (
    <div
      data-testid="kanban-column"
      data-status={status}
      data-label={label}
    />
  ),
}));

// ---------------------------------------------------------------------------
// Sample board data
// ---------------------------------------------------------------------------

const SAMPLE_BOARD = {
  under_review: [
    {
      id: "f1",
      title: "Feature 1",
      category: "general",
      status: "under_review",
      vote_count: 5,
      comment_count: 2,
      author_name: "Alice",
      created_at: "2024-01-01T00:00:00Z",
    },
  ],
  planned: [
    {
      id: "f2",
      title: "Feature 2",
      category: "ui_ux",
      status: "planned",
      vote_count: 3,
      comment_count: 1,
      author_name: "Bob",
      created_at: "2024-01-02T00:00:00Z",
    },
  ],
  in_progress: [],
  completed: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderAdminBoardPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <AdminBoardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Mock bootstrap
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: successful load with sample board
  useAdminBoard.mockReturnValue({
    data: SAMPLE_BOARD,
    isLoading: false,
    isError: false,
  });
  useUpdateFeatureStatus.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

// ---------------------------------------------------------------------------
// Test 1 — All four column labels render
// ---------------------------------------------------------------------------

describe("AdminBoardPage — column labels", () => {
  it("renders all four Kanban column labels from board data", () => {
    renderAdminBoardPage();

    const columns = screen.getAllByTestId("kanban-column");
    expect(columns).toHaveLength(4);

    const labels = columns.map((el) => el.getAttribute("data-label"));
    expect(labels).toContain("Under Review");
    expect(labels).toContain("Planned");
    expect(labels).toContain("In Progress");
    expect(labels).toContain("Completed");
  });

  it("passes the correct status attribute to each column", () => {
    renderAdminBoardPage();

    const columns = screen.getAllByTestId("kanban-column");
    const statuses = columns.map((el) => el.getAttribute("data-status"));
    expect(statuses).toContain("under_review");
    expect(statuses).toContain("planned");
    expect(statuses).toContain("in_progress");
    expect(statuses).toContain("completed");
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Stats section shows correct totals
// ---------------------------------------------------------------------------

describe("AdminBoardPage — stats section", () => {
  it("shows correct Total, Under Review count, and other stat values", () => {
    renderAdminBoardPage();

    // SAMPLE_BOARD has 2 total features (1 under_review, 1 planned, 0 in_progress, 0 completed)
    // Stats: Total=2, Under Review=1, Planned=1, In Progress=0, Completed=0, Votes=8, Comments=3

    // Find all dt elements (labels) and dd elements (values)
    const labels = screen.getAllByRole("term");          // <dt>
    const values = screen.getAllByRole("definition");    // <dd>

    const statsMap = {};
    labels.forEach((dt, i) => {
      statsMap[dt.textContent] = values[i]?.textContent;
    });

    expect(statsMap["Total"]).toBe("2");
    expect(statsMap["Under Review"]).toBe("1");
    expect(statsMap["Planned"]).toBe("1");
    expect(statsMap["In Progress"]).toBe("0");
    expect(statsMap["Completed"]).toBe("0");
    expect(statsMap["Votes"]).toBe("8");
    expect(statsMap["Comments"]).toBe("3");
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Manual Refresh button is present
// ---------------------------------------------------------------------------

describe("AdminBoardPage — Refresh button", () => {
  it("renders a Refresh button in the page header", () => {
    renderAdminBoardPage();

    // The refresh button contains "Refresh" text (with ↻ icon)
    const refreshBtn = screen.getByRole("button", { name: /refresh/i });
    expect(refreshBtn).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Loading state
// ---------------------------------------------------------------------------

describe("AdminBoardPage — loading state", () => {
  it("renders skeleton columns with role='status' and aria-label='Loading board' while loading", () => {
    useAdminBoard.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderAdminBoardPage();

    const skeleton = screen.getByRole("status");
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveAttribute("aria-label", "Loading board");

    // No real kanban columns during loading
    expect(screen.queryAllByTestId("kanban-column")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — Error state
// ---------------------------------------------------------------------------

describe("AdminBoardPage — error state", () => {
  it("renders error message and Retry button when the board fails to load", () => {
    useAdminBoard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderAdminBoardPage();

    expect(screen.getByText("Failed to load the board.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();

    // No kanban columns in error state
    expect(screen.queryAllByTestId("kanban-column")).toHaveLength(0);
  });
});
