/**
 * Property 7: CommentComposer Submit Disabled on Invalid Length
 *
 * Validates: Requirements 19.4, 19.5
 *
 * For any string length in [0, 2500], when CommentComposer is mounted with
 * that string as `initialValue` and `isLoading=false`, the "Post comment"
 * submit button must be:
 *   - disabled  when length < 3 || length > 2000
 *   - enabled   otherwise
 *
 * MarkdownEditor is mocked to a plain <textarea> so we never touch real
 * markdown rendering inside this property test.
 */

import { describe, test, vi } from "vitest";
import fc from "fast-check";
import { render, screen, cleanup } from "@testing-library/react";
import CommentComposer from "../CommentComposer";

// ────────────────────────────────────────────────────────────────────────────
// Mock MarkdownEditor: replace the real editor (which mounts MarkdownRenderer,
// remark plugins, etc.) with a minimal controlled textarea that calls
// onChange when the user types. This keeps the test fast and dependency-free.
// ────────────────────────────────────────────────────────────────────────────
vi.mock("../MarkdownEditor", () => ({
  default: function MockMarkdownEditor({ value, onChange }) {
    return (
      <textarea
        data-testid="mock-markdown-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  },
}));

// ────────────────────────────────────────────────────────────────────────────
// Property 7
// **Validates: Requirements 19.4, 19.5**
// ────────────────────────────────────────────────────────────────────────────
describe("CommentComposer submit disabled on invalid length (Property 7)", () => {
  test("button disabled iff length < 3 or length > 2000 when isLoading=false", () => {
    fc.assert(
      fc.property(
        // Generate lengths from 0 to 2500 (covers below-min, valid, and
        // above-max ranges). Use fc.integer rather than a random string to
        // keep the generated value's length predictable.
        fc.integer({ min: 0, max: 2500 }),
        (length) => {
          // Build a string of exactly `length` characters using "a".
          const initialValue = "a".repeat(length);

          const { unmount } = render(
            <CommentComposer
              initialValue={initialValue}
              onSubmit={() => {}}
              isLoading={false}
            />,
          );

          const button = screen.getByRole("button", { name: "Post comment" });

          const shouldBeDisabled = length < 3 || length > 2000;

          if (shouldBeDisabled) {
            // disabled attribute must be present
            expect(button).toBeDisabled();
          } else {
            // button must be interactive
            expect(button).not.toBeDisabled();
          }

          // Clean up between iterations to avoid DOM bleed-over.
          unmount();
          cleanup();
        },
      ),
      { numRuns: 100 },
    );
  });
});
