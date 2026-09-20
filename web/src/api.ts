import { useEffect, useMemo, useState } from "react";
import type {
  Task,
  DerivedTaskState,
  ResolvedTaskState,
} from "../../src/domain/models.js";
import type { SearchItem } from "../../src/search/contracts.js";
export type { Task, SearchItem };
export type TaskSummary = Task & {
  attention: string[];
  lastActivityAt: string | null;
};
export const attentionLabel = (code: string) =>
  ({
    OBJECTIVE_UNKNOWN: "Objective unknown",
    MULTIPLE_SESSION_OBJECTIVES: "Multiple source objectives",
    COMMAND_FAILED: "Observed command failure",
    COMMAND_RESULT_UNKNOWN: "Command result unknown",
    COMMAND_CONTEXT_UNKNOWN: "Command context unknown",
    COMMAND_IDENTITY_INCOMPLETE: "Incomplete command identity",
    HISTORICAL_VALIDITY_UNKNOWN: "Historical result needs verification",
    EVIDENCE_TIME_UNKNOWN: "Evidence time unknown",
    ACTIVITY_AFTER_COMPLETION: "New activity after completion",
  })[code] ?? "Review source evidence";
export interface Project {
  id: string;
  name: string;
}
export interface Workspace {
  id: string;
  projectId: string;
  canonicalRoot: string;
}
export interface Source {
  id: string;
  agent: "claude" | "codex";
  roots: string[];
  enabled: boolean;
}
export interface SessionSummary {
  id: string;
  agent: "claude" | "codex" | null;
  projectId: string | null;
  workspaceId: string | null;
  title: string;
  lastEventAt: string | null;
  status: string;
}
export interface TaskDetail {
  task: Task;
  sessionIds: string[];
  sessions: (SessionSummary & { nativeSessionAvailable: boolean })[];
  files: {
    items: { eventId: string; sessionId: string; path: string }[];
    hasMore: boolean;
  };
  derived: DerivedTaskState;
  resolved: ResolvedTaskState;
}
export interface ControlState {
  sessions: Record<string, { runState: string; health: string; lastEvidenceId: string | null; lastOccurredAt: string | null }>;
  lineage: { id: string; parentSessionId: string; childSessionId: string; relation: string; status: string; evidenceLevel: string }[];
  responsibilities: { id: string; taskId: string; status: string; roles: Record<string, string>; evidenceIds: string[] }[];
  receipts: Record<string, { status: string; stage: string; targetSessionId: string; targetRunId: string }>;
  attention: { id: string; kind: string; severity: string; message: string; status: string }[];
}
export interface Envelope<T> {
  data: T;
}
export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}
export type RecoveryAction =
  | "reconnect"
  | "retry"
  | "refresh"
  | "edit-and-save"
  | "review-path"
  | "export-only"
  | "none";
