import { httpClient } from "./httpClient";

export const roadmapService = {
  async getRoadmap() {
    const { data } = await httpClient.get("/api/v1/roadmap");
    return data.data; // RoadmapResponse shape: { planned, in_progress, completed }
  },
};
