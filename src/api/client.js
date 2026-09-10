const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== "undefined" && window.location.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:4000/api`;
  }
  return "http://localhost:4000/api";
};

const API_BASE_URL = getApiBaseUrl();
const CSRF_COOKIE = "sr_csrf";

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

/**
 * The session now lives in an httpOnly cookie the browser sends automatically,
 * so there is no token for JS to read or store. The readable `sr_csrf` cookie is
 * echoed back in a header on writes to prove the request came from our app.
 */
function readCookie(name) {
  try {
    return (
      document.cookie
        .split("; ")
        .find((row) => row.startsWith(`${name}=`))
        ?.split("=")[1] ?? null
    );
  } catch {
    return null;
  }
}

export function getCsrfToken() {
  return readCookie(CSRF_COOKIE);
}

export function clearSession() {
  window.dispatchEvent(new CustomEvent("stockroom:unauthorized"));
}

/**
 * Single place that talks to the backend: base URL, JSON headers, the session
 * cookie, CSRF header, consistent error handling, and unwrapping of the
 * { success, data } envelope.
 */
export async function request(
  path,
  { method = "GET", body, params } = {},
) {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "")
        url.searchParams.set(key, value);
    }
  }

  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;
  const headers = isFormData ? {} : { "Content-Type": "application/json" };
  if (method !== "GET" && method !== "HEAD") {
    const csrf = getCsrfToken();
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      credentials: "include",
      body:
        body === undefined
          ? undefined
          : isFormData
            ? body
            : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      `Cannot reach the API at ${API_BASE_URL}. Is the backend running? Start it with "npm run server".`,
      0,
    );
  }

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  // Only treat a 401 as "logged out" when we actually had a session; a fresh
  // visitor probing /auth/me should just land on the sign-in screen quietly.
  if (response.status === 401 && getCsrfToken()) clearSession();

  if (!response.ok || (payload && payload.success === false)) {
    const fallback =
      response.status >= 500
        ? "Server error. Please try again."
        : `Request failed (${response.status}).`;
    throw new ApiError(payload?.message || fallback, response.status, payload);
  }

  // Any successful write may change dashboard notifications - let listeners refetch.
  if (method !== "GET") {
    try {
      window.dispatchEvent(new CustomEvent("stockroom:data-changed"));
    } catch {
      /* no window (non-browser) - nothing to notify */
    }
  }

  return payload ? payload.data : null;
}

export const apiClient = {
  get: (path, options) => request(path, { ...options, method: "GET" }),
  post: (path, body, options) =>
    request(path, { ...options, method: "POST", body }),
  put: (path, body, options) =>
    request(path, { ...options, method: "PUT", body }),
  patch: (path, body, options) =>
    request(path, { ...options, method: "PATCH", body }),
  delete: (path, options) => request(path, { ...options, method: "DELETE" }),
  upload: (path, formData, options) =>
    request(path, { ...options, method: "POST", body: formData }),
};
