import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { applyOptimisticVote, applyOptimisticVoteToPage } from "./voteAnimation";

// Feature: sprint-3-voting-engine, Property 5: applying the optimistic vote
// transform flips the target feature's `has_voted`, changes its `vote_count`
// by exactly +1 (when not voted) or -1 (when voted, never below zero), and
// applies that same change to the feature everywhere it appears (the detail
// entry and every feed page containing it) while leaving all other features
// and fields unchanged.
// Validates: Requirements 10.1, 10.2, 10.5, 17.1

// A feature carries an id, has_voted flag, a non-negative vote_count, plus
// some arbitrary extra fields that must survive the transform untouched.
const featureArb = fc.record({
  id: fc.integer({ min: 0, max: 50 }),
  has_voted: fc.boolean(),
  vote_count: fc.integer({ min: 0, max: 10_000 }),
  // Extra fields that must be carried through unchanged.
  title: fc.string(),
  category: fc.constantFrom("bug", "feature", "improvement"),
});

const expectedCount = (feature) =>
  feature.has_voted ? Math.max(0, feature.vote_count - 1) : feature.vote_count + 1;

describe("applyOptimisticVote", () => {
  test("flips has_voted and adjusts vote_count by exactly +/-1 (zero-clamped), leaving other fields unchanged", () => {
    fc.assert(
      fc.property(featureArb, (feature) => {
        const result = applyOptimisticVote(feature);

        // has_voted flips.
        expect(result.has_voted).toBe(!feature.has_voted);

        // vote_count changes by exactly +1 (not voted) or -1 (voted), clamped at zero.
        expect(result.vote_count).toBe(expectedCount(feature));
        expect(result.vote_count).toBeGreaterThanOrEqual(0);

        // Every other field is preserved untouched.
        expect(result.id).toBe(feature.id);
        expect(result.title).toBe(feature.title);
        expect(result.category).toBe(feature.category);

        // The input is not mutated (returns a new object).
        expect(result).not.toBe(feature);
      }),
      { numRuns: 100 }
    );
  });

  test("never drives the count below zero, even from a zero count while voted", () => {
    fc.assert(
      fc.property(
        fc.record({ id: fc.integer(), has_voted: fc.constant(true), vote_count: fc.constant(0) }),
        (feature) => {
          const result = applyOptimisticVote(feature);
          expect(result.has_voted).toBe(false);
          expect(result.vote_count).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("applyOptimisticVoteToPage", () => {
  test("transforms only the matching entry and leaves every other entry and page field unchanged", () => {
    // A feed page: an arbitrary list of features (unique ids) plus arbitrary
    // page-level fields, and a target id which may or may not be present.
    const pageArb = fc
      .array(featureArb, { minLength: 0, maxLength: 8 })
      .map((items) => {
        // De-duplicate ids so "everywhere it appears" is well-defined and each
        // id maps to at most one entry within a page.
        const seen = new Set();
        return items.filter((f) => {
          if (seen.has(f.id)) return false;
          seen.add(f.id);
          return true;
        });
      });

    fc.assert(
      fc.property(
        fc.record({
          items: pageArb,
          // Page-level fields that must survive untouched.
          pagination: fc.record({
            page: fc.integer({ min: 1, max: 20 }),
            total: fc.integer({ min: 0, max: 1000 }),
          }),
        }),
        fc.integer({ min: 0, max: 50 }),
        (page, targetId) => {
          const result = applyOptimisticVoteToPage(page, targetId);

          // Page-level fields are preserved.
          expect(result.pagination).toEqual(page.pagination);
          expect(result.items).toHaveLength(page.items.length);

          page.items.forEach((original, i) => {
            const transformed = result.items[i];
            if (original.id === targetId) {
              // The matching entry gets the optimistic transform applied.
              expect(transformed.has_voted).toBe(!original.has_voted);
              expect(transformed.vote_count).toBe(expectedCount(original));
              expect(transformed.vote_count).toBeGreaterThanOrEqual(0);
              expect(transformed.title).toBe(original.title);
              expect(transformed.category).toBe(original.category);
            } else {
              // Non-target entries are left entirely unchanged.
              expect(transformed).toEqual(original);
            }
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  test("returns the page unchanged when it has no items", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.record({ pagination: fc.record({ page: fc.integer() }) }),
          fc.constant({}),
          fc.constant(null),
          fc.constant(undefined)
        ),
        fc.integer(),
        (page, targetId) => {
          expect(applyOptimisticVoteToPage(page, targetId)).toBe(page);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("applies the same change to the target feature everywhere it appears across multiple pages", () => {
    fc.assert(
      fc.property(
        featureArb,
        fc.array(fc.array(featureArb, { maxLength: 4 }), { minLength: 1, maxLength: 3 }),
        fc.integer({ min: 0, max: 50 }),
        (target, otherItemsPerPage, targetId) => {
          const tagged = { ...target, id: targetId };
          // Build pages that each contain the target plus arbitrary others
          // (with the target id stripped from the "others" to avoid dupes).
          const pages = otherItemsPerPage.map((others) => ({
            items: [tagged, ...others.filter((f) => f.id !== targetId)],
          }));

          const expected = expectedCount(tagged);
          pages.forEach((page) => {
            const result = applyOptimisticVoteToPage(page, targetId);
            const t = result.items.find((f) => f.id === targetId);
            expect(t.has_voted).toBe(!tagged.has_voted);
            expect(t.vote_count).toBe(expected);
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
