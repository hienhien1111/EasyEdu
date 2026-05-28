import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api",
  headers: { "Content-Type": "application/json" },
  // Send httpOnly cookies automatically on every request
  withCredentials: true,
});

// ── Auto-refresh logic ──────────────────────────────────────────
// When the access token expires (401), we attempt one silent refresh using
// the refresh_token cookie, then retry the original request.
// Multiple concurrent 401s are queued and resolved together.

let isRefreshing = false;
let pendingQueue: Array<{ resolve: () => void; reject: (e: any) => void }> = [];

function flushQueue(error: any) {
  pendingQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve()
  );
  pendingQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    if (err.response?.status === 401 && !original._retry) {
      // Don't attempt refresh for auth endpoints themselves
      if (
        original.url?.includes("/auth/refresh") ||
        original.url?.includes("/auth/login")
      ) {
        if (typeof window !== "undefined") window.location.href = "/login";
        return Promise.reject(err);
      }

      // Queue concurrent 401s while a refresh is in progress
      if (isRefreshing) {
        return new Promise<void>((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        }).then(() => api(original));
      }

      original._retry = true;
      isRefreshing = true;

      try {
        // Refresh token cookie is sent automatically (withCredentials: true)
        await api.post("/auth/refresh");
        flushQueue(null);
        return api(original);
      } catch (refreshErr) {
        flushQueue(refreshErr);
        if (typeof window !== "undefined") window.location.href = "/login";
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(err);
  }
);

export default api;

// Helper: extract data from API response wrapper
// Backend wraps responses as: { success, data: { data: [...], meta: {} } } (paginated)
// or: { success, data: { ... } } (single object/array)
export const getData = <T>(res: any): T => {
  const outer = res.data; // { success, data: ... }
  const inner = outer?.data; // { data: [], meta: {} } or [] or object
  if (inner !== undefined) {
    if (inner && typeof inner === "object" && Array.isArray(inner.data))
      return inner as T;
    return inner as T;
  }
  return outer as T;
};
