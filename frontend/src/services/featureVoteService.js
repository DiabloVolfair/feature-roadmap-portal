import { httpClient } from "./httpClient";

export const featureVoteService = {
  async toggleVote(featureId) {
    const { data } = await httpClient.post(`/api/v1/features/${featureId}/vote`);
    return data.data; // { voted, vote_count }
  },
  async getVoteStatus(featureId) {
    const { data } = await httpClient.get(`/api/v1/features/${featureId}/vote-status`);
    return data.data; // { has_voted, vote_count }
  },
};
