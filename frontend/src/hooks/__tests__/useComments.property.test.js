import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { buildOptimisticComment } from "../useComments";

// Feature: sprint-4-threaded-discussions, Property 6: Optimistic Comment Shape Completeness
// For any valid combination of featureId, content, parentCommentId, and user,
// buildOptimisticComment must return an object that contains every required
// Comment_Document field with the correct types and values.
// Validates: Requirements 15.1, 15.2

const userArb = fc.record({
  id: fc.string(),
  name: fc.string(),
  role: fc.constantFrom("user", "admin"),
  is_verified: fc.boolean(),
});

const inputArb = fc.record({
  user: userArb,
  featureId: fc.string(),
  content: fc.string({ minLength: 1 }),
  parentCommentId: fc.option(fc.string(), { nil: null }),
});

describe("buildOptimisticComment", () => {
  test("Property 6: every generated input yields a comment with all required fields at their correct values", () => {
    fc.assert(
      fc.property(inputArb, ({ user, featureId, content, parentCommentId }) => {
        const comment = buildOptimisticComment({ featureId, content, parentCommentId, user });

        // id must be present and start with "optimistic-"
        expect(typeof comment.id).toBe("string");
        expect(comment.id.startsWith("optimistic-")).toBe(true);

        // feature_id maps from featureId
        expect(comment.feature_id).toBe(featureId);

        // author fields come from user
        expect(comment.author_id).toBe(user.id);
        expect(comment.author_name).toBe(user.name);
        expect(comment.author_role).toBe(user.role);
        expect(comment.is_verified).toBe(user.is_verified);

        // parent_comment_id is null when not provided, or the provided string
        if (parentCommentId === null) {
          expect(comment.parent_comment_id).toBeNull();
        } else {
          expect(comment.parent_comment_id).toBe(parentCommentId);
        }

        // content_markdown maps from content
        expect(comment.content_markdown).toBe(content);

        // reply_count must be exactly 0
        expect(comment.reply_count).toBe(0);

        // replies must be an empty array
        expect(Array.isArray(comment.replies)).toBe(true);
        expect(comment.replies).toHaveLength(0);

        // timestamps must be ISO strings
        expect(typeof comment.created_at).toBe("string");
        expect(typeof comment.updated_at).toBe("string");
        expect(() => new Date(comment.created_at).toISOString()).not.toThrow();
        expect(() => new Date(comment.updated_at).toISOString()).not.toThrow();

        // is_deleted must be exactly false
        expect(comment.is_deleted).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
