import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as adminBoardService from "../services/adminBoardService";

export function applyOptimisticMove(board, featureId, targetStatus) {
  if (!board) return board;
  // Find the card in any column
  let card = null;
  for (const col of Object.values(board)) {
    const found = col.find(f => f.id === featureId);
    if (found) { card = found; break; }
  }
  // Build new board: remove from all columns, prepend to target
  const next = {};
  for (const [col, features] of Object.entries(board)) {
    next[col] = features.filter(f => f.id !== featureId);
  }
  if (card) {
    next[targetStatus] = [{ ...card, status: targetStatus }, ...next[targetStatus]];
  }
  return next;
}

export function useAdminBoard() {
  return useQuery({
    queryKey: ["adminBoard"],
    queryFn: adminBoardService.getBoard,
  });
}

export function useUpdateFeatureStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ featureId, status }) =>
      adminBoardService.updateStatus(featureId, status),

    onMutate: async ({ featureId, status: newStatus }) => {
      await queryClient.cancelQueries({ queryKey: ["adminBoard"] });
      const snapshot = queryClient.getQueryData(["adminBoard"]);
      queryClient.setQueryData(["adminBoard"], (old) =>
        applyOptimisticMove(old, featureId, newStatus)
      );
      return { snapshot };
    },

    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(["adminBoard"], context.snapshot);
      }
      toast.error("Status update failed. The change has been reverted.");
    },

    onSettled: (_data, _err, { featureId, status: newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ["adminBoard"] });
      queryClient.setQueryData(["feature", featureId], (old) =>
        old ? { ...old, status: newStatus } : old
      );
      queryClient.invalidateQueries({ queryKey: ["features"] });
    },
  });
}
