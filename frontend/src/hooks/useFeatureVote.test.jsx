import { describe, it, test, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useToggleVote } from "./useFeatureVote";
import { featureVoteService } from "../services/featureVoteService";
import { toast } from "sonner";
import { applyOptimisticVote, applyOptimisticVoteToPage } from "../components/voteAnimation";

// The Vote_Hook delegates the network call to featureVoteService.toggleVote;
// mocking it lets each test control resolve/reject without a real request.
vi.mock("../services/featureVoteService", () => ({
  featureVoteService: {
    toggleVote: vi.fn(),
    getVoteStatus: vi.fn(),
  },
}));

// Sonner is mocked so onError's single error Toast can be asserted.
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Task 8.2 - Property 6: Optimistic update followed by rollback restores the
// original cache. Snapshotting a cache entry, applying the optimistic vote
// transform, then restoring the snapshot yields a cache deeply equal to the
// original, for any failure cause.
// Validates: Requirements 10.3, 19.1
// ---------------------------------------------------------------------------

const featureArb = fc.record({
  id: fc.integer({ min: 0, max: 50 }),
  has_voted: fc.boolean(),
  vote_count: fc.integer({ min: 0, max: 10_000 }),
  title: fc.string(),
  category: fc.constantFrom("bug", "feature", "improvement"),
});

// A feed page holds a de-duplicated list of features plus page-level fields.
const pageArb = fc.record({
  items: fc.array(featureArb, { minLength: 0, maxLength: 8 }).map((items) => {
    const seen = new Set();
    return items.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
  }),
  pagination: fc.record({
    page: fc.integer({ min: 1, max: 20 }),
    total: fc.integer({ min: 0, max: 1000 }),
  }),
});

