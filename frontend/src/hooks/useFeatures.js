import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { featureService } from "../services/featureService";

/**
 * Feature_Hooks: React Query wrappers around `featureService` (Req 13.1-13.6, 28.2).
 *
 * `useFeatureFeed`/`useFeature` are read hooks keyed `["features", params]`/
 * `["feature", featureId]` respectively. The four mutation hooks never write an
 * optimistic cache update - every `onSuccess` only invalidates the relevant query
 * key(s), letting the next fetch pull the authoritative server state.
 */

export function useFeatureFeed(params) {
  return useQuery({ queryKey: ["features", params], queryFn: () => featureService.getFeatures(params) });
}

export function useFeature(featureId) {
  return useQuery({
    queryKey: ["feature", featureId],
    queryFn: () => featureService.getFeature(featureId),
    enabled: Boolean(featureId),
  });
}

export function useCreateFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: featureService.createFeature,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["features"] }),
  });
}

export function useUpdateFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ featureId, payload }) => featureService.updateFeature(featureId, payload),
    onSuccess: (_, { featureId }) => {
      queryClient.invalidateQueries({ queryKey: ["features"] });
      queryClient.invalidateQueries({ queryKey: ["feature", featureId] });
    },
  });
}

export function useDeleteFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: featureService.deleteFeature,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["features"] }),
  });
}
