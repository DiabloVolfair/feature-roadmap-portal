import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { applyOptimisticMove } from "../useAdminBoard";

// ─── Shared arbitraries ───────────────────────────────────────────────────────

const STATUSES = ["under_review", "planned", "in_progress", "completed"];

/** A single feature card with unique-enough id and numeric counts. */
const featureArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 16 }),
  title: fc.string(),
  status: fc.constantFrom(...STATUSES),
  vote_count: fc.integer({ min: 0, max: 1000 }),
  comment_count: fc.integer({ min: 0, max: 500 }),
});

/**
 * Board arbitrary: 4 columns each containing 0–5 features.
 * IDs are made globally unique by prepending the column index + position so
 * the property tests can rely on each feature appearing in exactly one column.
 */
const boardArb = fc
  .tuple(
    fc.array(featureArb, { minLength: 0, maxLength: 5 }),
    fc.array(featureArb, { minLength: 0, maxLength: 5 }),
    fc.array(featureArb, { minLength: 0, maxLength: 5 }),
    fc.array(featureArb, { minLength: 0, maxLength: 5 })
  )
  .map(([ur, pl, ip, co]) => ({
    under_review: ur.map((f, i) => ({ ...f, id: `ur-${i}-${f.id}`, status: "under_review" })),
    planned:      pl.map((f, i) => ({ ...f, id: `pl-${i}-${f.id}`, status: "planned" })),
    in_progress:  ip.map((f, i) => ({ ...f, id: `ip-${i}-${f.id}`, status: "in_progress" })),
    completed:    co.map((f, i) => ({ ...f, id: `co-${i}-${f.id}`, status: "completed" })),
  }));

// ─── Task 7.3 ─────────────────────────────────────────────────────────────────
// Feature: sprint-5a-admin-kanban-board, Property 4: Optimistic Move Consistency
// Validates: Requirements 10.2, 10.3

/**
 * For a board that has at least one feature, pick a random featureId from any
 * column and a random targetStatus.
 */
const boardWithMoveArb = boardArb.chain((board) => {
  const allFeatures = Object.values(board).flat();
  if (allFeatures.length === 0) {
    // No features to move — keep as-is and produce a dummy move that won't find anything.
    return fc.constant({ board, featureId: "__none__", targetStatus: "planned" });
  }
  return fc.record({
    board: fc.constant(board),
    featureId: fc.constantFrom(...allFeatures.map((f) => f.id)),
    targetStatus: fc.constantFrom(...STATUSES),
  });
});

describe("applyOptimisticMove", () => {
  test("Property 4: Optimistic Move Consistency — feature appears in exactly one column after move", () => {
    fc.assert(
      fc.property(boardWithMoveArb, ({ board, featureId, targetStatus }) => {
        const result = applyOptimisticMove(board, featureId, targetStatus);

        const allFeatures = Object.values(board).flat();
        const featureExists = allFeatures.some((f) => f.id === featureId);

        if (!featureExists) {
          // No feature found — result should be unchanged in structure (no crash)
          expect(result).toBeDefined();
          return;
        }

        // 1. The feature appears in exactly ONE column (the targetStatus column).
        const inTarget = result[targetStatus].filter((f) => f.id === featureId);
        expect(inTarget).toHaveLength(1);

        // 2. The feature does NOT appear in any other column.
        for (const col of STATUSES) {
          if (col === targetStatus) continue;
          const inOther = result[col].filter((f) => f.id === featureId);
          expect(inOther).toHaveLength(0);
        }

        // 3. All other features are untouched — same total count everywhere else.
        for (const col of STATUSES) {
          const originalOthers = board[col].filter((f) => f.id !== featureId);
          const resultOthers   = result[col].filter((f) => f.id !== featureId);
          expect(resultOthers).toHaveLength(originalOthers.length);
          // Each other feature is still present and unchanged.
          for (const orig of originalOthers) {
            const still = resultOthers.find((f) => f.id === orig.id);
            expect(still).toBeDefined();
            expect(still.vote_count).toBe(orig.vote_count);
            expect(still.comment_count).toBe(orig.comment_count);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Task 7.4 ─────────────────────────────────────────────────────────────────
// Feature: sprint-5a-admin-kanban-board, Property 5: Board Statistics Consistency
// Validates: Requirements 15.1, 15.2

/**
 * Local implementation of computeStats mirroring the design doc.
 * (AdminBoardPage.jsx will export this in task 10; we test the pure logic here.)
 */
function computeStats(board) {
  if (!board) return null;
  const all = Object.values(board).flat();
  return {
    total:         all.length,
    under_review:  board.under_review.length,
    planned:       board.planned.length,
    in_progress:   board.in_progress.length,
    completed:     board.completed.length,
    totalVotes:    all.reduce((s, f) => s + f.vote_count, 0),
    totalComments: all.reduce((s, f) => s + f.comment_count, 0),
  };
}

/** Wider board arbitrary for stats tests: 0–10 features per column. */
const statsBoardArb = fc
  .tuple(
    fc.array(featureArb, { minLength: 0, maxLength: 10 }),
    fc.array(featureArb, { minLength: 0, maxLength: 10 }),
    fc.array(featureArb, { minLength: 0, maxLength: 10 }),
    fc.array(featureArb, { minLength: 0, maxLength: 10 })
  )
  .map(([ur, pl, ip, co]) => ({
    under_review: ur.map((f, i) => ({ ...f, id: `ur-${i}-${f.id}` })),
    planned:      pl.map((f, i) => ({ ...f, id: `pl-${i}-${f.id}` })),
    in_progress:  ip.map((f, i) => ({ ...f, id: `ip-${i}-${f.id}` })),
    completed:    co.map((f, i) => ({ ...f, id: `co-${i}-${f.id}` })),
  }));

describe("computeStats", () => {
  test("Property 5: Board Statistics Consistency — all seven invariants hold for any board", () => {
    fc.assert(
      fc.property(statsBoardArb, (board) => {
        const stats = computeStats(board);

        // 1. stats.total === sum of all column lengths
        const expectedTotal =
          board.under_review.length +
          board.planned.length +
          board.in_progress.length +
          board.completed.length;
        expect(stats.total).toBe(expectedTotal);

        // 2. per-column counts match board column lengths
        expect(stats.under_review).toBe(board.under_review.length);
        expect(stats.planned).toBe(board.planned.length);
        expect(stats.in_progress).toBe(board.in_progress.length);
        expect(stats.completed).toBe(board.completed.length);

        // 3. stats.totalVotes === sum of all feature.vote_count values
        const expectedVotes = Object.values(board)
          .flat()
          .reduce((s, f) => s + f.vote_count, 0);
        expect(stats.totalVotes).toBe(expectedVotes);

        // 4. stats.totalComments === sum of all feature.comment_count values
        const expectedComments = Object.values(board)
          .flat()
          .reduce((s, f) => s + f.comment_count, 0);
        expect(stats.totalComments).toBe(expectedComments);
      }),
      { numRuns: 100 }
    );
  });
});
