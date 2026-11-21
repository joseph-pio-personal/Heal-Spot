const currentHostname = window.location.hostname;
const apiUrl = new URL(
  import.meta.env.VITE_API_BASE_URL
    || `${window.location.protocol}//${currentHostname}:4000`,
);
const localApiHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);
if (localApiHostnames.has(apiUrl.hostname) && apiUrl.hostname !== currentHostname) {
  apiUrl.hostname = currentHostname;
}
export const apiBaseUrl = apiUrl.origin;

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(body.error ?? "Unable to complete the request.");
  return body;
}
