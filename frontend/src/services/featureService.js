import { httpClient } from "./httpClient";

function buildFeedParams({ page, limit, category, status, sort, search } = {}) {
  const params = new URLSearchParams();
  if (page != null) params.set("page", page);
  if (limit != null) params.set("limit", limit);
  (category ?? []).forEach((value) => params.append("category", value));
  (status ?? []).forEach((value) => params.append("status", value));
  if (sort) params.set("sort", sort);
  if (search) params.set("search", search);
  return params;
}

export const featureService = {
  async getFeatures(params) {
    const { data } = await httpClient.get(`/api/v1/features?${buildFeedParams(params)}`);
    return data.data; // PaginatedFeatureResponse
  },
  async getFeature(featureId) {
    const { data } = await httpClient.get(`/api/v1/features/${featureId}`);
    return data.data; // FeatureResponse
  },
  async createFeature(payload) {
    const { data } = await httpClient.post("/api/v1/features", payload);
    return data.data;
  },
  async updateFeature(featureId, payload) {
    const { data } = await httpClient.patch(`/api/v1/features/${featureId}`, payload);
    return data.data;
  },
  async deleteFeature(featureId) {
    const { data } = await httpClient.delete(`/api/v1/features/${featureId}`);
    return data.data;
  },
};

export { buildFeedParams };
