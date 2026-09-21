import { useQuery } from "@tanstack/react-query";
import { roadmapService } from "../services/roadmapService";

export function useRoadmap() {
  return useQuery({
    queryKey: ["roadmap"],
    queryFn: roadmapService.getRoadmap,
  });
}
