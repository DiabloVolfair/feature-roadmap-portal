import axios from "axios";

export const httpClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 5000,
  withCredentials: true, // send/receive the Refresh_Token_Cookie automatically (Req 19.8, 20.6)
});

let getAccessToken = () => null;
let setAccessToken = () => {};
let onAuthFailure = () => {};

/** Lets AuthContext expose a synchronous read into its own in-memory token
 *  without httpClient storing a second copy of the token itself. */
export function registerAccessTokenGetter(getter) {
  getAccessToken = getter;
}

/** Lets AuthContext receive a freshly-issued access token whenever the
 *  response interceptor below silently refreshes one on a 401. */
export function registerAccessTokenSetter(setter) {
  setAccessToken = setter;
}

/** Lets AuthContext know a refresh attempt failed outright (refresh token
 *  invalid/expired), so it can clear the session and navigate to /login. */
export function registerAuthFailureHandler(handler) {
  onAuthFailure = handler;
}

httpClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth-flow endpoints don't carry/need an access token, so a 401 from any of
// these is a real auth failure (e.g. bad credentials, expired refresh token)
// rather than an expired-access-token case - they must never trigger the
// refresh-and-retry flow below.
const AUTH_FLOW_URLS = [
  "/api/v1/auth/login",
  "/api/v1/auth/signup",
  "/api/v1/auth/refresh",
  "/api/v1/auth/logout",
];

function isAuthFlowRequest(config) {
  const url = config?.url ?? "";
  return AUTH_FLOW_URLS.some((authUrl) => url.includes(authUrl));
}

// Coalesces concurrent 401s into a single in-flight refresh call. This
// matters because the backend rotates the refresh token on every call to
// /api/v1/auth/refresh and invalidates the previous one - if two requests
// each triggered their own independent refresh call concurrently, the
// second rotation would invalidate the first, breaking one of the retries.
let refreshPromise = null;

function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = httpClient
      .post("/api/v1/auth/refresh")
      .then((response) => response.data.data.access_token)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;

    if (
      response?.status !== 401 ||
      !config ||
      isAuthFlowRequest(config) ||
      config._retriedAfterRefresh
    ) {
      return Promise.reject(error);
    }

    config._retriedAfterRefresh = true;

    try {
      const newToken = await refreshAccessToken();
      setAccessToken(newToken);
      // The request interceptor reattaches the fresh token automatically
      // since the getter now returns the updated value.
      return httpClient(config);
    } catch (refreshError) {
      // Fire-and-forget: don't let the auth-failure handler block rejection.
      Promise.resolve(onAuthFailure()).catch(() => {});
      return Promise.reject(refreshError);
    }
  }
);
