import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Shared useDroppable mock spy — tests override isOver per test.
const mockUseDroppable = vi.fn();

vi.mock("@dnd-kit/core", () => ({
  useDroppable: (args) => mockUseDroppable(args),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }) => <>{children}</>,
  verticalListSortingStrategy: {},
}));

// Mock KanbanFeatureCard to avoid nested dnd-kit complexity
vi.mock("../KanbanFeatureCard", () => ({
  default: ({ feature }) => (
    <div data-testid="kanban-card">{feature.title}</div>
  ),
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------
import KanbanColumn from "../KanbanColumn";

// ---------------------------------------------------------------------------
// Default mock setup (isOver = false)
// ---------------------------------------------------------------------------

function defaultDroppable() {
  mockUseDroppable.mockReturnValue({
    setNodeRef: () => {},
    isOver: false,
    id: "planned",
  });
}

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    id: "f1",
    title: "Feature Alpha",
    category: "general",
    status: "planned",
    vote_count: 5,
    comment_count: 2,
    author_name: "Alice",
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "f2",
    title: "Feature Beta",
    category: "ui",
    status: "planned",
    vote_count: 3,
    comment_count: 1,
    author_name: "Bob",
    created_at: "2024-02-01T00:00:00Z",
  },
];

function renderColumn(props = {}) {
  const defaults = {
    status: "planned",
    label: "Planned",
    features: FEATURES,
  };
  return render(<KanbanColumn {...defaults} {...props} />);
}

// ---------------------------------------------------------------------------
// Task 9.2 — Unit tests for KanbanColumn
// Validates: Requirements 12.2, 12.3, 12.4
// ---------------------------------------------------------------------------

describe("KanbanColumn unit tests (task 9.2)", () => {
  beforeEach(() => {
    defaultDroppable();
  });

  it("count badge shows the number of features (features.length)", () => {
    renderColumn({ features: FEATURES });
    // The badge is a <span> displaying the count
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows empty state placeholder when features is empty", () => {
    renderColumn({ features: [] });
    expect(screen.getByText("No features here")).toBeInTheDocument();
    // Count badge should show 0
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("applies highlighted border class bg-indigo-50 when isOver is true", () => {
    // Override mock to simulate a drag hovering over this column
    mockUseDroppable.mockReturnValueOnce({
      setNodeRef: () => {},
      isOver: true,
      id: "planned",
    });

    const { container } = renderColumn();

    // When isOver is true, KanbanColumn adds bg-indigo-50 to the droppable div.
    const highlighted = container.querySelector(".bg-indigo-50");
    expect(highlighted).not.toBeNull();
  });

  it("renders the correct number of KanbanFeatureCard elements", () => {
    renderColumn({ features: FEATURES });
    const cards = screen.getAllByTestId("kanban-card");
    expect(cards).toHaveLength(2);
    expect(screen.getByText("Feature Alpha")).toBeInTheDocument();
    expect(screen.getByText("Feature Beta")).toBeInTheDocument();
  });
});