describe("Vote_Hook optimistic-update / rollback round-trip (Property 6)", () => {
  test("snapshot -> optimistic transform -> restore snapshot deeply equals the original detail cache", () => {
    fc.assert(
      fc.property(featureArb, (feature) => {
        // Seed a real QueryClient's detail cache entry.
        const queryClient = new QueryClient();
        const key = ["feature", feature.id];
        queryClient.setQueryData(key, feature);

        // Snapshot (what onMutate captures), then apply the optimistic write.
        const snapshot = queryClient.getQueryData(key);
        queryClient.setQueryData(key, applyOptimisticVote(queryClient.getQueryData(key)));

        // Sanity: the optimistic write actually changed the cache.
        expect(queryClient.getQueryData(key)).not.toEqual(feature);

        // Restore the snapshot (what onError does on any failure cause).
        queryClient.setQueryData(key, snapshot);

        // The restored cache is deeply equal to the original.
        expect(queryClient.getQueryData(key)).toEqual(feature);
      }),
      { numRuns: 100 }
    );
  });

  test("snapshot -> optimistic transform -> restore snapshot deeply equals every original feed page", () => {
    fc.assert(
      fc.property(pageArb, fc.integer({ min: 0, max: 50 }), (page, targetId) => {
        const queryClient = new QueryClient();
        const key = ["features", { page: page.pagination.page }];
        queryClient.setQueryData(key, page);

        // Snapshot every ["features", ...] entry, as onMutate does.
        const snapshots = queryClient.getQueriesData({ queryKey: ["features"] });

        // Apply the optimistic transform to the seeded page.
        queryClient.setQueryData(key, applyOptimisticVoteToPage(queryClient.getQueryData(key), targetId));

        // Restore every snapshot exactly as onError does.
        snapshots.forEach(([k, snap]) => queryClient.setQueryData(k, snap));

        // The restored feed page is deeply equal to the original.
        expect(queryClient.getQueryData(key)).toEqual(page);
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Task 8.3 - Unit tests for the Vote_Hook lifecycle and cache sync.
// Validates: Requirements 10.1, 10.2, 10.3, 10.4, 17.1, 17.2, 18.1, 18.2,
//            19.2, 19.3
// ---------------------------------------------------------------------------

const FEATURE_ID = "feat-1";
const FEED_PARAMS = { page: 1, category: "feature" };

// Build a fresh, retry-disabled QueryClient seeded with a detail entry and a
// feed page containing the same feature. Retry is disabled so a rejected
// mutation settles to `error` immediately (matching App.test.jsx's pattern).
function seededClient({ detailVoted = false, detailCount = 3 } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(["feature", FEATURE_ID], {
    id: FEATURE_ID,
    title: "Dark mode",
    has_voted: detailVoted,
    vote_count: detailCount,
  });
  queryClient.setQueryData(["features", FEED_PARAMS], {
    items: [
      { id: FEATURE_ID, title: "Dark mode", has_voted: detailVoted, vote_count: detailCount },
      { id: "other", title: "Other", has_voted: false, vote_count: 7 },
    ],
    pagination: { page: 1, total: 2 },
  });
  return queryClient;
}

function wrapperFor(queryClient) {
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const detailOf = (qc) => qc.getQueryData(["feature", FEATURE_ID]);
const feedItemOf = (qc) =>
  qc.getQueryData(["features", FEED_PARAMS]).items.find((f) => f.id === FEATURE_ID);
const otherFeedItemOf = (qc) =>
  qc.getQueryData(["features", FEED_PARAMS]).items.find((f) => f.id === "other");

describe("useToggleVote lifecycle and cache sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("optimistically increments both caches on a successful vote", async () => {
    featureVoteService.toggleVote.mockResolvedValue({ voted: true, vote_count: 4 });
    const queryClient = seededClient({ detailVoted: false, detailCount: 3 });

    const { result } = renderHook(() => useToggleVote(FEATURE_ID), {
      wrapper: wrapperFor(queryClient),
    });

    result.current.mutate();

    // The optimistic write increments count and flips has_voted in both caches.
    await waitFor(() => {
      expect(detailOf(queryClient).vote_count).toBe(4);
    });
    expect(detailOf(queryClient).has_voted).toBe(true);
    expect(feedItemOf(queryClient).vote_count).toBe(4);
    expect(feedItemOf(queryClient).has_voted).toBe(true);

    // The unrelated feed item is left untouched (Req 10.2).
    expect(otherFeedItemOf(queryClient)).toEqual({
      id: "other",
      title: "Other",
      has_voted: false,
      vote_count: 7,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(featureVoteService.toggleVote).toHaveBeenCalledTimes(1);
  });

  it("optimistically decrements both caches when toggling an already-voted feature", async () => {
    featureVoteService.toggleVote.mockResolvedValue({ voted: false, vote_count: 4 });
    // Seed the already-voted state (as if a first vote had landed).
    const queryClient = seededClient({ detailVoted: true, detailCount: 5 });

    const { result } = renderHook(() => useToggleVote(FEATURE_ID), {
      wrapper: wrapperFor(queryClient),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(detailOf(queryClient).vote_count).toBe(4);
    });
    expect(detailOf(queryClient).has_voted).toBe(false);
    expect(feedItemOf(queryClient).vote_count).toBe(4);
    expect(feedItemOf(queryClient).has_voted).toBe(false);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("rolls both caches back and calls toast.error once when the mutation rejects", async () => {
    featureVoteService.toggleVote.mockRejectedValue(new Error("conflict"));
    const queryClient = seededClient({ detailVoted: false, detailCount: 3 });

    const original = {
      detail: detailOf(queryClient),
      feedItem: feedItemOf(queryClient),
      otherItem: otherFeedItemOf(queryClient),
    };

    const { result } = renderHook(() => useToggleVote(FEATURE_ID), {
      wrapper: wrapperFor(queryClient),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Both caches are restored to their exact pre-mutation values (Req 10.3, 19.1).
    expect(detailOf(queryClient)).toEqual(original.detail);
    expect(feedItemOf(queryClient)).toEqual(original.feedItem);
    expect(otherFeedItemOf(queryClient)).toEqual(original.otherItem);

    // Exactly one error Toast is fired, and no success Toast (Req 10.4, 19.2).
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("onSettled invalidates both keys without an immediate synchronous full refetch (Req 17.2, 19.3)", async () => {
    featureVoteService.toggleVote.mockResolvedValue({ voted: true, vote_count: 4 });
    const queryClient = seededClient({ detailVoted: false, detailCount: 3 });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    // Attach queryFns to the seeded caches so we can detect a forced refetch:
    // if onSettled triggered an immediate synchronous refetch, these would run.
    const detailFetch = vi.fn().mockResolvedValue(detailOf(queryClient));
    const feedFetch = vi.fn().mockResolvedValue(queryClient.getQueryData(["features", FEED_PARAMS]));
    queryClient.setQueryDefaults(["feature", FEATURE_ID], { queryFn: detailFetch });
    queryClient.setQueryDefaults(["features"], { queryFn: feedFetch });

    const { result } = renderHook(() => useToggleVote(FEATURE_ID), {
      wrapper: wrapperFor(queryClient),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // onSettled invalidated both affected keys...
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["feature", FEATURE_ID] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["features"] });

    // ...but never forced an immediate synchronous full refetch: there are no
    // active observers, so invalidation only marks the caches stale and no
    // query function runs to replace the optimistic values.
    expect(detailFetch).not.toHaveBeenCalled();
    expect(feedFetch).not.toHaveBeenCalled();

    // The seeded caches are marked stale (not removed / not refetched away),
    // and the optimistic values survive until a real refetch later occurs.
    const detailState = queryClient.getQueryState(["feature", FEATURE_ID]);
    expect(detailState.isInvalidated).toBe(true);
    expect(detailOf(queryClient).vote_count).toBe(4);
  });

  it("leaves seeded URL search params untouched while voting (Req 18.1, 18.2)", async () => {
    featureVoteService.toggleVote.mockResolvedValue({ voted: true, vote_count: 4 });
    const queryClient = seededClient({ detailVoted: false, detailCount: 3 });

    // Seed URL search params; the Vote_Hook must not touch feed URL state.
    const before = "?page=2&category=feature&sort=top";
    window.history.replaceState({}, "", `/features${before}`);

    const { result } = renderHook(() => useToggleVote(FEATURE_ID), {
      wrapper: wrapperFor(queryClient),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The URL's search params are unchanged by the vote.
    expect(window.location.search).toBe(before);
  });
});
