import { httpClient } from "./httpClient";

export const authService = {
  async signup(name, email, password) {
    const { data } = await httpClient.post("/api/v1/auth/signup", { name, email, password });
    return data.data; // UserResponse
  },
  async login(email, password) {
    const { data } = await httpClient.post("/api/v1/auth/login", { email, password });
    return data.data.access_token;
  },
  async logout() {
    await httpClient.post("/api/v1/auth/logout");
  },
  async refresh() {
    const { data } = await httpClient.post("/api/v1/auth/refresh");
    return data.data.access_token;
  },
  async getCurrentUser() {
    const { data } = await httpClient.get("/api/v1/auth/me");
    return data.data; // UserResponse
  },
  async sendVerification() {
    const { data } = await httpClient.post("/api/v1/auth/send-verification");
    return data.data;
  },
  async verifyEmail(token) {
    const { data } = await httpClient.post("/api/v1/auth/verify-email", { token });
    return data;
  },
  async forgotPassword(email) {
    const { data } = await httpClient.post("/api/v1/auth/forgot-password", { email });
    return data;
  },
  async resetPassword(token, newPassword) {
    const { data } = await httpClient.post("/api/v1/auth/reset-password", {
      token,
      new_password: newPassword,
    });
    return data;
  },
};
