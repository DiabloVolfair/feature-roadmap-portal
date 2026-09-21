import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { commentService } from "../services/commentService";

// ---------------------------------------------------------------------------
// Pure helper functions (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Builds an optimistic comment object to insert into the cache before the
 * server responds.
 *
 * @param {{ featureId: string, content: string, parentCommentId: string|null, user: object }} params
 * @returns {object} Optimistic_Comment
 */
export function buildOptimisticComment({ featureId, content, parentCommentId = null, user }) {
  return {
    id: `optimistic-${Date.now()}`,
    feature_id: featureId,
    author_id: user.id,
    author_name: user.name,
    author_role: user.role ?? "user",
    is_verified: user.is_verified ?? false,
    parent_comment_id: parentCommentId ?? null,
    content_markdown: content,
    reply_count: 0,
    replies: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_deleted: false,
  };
}

/**
 * Inserts `optimistic` into the comment tree array.
 * - If `optimistic.parent_comment_id` is null → append to root level.
 * - Otherwise → walk the tree depth-first until the parent is found, then
 *   append to `parent.replies`.
 *
 * Returns a new array (immutable).
 *
 * @param {object[]} tree
 * @param {object} optimistic
 * @returns {object[]}
 */
export function insertOptimisticComment(tree, optimistic) {
  if (!optimistic.parent_comment_id) {
    return [...tree, optimistic];
  }

  return tree.map((node) => {
    if (node.id === optimistic.parent_comment_id) {
      return { ...node, replies: [...(node.replies ?? []), optimistic] };
    }
    if (node.replies && node.replies.length > 0) {
      return { ...node, replies: insertOptimisticComment(node.replies, optimistic) };
    }
    return node;
  });
}

/**
 * Walks the comment tree recursively and applies `updateFn` to the node
 * whose `id === commentId`. All other nodes are returned unchanged.
 *
 * Returns a new array (immutable).
 *
 * @param {object[]} tree
 * @param {string} commentId
 * @param {(node: object) => object} updateFn
 * @returns {object[]}
 */
export function applyTreeUpdate(tree, commentId, updateFn) {
  return tree.map((node) => {
    if (node.id === commentId) {
      return updateFn(node);
    }
    if (node.replies && node.replies.length > 0) {
      return { ...node, replies: applyTreeUpdate(node.replies, commentId, updateFn) };
    }
    return node;
  });
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Read hook – fetches the threaded comment tree for a feature.
 * Query key: ["comments", featureId]
 */
export function useComments(featureId) {
  return useQuery({
    queryKey: ["comments", featureId],
    queryFn: () => commentService.getComments(featureId),
    enabled: Boolean(featureId),
  });
}

/**
 * Mutation: create a top-level comment.
 * Variables: { featureId, content, user }
 */
export function useCreateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ featureId, content }) =>
      commentService.createComment(featureId, { content_markdown: content }),

    async onMutate({ featureId, content, user }) {
      await queryClient.cancelQueries({ queryKey: ["comments", featureId] });

      const snapshot = queryClient.getQueryData(["comments", featureId]);

      const optimistic = buildOptimisticComment({ featureId, content, parentCommentId: null, user });

      queryClient.setQueryData(["comments", featureId], (prev) =>
        insertOptimisticComment(prev ?? [], optimistic)
      );

      return { snapshot };
    },

    onError(_err, { featureId }, context) {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(["comments", featureId], context.snapshot);
      }
      toast.error("Could not post comment. Please try again.");
    },

    onSettled(_data, _err, { featureId }) {
      queryClient.invalidateQueries({ queryKey: ["comments", featureId] });

      queryClient.setQueryData(["feature", featureId], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          comment_count: (prev.comment_count ?? 0) + 1,
        };
      });

      queryClient.invalidateQueries({ queryKey: ["features"] });
    },
  });
}

/**
 * Mutation: reply to an existing comment.
 * Variables: { commentId (= parentCommentId), featureId, content, user }
 */
export function useReplyToComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId, content }) =>
      commentService.replyToComment(commentId, { content_markdown: content }),

    async onMutate({ commentId: parentCommentId, featureId, content, user }) {
      await queryClient.cancelQueries({ queryKey: ["comments", featureId] });

      const snapshot = queryClient.getQueryData(["comments", featureId]);

      const optimistic = buildOptimisticComment({
        featureId,
        content,
        parentCommentId,
        user,
      });

      queryClient.setQueryData(["comments", featureId], (prev) =>
        insertOptimisticComment(prev ?? [], optimistic)
      );

      return { snapshot };
    },

    onError(_err, { featureId }, context) {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(["comments", featureId], context.snapshot);
      }
      toast.error("Could not post comment. Please try again.");
    },

    onSettled(_data, _err, { featureId }) {
      queryClient.invalidateQueries({ queryKey: ["comments", featureId] });

      queryClient.setQueryData(["feature", featureId], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          comment_count: (prev.comment_count ?? 0) + 1,
        };
      });

      queryClient.invalidateQueries({ queryKey: ["features"] });
    },
  });
}

/**
 * Mutation: edit a comment's content.
 * Variables: { commentId, featureId, content }
 */
export function useUpdateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId, content }) =>
      commentService.updateComment(commentId, { content_markdown: content }),

    async onMutate({ commentId, featureId, content }) {
      await queryClient.cancelQueries({ queryKey: ["comments", featureId] });

      const snapshot = queryClient.getQueryData(["comments", featureId]);

      queryClient.setQueryData(["comments", featureId], (prev) => {
        if (!prev) return prev;
        return applyTreeUpdate(prev, commentId, (node) => ({
          ...node,
          content_markdown: content,
          updated_at: new Date().toISOString(),
        }));
      });

      return { snapshot };
    },

    onError(_err, { featureId }, context) {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(["comments", featureId], context.snapshot);
      }
      toast.error("Could not update comment. Please try again.");
    },

    onSettled(_data, _err, { featureId }) {
      queryClient.invalidateQueries({ queryKey: ["comments", featureId] });
    },
  });
}

/**
 * Mutation: soft-delete a comment.
 * Variables: { commentId, featureId }
 */
export function useDeleteComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId }) => commentService.deleteComment(commentId),

    async onMutate({ commentId, featureId }) {
      await queryClient.cancelQueries({ queryKey: ["comments", featureId] });

      const snapshot = queryClient.getQueryData(["comments", featureId]);

      queryClient.setQueryData(["comments", featureId], (prev) => {
        if (!prev) return prev;
        return applyTreeUpdate(prev, commentId, (node) => ({
          ...node,
          is_deleted: true,
          content_markdown: "[deleted]",
          author_name: "[deleted]",
        }));
      });

      return { snapshot };
    },

    onError(_err, { featureId }, context) {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(["comments", featureId], context.snapshot);
      }
      toast.error("Could not delete comment. Please try again.");
    },

    onSettled(_data, _err, { featureId }) {
      queryClient.invalidateQueries({ queryKey: ["comments", featureId] });

      queryClient.setQueryData(["feature", featureId], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          comment_count: Math.max(0, (prev.comment_count ?? 0) - 1),
        };
      });

      queryClient.invalidateQueries({ queryKey: ["features"] });
    },
  });
}