const messages: Record<string, string> = {
  NETWORK_ERROR:
    "The local service is unavailable. Check your terminal and try again.",
  UNAUTHORIZED: "Reopen the current terminal link to reconnect.",
  NEXT_ACTION_REVIEW_REQUIRED: "Edit the next action and confirm a portable command or relative path. Redacted placeholders cannot be executed.",
  ASSERTION_CONFLICT: "Resolve conflicting decisions or unknown applicability in Decisions and constraints before continuing.",
  INVALID_INPUT: "Check the fields and try again.",
  CONTEXT_BUDGET_EXCEEDED:
    "Required context exceeds the preview limit. Narrow the task scope while retaining its constraints.",
  PROJECT_MISMATCH:
    "This item belongs to another project. Choose its project or a different item.",
  REVISION_CONFLICT: "This item changed. Refresh before trying again.",
  SEARCH_STALE: "The results changed. Reset pagination to continue.",
  REDACTION_REQUIRED: "Review and remove credentials before saving.",
  NOT_FOUND: "This item is no longer available. Refresh the list.",
  IO_FAILED:
    "The directory or local data could not be read. Check its path and permissions.",
  STORAGE_BUSY: "Another operation is writing local data. Try again shortly.",
};
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status = 0,
    readonly retryable = false,
    readonly recovery: RecoveryAction = recoveryFor(code),
    message?: string,
  ) {
    super(messages[code] ?? message ?? "The operation could not be completed. Try again.");
    this.name = "ApiError";
  }
}
function recoveryFor(code: string): RecoveryAction {
  if (code === "NETWORK_ERROR" || code === "UNAUTHORIZED" || code === "UNAVAILABLE") return "reconnect";
  if (code === "STORAGE_BUSY" || code === "SEARCH_STALE") return "retry";
  if (code === "REVISION_CONFLICT" || code === "NOT_FOUND") return "refresh";
  if (code === "REDACTION_REQUIRED" || code === "IO_FAILED") return "review-path";
  if (code === "CONTEXT_BUDGET_EXCEEDED" || code === "ASSERTION_CONFLICT" || code === "NEXT_ACTION_REVIEW_REQUIRED") return "edit-and-save";
  if (code === "TARGET_UNSUPPORTED") return "export-only";
  return "none";
}
function retryableFor(code: string, value?: unknown): boolean {
  return typeof value === "boolean"
    ? value
    : code === "NETWORK_ERROR" || code === "STORAGE_BUSY" || code === "SEARCH_STALE";
}
export interface ApiClient {
  onExpired?: () => void;
  exportText(id: string, format: "json" | "markdown"): Promise<string>;
  request<T>(
    path: string,
    method?: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T>;
}
function createApi(token: string): ApiClient {
  async function responseError(response: Response): Promise<ApiError> {
    let value: { error?: { code?: unknown; message?: unknown; retryable?: unknown; recovery?: unknown } } | undefined;
    try { value = await response.json(); } catch { /* Safe fallback. */ }
    const code = typeof value?.error?.code === "string"
      ? value.error.code
      : response.status === 401 ? "UNAUTHORIZED" : response.status === 503 ? "STORAGE_BUSY" : "REQUEST_FAILED";
    if (response.status === 401) api.onExpired?.();
    const retryable = retryableFor(code, value?.error?.retryable);
    const recoveryActions: readonly string[] = ["reconnect", "retry", "refresh", "edit-and-save", "review-path", "export-only", "none"];
    const recovery = typeof value?.error?.recovery === "string" && recoveryActions.includes(value.error.recovery)
      ? value.error.recovery as RecoveryAction
      : recoveryFor(code);
    const message = typeof value?.error?.message === "string" ? value.error.message : undefined;
    return new ApiError(code, response.status, retryable, recovery, message);
  }
  const api: ApiClient = {
    async exportText(id, format) {
      let response: Response;
      try {
        response = await fetch(
          "/api/v1/handoffs/" + encodeURIComponent(id) + "/export",
          {
            method: "POST",
            headers: {
              authorization: "Bearer " + token,
              "content-type": "application/json",
            },
            body: JSON.stringify({ format }),
            cache: "no-store",
          },
        );
      } catch {
        throw new ApiError("NETWORK_ERROR");
      }
      if (!response.ok) {
        throw await responseError(response);
      }
      return response.text();
    },
    async request<T>(
      path: string,
      method = "GET",
      body?: unknown,
      signal?: AbortSignal,
    ) {
      let response: Response;
      try {
        response = await fetch("/api/v1" + path, {
          method,
          headers: {
            authorization: "Bearer " + token,
            ...(method === "GET" ? {} : { "content-type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal,
          cache: "no-store",
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new ApiError("NETWORK_ERROR");
      }
      if (!response.ok) {
        throw await responseError(response);
      }
      return response.json() as Promise<T>;
    },
  };
  return api;
}
export function initialClient(): ApiClient | null {
  const tokens = new URLSearchParams(location.hash.slice(1)).getAll("token");
  history.replaceState(null, "", location.pathname + location.search);
  return tokens.length === 1 && /^[a-f0-9]{64}$/.test(tokens[0])
    ? createApi(tokens[0])
    : null;
}
export function reconnectClient(link: string): ApiClient | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new Error(
      "Paste the complete link from your running ThreadPort terminal.",
    );
  }
  const tokens = new URLSearchParams(url.hash.slice(1)).getAll("token");
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    tokens.length !== 1 ||
    !/^[a-f0-9]{64}$/.test(tokens[0])
  )
    throw new Error("Use a valid local ThreadPort terminal link.");
  if (url.origin !== location.origin) {
    url.search = location.search;
    location.assign(url.href);
    return null;
  }
  return createApi(tokens[0]);
}
export function query(
  values: Record<string, string | number | boolean | undefined | null>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  return params.toString();
}
export function useLoad<T>(api: ApiClient, path: string, revision = 0) {
  const [tick, setTick] = useState(0);
  const key = useMemo(
    () => ({ api, path, revision, tick }),
    [api, path, revision, tick],
  );
  const [state, setState] = useState<{
    key: typeof key;
    data?: T;
    error?: Error;
    loading: boolean;
  }>({ key, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({
      key,
      // Keep the last successful projection while credentials reconnect. This
      // preserves open editors and their drafts across an ApiClient swap.
      data: previous.key.path === path ? previous.data : undefined,
      loading: true,
    }));
    api
      .request<T>(path, "GET", undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, data, loading: false });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ key, error, loading: false });
      });
    return () => controller.abort();
  }, [key]);
  // Invalidate controls during render, before the request effect can run.
  const current =
    state.key === key
      ? state
      : {
          key,
          data: state.key.path === path ? state.data : undefined,
          loading: true,
        };
  return { ...current, reload: () => setTick((value) => value + 1) };
}
export function usePage<T>(api: ApiClient, path: string, revision = 0) {
  const [position, setPosition] = useState({
    key: path,
    revision,
    cursors: [null] as (string | null)[],
    index: 0,
  });
  const current =
    position.key === path && position.revision === revision
      ? position
      : { key: path, revision, cursors: [null], index: 0 };
  const cursor = current.cursors[current.index];
  const load = useLoad<Page<T>>(
    api,
    cursor
      ? (() => {
          const [base, raw] = path.split("?");
          const params = new URLSearchParams(raw);
          params.delete("eventId");
          params.set("cursor", cursor);
          return base + "?" + params;
        })()
      : path,
    revision,
  );
  return {
    ...load,
    page: current.index + 1,
    previous: () =>
      setPosition({ ...current, index: Math.max(0, current.index - 1) }),
    next: () => {
      if (load.data?.nextCursor)
        setPosition({
          ...current,
          cursors: [
            ...current.cursors.slice(0, current.index + 1),
            load.data.nextCursor,
          ],
          index: current.index + 1,
        });
    },
    reset: () => {
      setPosition({ key: path, revision, cursors: [null], index: 0 });
      load.reload();
    },
  };
}
export const dateLabel = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Time unknown";
