import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { featureVoteService } from "../services/featureVoteService";
import { applyOptimisticVote, applyOptimisticVoteToPage } from "../components/voteAnimation";

/**
 * Vote_Hook: React Query mutation wrapping `featureVoteService.toggleVote`
 * with optimistic cache updates and rollback (Req 9, 10, 17, 19).
 *
 * The hook keeps the feature detail cache (`["feature", featureId]`) and every
 * feed page (`["features", ...]`) in sync with a single optimistic write, then
 * reconciles with the server on settle without forcing an immediate synchronous
 * full refetch. It never imports `useSearchParams`/feed-query-param utilities,
 * so a vote is fully decoupled from feed URL state (Req 18.3), and it does not
 * modify `useFeatures.js` (Req 9.1).
 */
export function useToggleVote(featureId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => featureVoteService.toggleVote(featureId),

    async onMutate() {
      // Stop in-flight fetches so they can't clobber the optimistic write.
      await queryClient.cancelQueries({ queryKey: ["feature", featureId] });
      await queryClient.cancelQueries({ queryKey: ["features"] });

      // Snapshot every affected cache entry for rollback.
      const prevDetail = queryClient.getQueryData(["feature", featureId]);
      const prevFeeds = queryClient.getQueriesData({ queryKey: ["features"] });

      // Optimistically update the detail entry...
      if (prevDetail) {
        queryClient.setQueryData(["feature", featureId], applyOptimisticVote(prevDetail));
      }
      // ...and every feed page containing the feature.
      prevFeeds.forEach(([key, page]) => {
        queryClient.setQueryData(key, applyOptimisticVoteToPage(page, featureId));
      });

      return { prevDetail, prevFeeds };
    },

    onError(_err, _vars, context) {
      // Restore the exact pre-mutation snapshots (Req 10.3, 19.1).
      if (context?.prevDetail !== undefined) {
        queryClient.setQueryData(["feature", featureId], context.prevDetail);
      }
      context?.prevFeeds?.forEach(([key, page]) => queryClient.setQueryData(key, page));

      // Fire exactly one error Toast (Req 10.4, 19.2).
      toast.error("Your vote could not be recorded. Please try again.");
    },

    onSettled() {
      // Reconcile eventually; NOT an immediate synchronous full refetch that
      // would replace the optimistic feed page mid-interaction (Req 17.2).
      queryClient.invalidateQueries({ queryKey: ["feature", featureId] });
      queryClient.invalidateQueries({ queryKey: ["features"] });
    },
  });
}
