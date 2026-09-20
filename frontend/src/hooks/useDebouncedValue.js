import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` that updates only after `delayMs`
 * milliseconds have elapsed without `value` changing again. Hand-rolled
 * rather than a new dependency, matching this project's established
 * preference to avoid adding a library for functionality this small
 * (Req 20.2).
 */
export function useDebouncedValue(value, delayMs) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debouncedValue;
}
