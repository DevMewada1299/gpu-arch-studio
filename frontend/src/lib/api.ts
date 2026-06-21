// Typed client for the GPU Architecture Studio backend.
//
// This is the integration seam to docs/API_FOR_FRONTEND.md. It is fully typed
// and ready to use; live wiring of the UI to these calls is a later step (the
// app currently renders from mocks). Base URL is configurable via VITE_API_URL
// and defaults to the backend's documented address.

import type {
  Container,
  Experiment,
  GPUConfig,
  SimReport,
  RunStreamEvent,
} from "../types";

const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new ApiError(res.status, `GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, `POST ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export interface HealthResponse {
  ok: boolean;
  benchmarks: string[];
}

export interface RunRequest {
  config: GPUConfig;
  benchmark: string;
  container_id?: string;
}

export interface StreamHandle {
  cancel: () => void;
}

export const api = {
  health: () => getJson<HealthResponse>("/health"),

  containers: () => getJson<Container[]>("/containers"),

  history: () => getJson<Experiment[]>("/experiments/history"),

  experiment: (id: string) => getJson<Experiment>(`/experiments/${id}`),

  // Rich SimReport for the Nsight-style deep-dive view.
  details: (id: string) => getJson<SimReport>(`/experiments/${id}/details`),

  run: (req: RunRequest) => postJson<{ exp_id: string }>("/experiments/run", req),

  /**
   * Subscribe to a run's SSE stream. Mirrors the backend events:
   * { type:"output", line } · { type:"complete", ... } · { type:"error", message }.
   * Returns a handle to close the EventSource (auto-closes on complete/error).
   */
  streamRun(
    expId: string,
    onEvent: (e: RunStreamEvent) => void,
    onClose?: () => void
  ): StreamHandle {
    const es = new EventSource(`${BASE_URL}/experiments/${expId}/stream`);
    const close = () => {
      es.close();
      onClose?.();
    };
    es.onmessage = (ev) => {
      let parsed: RunStreamEvent;
      try {
        parsed = JSON.parse(ev.data) as RunStreamEvent;
      } catch {
        return;
      }
      onEvent(parsed);
      if (parsed.type === "complete" || parsed.type === "error") close();
    };
    es.onerror = () => close();
    return { cancel: close };
  },

  /**
   * Autonomous exploration. Returns 501 until the agent core lands — callers
   * should handle ApiError(501) and fall back to the local mock stream.
   */
  explore: (body: unknown) => postJson<{ session_id: string }>("/explore", body),
};

export { BASE_URL };
