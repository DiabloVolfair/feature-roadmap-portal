import { httpClient } from "./httpClient";

export async function fetchHealth() {
  const { data } = await httpClient.get("/api/v1/health");
  return data;
}

export function mapHealthState({ isLoading, isError, data }) {
  if (isLoading) return "checking";
  if (isError || !data?.success) return "disconnected";
  return "connected";
}
