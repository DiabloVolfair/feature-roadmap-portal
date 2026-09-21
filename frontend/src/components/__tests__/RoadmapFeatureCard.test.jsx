// Feature: sprint-5b-public-roadmap, Property 4: Roadmap Card Link Correctness
// Feature: sprint-5b-public-roadmap, Property 5: Roadmap Card Renders All Required Fields

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RoadmapFeatureCard from "../RoadmapFeatureCard";

// ---------------------------------------------------------------------------
// Shared card arbitrary
// ---------------------------------------------------------------------------

// MongoDB ObjectId strings are hex strings — constrain id to alphanumeric
// characters so the generated URL path `/features/{id}` is always valid.
const mongoIdArbitrary = fc.stringMatching(/^[a-zA-Z0-9]{1,24}$/);

const cardArbitrary = fc.record({
  id: mongoIdArbitrary,
  title: fc.string(),
  category: fc.constantFrom("general", "ui_ux"),
  status: fc.constantFrom("planned", "in_progress", "completed"),
  vote_count: fc.nat(),
  comment_count: fc.nat(),
  author_name: fc.string(),
  created_at: fc.constant("2024-01-01T00:00:00Z"),
});

function renderCard(feature) {
  return render(
    <MemoryRouter>
      <RoadmapFeatureCard feature={feature} />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Property 4: Roadmap Card Link Correctness
// Validates: Requirements 8.1, 8.2
// ---------------------------------------------------------------------------

describe("Property 4: Roadmap Card Link Correctness", () => {
  it("rendered output contains a link with href /features/{id} for any valid card", () => {
    fc.assert(
      fc.property(cardArbitrary, (feature) => {
        const { container, unmount } = renderCard(feature);

        const links = Array.from(container.querySelectorAll("a"));
        const detailsLink = links.find(
          (a) => a.getAttribute("href") === `/features/${feature.id}`
        );

        expect(detailsLink).toBeDefined();
        expect(detailsLink).not.toBeNull();

        unmount();
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Roadmap Card Renders All Required Fields
// Validates: Requirements 8.1, 8.2
// ---------------------------------------------------------------------------

describe("Property 5: Roadmap Card Renders All Required Fields", () => {
  it("rendered text contains vote_count, comment_count, title, and 'View Details →' link for any valid card", () => {
    fc.assert(
      fc.property(cardArbitrary, (feature) => {
        const { container, unmount } = renderCard(feature);

        // title is present
        expect(container.textContent).toContain(feature.title);

        // vote_count appears as a number in the text
        expect(container.textContent).toContain(String(feature.vote_count));

        // comment_count appears as a number in the text
        expect(container.textContent).toContain(String(feature.comment_count));

        // "View Details →" link is present
        const links = Array.from(container.querySelectorAll("a"));
        const viewLink = links.find((a) => a.textContent.includes("View Details"));
        expect(viewLink).toBeDefined();
        expect(viewLink).not.toBeNull();

        unmount();
      }),
      { numRuns: 100 }
    );
  });
});
