const BASE = "/api/backend";

export class ApiError extends Error {
  status: number;
  /** Raw `error` field from the backend's JSON body, e.g. "invalid_or_expired_token". */
  code?: string;
  /** Optional human-readable `detail` field some routes include (e.g. rate limiting). */
  detail?: string;

  constructor(status: number, message: string, code?: string, detail?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("sitepulse_token");
}

export function setToken(token: string) {
  window.localStorage.setItem("sitepulse_token", token);
}

export function clearToken() {
  window.localStorage.removeItem("sitepulse_token");
}

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE" | "PATCH";
  body?: unknown;
  query?: Record<string, string | undefined>;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query } = options;

  const qs = query
    ? "?" +
      new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined) as [string, string][]
      ).toString()
    : "";

  const token = getToken();

  const res = await fetch(`${BASE}${path}${qs}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    let detail: string | undefined;
    try {
      const data = await res.json();
      code = data.error;
      detail = data.detail;
      message = data.error ?? message;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new ApiError(res.status, message, code, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
