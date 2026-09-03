const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const TOKEN_KEY = "stockroom-token";

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable - session lives in memory only */
  }
}

export function clearSession() {
  setToken(null);
  window.dispatchEvent(new CustomEvent("stockroom:unauthorized"));
}

/**
 * Single place that talks to the backend: base URL, JSON headers, JWT header,
 * consistent error handling, and unwrapping of the { success, data } envelope.
 */
export async function request(
  path,
  { method = "GET", body, params, auth = true } = {},
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
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
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

  if (response.status === 401 && auth) clearSession();

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
