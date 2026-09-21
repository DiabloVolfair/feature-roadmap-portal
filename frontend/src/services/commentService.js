import { httpClient } from "./httpClient";

export const commentService = {
  async getComments(featureId) {
    const { data } = await httpClient.get(`/api/v1/features/${featureId}/comments`);
    return data.data;
  },
  async createComment(featureId, payload) {
    const { data } = await httpClient.post(`/api/v1/features/${featureId}/comments`, payload);
    return data.data;
  },
  async replyToComment(commentId, payload) {
    const { data } = await httpClient.post(`/api/v1/comments/${commentId}/reply`, payload);
    return data.data;
  },
  async updateComment(commentId, payload) {
    const { data } = await httpClient.patch(`/api/v1/comments/${commentId}`, payload);
    return data.data;
  },
  async deleteComment(commentId) {
    const { data } = await httpClient.delete(`/api/v1/comments/${commentId}`);
    return data.data;
  },
};
