import { httpClient } from "./httpClient";

export const dashboardService = {
  async getUserDashboard() {
    const { data } = await httpClient.get("/api/v1/user/dashboard");
    return data.data; // { message: "Welcome to your dashboard." }
  },
  async getAdminDashboard() {
    const { data } = await httpClient.get("/api/v1/admin/dashboard");
    return data.data; // { message: "Welcome Admin." }
  },
};
