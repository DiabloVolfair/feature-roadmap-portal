import { describe, it, expect } from "vitest";

import { mapHealthState } from "./healthService";

// Table-driven test over {isLoading, isError, data.success} combinations.
// Validates: Requirements 4.4, 4.5, 12.2, 12.3, 12.4
describe("mapHealthState", () => {
  const cases = [
    // isLoading true always wins regardless of isError/data
    { isLoading: true, isError: false, data: undefined, expected: "checking" },
    { isLoading: true, isError: true, data: undefined, expected: "checking" },
    { isLoading: true, isError: false, data: { success: true }, expected: "checking" },
    { isLoading: true, isError: true, data: { success: true }, expected: "checking" },
    { isLoading: true, isError: false, data: { success: false }, expected: "checking" },
    { isLoading: true, isError: true, data: { success: false }, expected: "checking" },

    // isLoading false, isError true -> always disconnected
    { isLoading: false, isError: true, data: undefined, expected: "disconnected" },
    { isLoading: false, isError: true, data: { success: true }, expected: "disconnected" },
    { isLoading: false, isError: true, data: { success: false }, expected: "disconnected" },

    // isLoading false, isError false, data missing or unsuccessful -> disconnected
    { isLoading: false, isError: false, data: undefined, expected: "disconnected" },
    { isLoading: false, isError: false, data: { success: false }, expected: "disconnected" },

    // isLoading false, isError false, data.success true -> connected
    { isLoading: false, isError: false, data: { success: true }, expected: "connected" },
  ];

  it.each(cases)(
    "returns $expected when isLoading=$isLoading, isError=$isError, data=$data",
    ({ isLoading, isError, data, expected }) => {
      expect(mapHealthState({ isLoading, isError, data })).toBe(expected);
    }
  );
});
