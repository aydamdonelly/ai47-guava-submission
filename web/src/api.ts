import type { DashboardData, IntakeStatus, NoteStatus, PublicConfig } from "./types";

function loadDemoToken() {
  const url = new URL(window.location.href);
  const tokenFromUrl = url.searchParams.get("token");
  if (tokenFromUrl) {
    window.sessionStorage.setItem("caresignal-demo-token", tokenFromUrl);
    url.searchParams.delete("token");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return window.sessionStorage.getItem("caresignal-demo-token");
}

const demoToken = loadDemoToken();

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(demoToken ? { "X-CareSignal-Token": demoToken } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new ApiError(message || `Request failed (${response.status})`, response.status);
  }

  return response.json() as Promise<T>;
}

export const api = {
  dashboard: () => request<DashboardData>("/api/dashboard"),
  config: () => request<PublicConfig>("/api/config"),
  seedDemo: () => request<DashboardData>("/api/demo/seed?reset=false", { method: "POST" }),
  updateIntake: (id: string, status: IntakeStatus) =>
    request<DashboardData>(`/api/intakes/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  updateNote: (id: string, status: NoteStatus) =>
    request<DashboardData>(`/api/notes/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};
