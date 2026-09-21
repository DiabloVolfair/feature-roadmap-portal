import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Shared mock factory — tests can override useSortable's return value via
// the exported `mockUseSortable` spy.
const mockUseSortable = vi.fn();

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: (...args) => mockUseSortable(...args),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}));

// Default useSortable return value (not dragging)
function defaultSortable() {
  mockUseSortable.mockReturnValue({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: null,
    isDragging: false,
  });
}

// ---------------------------------------------------------------------------
// Import component AFTER mocks are registered
// ---------------------------------------------------------------------------
import KanbanFeatureCard from "../KanbanFeatureCard";

// ---------------------------------------------------------------------------
// Shared sample feature
// ---------------------------------------------------------------------------

const SAMPLE_FEATURE = {
  id: "feat-1",
  title: "Dark mode support",
  category: "general",
  status: "planned",
  vote_count: 42,
  comment_count: 7,
  author_name: "Alice",
  created_at: "2024-01-01T00:00:00Z",
};

function renderCard(feature = SAMPLE_FEATURE) {
  return render(
    <MemoryRouter>
      <KanbanFeatureCard feature={feature} />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Task 8.2 — Property 6 (JS): Drag Handle aria-label Totality
// Feature: sprint-5a-admin-kanban-board, Property 6: Drag Handle aria-label Totality
// Validates: Requirements 13.5, 18.1
// ---------------------------------------------------------------------------

describe("Property 6: Drag Handle aria-label Is Total (task 8.2)", () => {
  beforeEach(() => {
    defaultSortable();
  });

  it("drag handle aria-label equals `Drag <title> to reorder` for any title string", () => {
    fc.assert(
      fc.property(fc.string(), (title) => {
        const feature = { ...SAMPLE_FEATURE, title };

        const { container, unmount } = render(
          <MemoryRouter>
            <KanbanFeatureCard feature={feature} />
          </MemoryRouter>
        );

        // Enumerate all buttons and match on the raw aria-label attribute value
        // so that any title string (including those with CSS special characters
        // such as > or [ that would break a querySelector attribute selector)
        // is handled correctly.
        const expectedLabel = `Drag ${title} to reorder`;
        const buttons = Array.from(container.querySelectorAll("button"));
        const handle = buttons.find(
          (btn) => btn.getAttribute("aria-label") === expectedLabel
        );

        expect(handle).toBeDefined();
        expect(handle.getAttribute("aria-label")).toBe(expectedLabel);

        unmount();
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Task 8.3 — Unit tests for KanbanFeatureCard
// Validates: Requirements 13.1, 13.2, 13.4
// ---------------------------------------------------------------------------

describe("KanbanFeatureCard unit tests (task 8.3)", () => {
  beforeEach(() => {
    defaultSortable();
  });

  it("renders the feature title", () => {
    renderCard();
    expect(screen.getByText("Dark mode support")).toBeInTheDocument();
  });

  it("renders the category badge with the category text", () => {
    renderCard();
    // category "general" → rendered as "general" (no underscores to replace)
    expect(screen.getByText("general")).toBeInTheDocument();
  });

  it("shows the vote count with ▲ prefix", () => {
    renderCard();
    expect(screen.getByText("▲ 42")).toBeInTheDocument();
  });

  it("shows the comment count with 💬 prefix", () => {
    renderCard();
    expect(screen.getByText("💬 7")).toBeInTheDocument();
  });

  it('"View feature →" link points to /features/feat-1', () => {
    renderCard();
    const link = screen.getByRole("link", { name: /view feature/i });
    expect(link).toHaveAttribute("href", "/features/feat-1");
  });

  it("applies opacity 0.4 on the card wrapper when isDragging is true", () => {
    // Override for this test only: simulate an active drag
    mockUseSortable.mockReturnValueOnce({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      transition: null,
      isDragging: true,
    });

    renderCard();

    // The drag handle is inside the root div that carries the inline style.
    const handle = screen.getByRole("button", {
      name: /drag dark mode support to reorder/i,
    });
    const cardDiv = handle.closest("div[style]");
    expect(cardDiv).not.toBeNull();
    expect(cardDiv.style.opacity).toBe("0.4");
  });
});
