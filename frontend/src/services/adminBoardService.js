import { httpClient } from "./httpClient";

export async function getBoard() {
  const { data } = await httpClient.get("/api/v1/admin/features/board");
  return data.data; // BoardResponse shape
}

export async function updateStatus(featureId, status) {
  const { data } = await httpClient.patch(
    `/api/v1/admin/features/${featureId}/status`,
    { status }
  );
  return data.data; // FeatureResponse shape
}

export async function getAnalytics() {
  const { data } = await httpClient.get("/api/v1/admin/analytics");
  return data.data;
}

export async function getAuditLogs({ page = 1, limit = 20, action = "" } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (action) params.set("action", action);
  const { data } = await httpClient.get(`/api/v1/admin/audit?${params}`);
  return data.data;
}

export async function pinFeature(featureId, pinned) {
  const { data } = await httpClient.patch(
    `/api/v1/admin/features/${featureId}/pin`,
    { pinned }
  );
  return data.data;
}

export async function archiveFeature(featureId, archived) {
  const { data } = await httpClient.patch(
    `/api/v1/admin/features/${featureId}/archive`,
    { archived }
  );
  return data.data;
}

export async function adminDeleteFeature(featureId) {
  const { data } = await httpClient.delete(
    `/api/v1/admin/features/${featureId}`
  );
  return data.data;
}
