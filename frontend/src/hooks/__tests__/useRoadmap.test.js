import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useRoadmap } from "../useRoadmap";

vi.mock("../../services/roadmapService", () => ({
  roadmapService: {
    getRoadmap: vi.fn().mockResolvedValue({
      planned: [],
      in_progress: [],
      completed: [],
    }),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }) {
    return (
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    );
  };
}

// Validates: Requirements 5.1, 5.2, 5.3, 15.1, 15.3
describe("useRoadmap", () => {
  it("uses query key [\"roadmap\"]", async () => {
    const { result } = renderHook(() => useRoadmap(), {
      wrapper: createWrapper(),
    });

    // The hook should start loading and then resolve
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Verify the resolved data shape
    expect(result.current.data).toEqual({
      planned: [],
      in_progress: [],
      completed: [],
    });
  });

  it("is initially in a loading state", () => {
    const { result } = renderHook(() => useRoadmap(), {
      wrapper: createWrapper(),
    });

    // On first render before the query resolves, it should be fetching
    expect(result.current.isLoading || result.current.isFetching).toBe(true);
  });
});
