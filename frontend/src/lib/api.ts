// Typed client for the GPU Architecture Studio backend — the live integration
// seam to docs/API_FOR_FRONTEND.md. The UI is wired to these calls (manual run,
// autonomous explore, history, deep-dive details), with mock fallback when the
// backend is unreachable. Base URL is configurable via VITE_API_URL and
// defaults to the backend's documented address (http://localhost:8000).

import type {
  Container,
  Experiment,
  GPUConfig,
  SimReport,
  RunStreamEvent,
  ExploreStreamEvent,
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

export interface ExploreRequest {
  goal: string;
  benchmark?: string;
  constraints?: Record<string, unknown>;
  max_iterations?: number;
  start_config?: GPUConfig;
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

  /** Start an autonomous exploration session. Returns { session_id }. */
  explore: (body: ExploreRequest) =>
    postJson<{ session_id: string }>("/explore", body),

  /**
   * Subscribe to an exploration session's SSE stream. Events:
   * iteration_start · experiment · analysis · recall · proposal · converged ·
   * note · error. Auto-closes on `converged` or connection end (prevents the
   * EventSource auto-reconnect from replaying a finished session).
   */
  streamExplore(
    sessionId: string,
    onEvent: (e: ExploreStreamEvent) => void,
    onClose?: () => void
  ): StreamHandle {
    const es = new EventSource(`${BASE_URL}/explore/${sessionId}/stream`);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      es.close();
      onClose?.();
    };
    es.onmessage = (ev) => {
      let parsed: ExploreStreamEvent;
      try {
        parsed = JSON.parse(ev.data) as ExploreStreamEvent;
      } catch {
        return;
      }
      onEvent(parsed);
      if (parsed.type === "converged") close();
    };
    es.onerror = () => close();
    return { cancel: close };
  },
};

export { BASE_URL };
