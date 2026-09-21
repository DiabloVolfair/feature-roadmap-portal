import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---------------------------------------------------------------------------
// Mock RoadmapFeatureCard to a simple div to isolate RoadmapColumn logic
// ---------------------------------------------------------------------------

vi.mock("../RoadmapFeatureCard", () => ({
  default: ({ feature }) => (
    <div data-testid="roadmap-card">{feature.title}</div>
  ),
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------
import RoadmapColumn from "../RoadmapColumn";

// ---------------------------------------------------------------------------
// Fixtures
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
    category: "ui_ux",
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
  return render(
    <MemoryRouter>
      <RoadmapColumn {...defaults} {...props} />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Task 8.2 — Unit tests for RoadmapColumn
// Validates: Requirements 7.3, 7.4, 7.6
// ---------------------------------------------------------------------------

describe("RoadmapColumn unit tests (task 8.2)", () => {
  it('renders "No features yet" when features is empty', () => {
    renderColumn({ features: [] });
    expect(screen.getByText("No features yet")).toBeInTheDocument();
  });

  it("count badge shows features.length", () => {
    renderColumn({ features: FEATURES });
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("count badge shows 0 when features is empty", () => {
    renderColumn({ features: [] });
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders correct aria-label on the section element", () => {
    renderColumn({ label: "Planned", features: FEATURES });
    const section = screen.getByRole("region", { name: "Planned roadmap column" });
    expect(section).toBeInTheDocument();
  });

  it("renders a RoadmapFeatureCard for each feature", () => {
    renderColumn({ features: FEATURES });
    const cards = screen.getAllByTestId("roadmap-card");
    expect(cards).toHaveLength(2);
    expect(screen.getByText("Feature Alpha")).toBeInTheDocument();
    expect(screen.getByText("Feature Beta")).toBeInTheDocument();
  });
});
