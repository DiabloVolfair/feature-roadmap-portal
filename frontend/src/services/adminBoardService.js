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
