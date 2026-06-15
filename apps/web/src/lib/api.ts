import axios, {
  type AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";

type RetriableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };
type PendingQueueItem = {
  resolve: () => void;
  reject: (error: unknown) => void;
};

const api = axios.create({
  // Use /api via Next.js rewrites proxy (same-origin) so httpOnly cookies work correctly
  // In dev: Next.js proxies /api/* → http://localhost:3001/api/*
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  // Same-origin: credentials/cookies are always sent automatically
  withCredentials: true,
});

// ── Auto-refresh logic ──────────────────────────────────────────
// When the access token expires (401), we attempt one silent refresh using
// the refresh_token cookie, then retry the original request.
// Multiple concurrent 401s are queued and resolved together.

let isRefreshing = false;
let pendingQueue: PendingQueueItem[] = [];

function flushQueue(error: unknown) {
  pendingQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve()
  );
  pendingQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as RetriableRequestConfig | undefined;

    if (err.response?.status === 401 && original && !original._retry) {
      // Auth endpoint failures should surface to the caller instead of
      // redirecting the user back to the same page.
      if (
        original.url?.includes("/auth/refresh") ||
        original.url?.includes("/auth/login")
      ) {
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
export const getData = <T>(res: AxiosResponse<unknown>): T => {
  const outer = res.data; // { success, data: ... }
  if (outer && typeof outer === "object" && "data" in outer) {
    const inner = outer.data; // { data: [], meta: {} } or [] or object
    if (inner !== undefined) {
      if (
        inner &&
        typeof inner === "object" &&
        "data" in inner &&
        Array.isArray(inner.data)
      ) {
        return inner as T;
      }
      return inner as T;
    }
  }
  return outer as T;
};
