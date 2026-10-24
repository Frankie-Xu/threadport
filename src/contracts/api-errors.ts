/** Recovery actions exposed by the local HTTP API. */
export type ApiRecovery =
  | "reconnect"
  | "retry"
  | "refresh"
  | "edit-and-save"
  | "review-path"
  | "export-only"
  | "none";

export interface ApiErrorBody {
  code: string;
  message: string;
  retryable: boolean;
  recovery: ApiRecovery;
}

/**
 * Keep error codes stable while giving every caller the same next action.
 * Unknown codes deliberately fall back to a non-destructive response.
 */
export function classifyError(code: string, retryable = false): Pick<ApiErrorBody, "retryable" | "recovery"> {
  switch (code) {
    case "NETWORK_ERROR":
      return { retryable: true, recovery: "reconnect" };
    case "UNAUTHORIZED":
    case "UNAVAILABLE":
      return { retryable: false, recovery: "reconnect" };
    case "STORAGE_BUSY":
    case "SEARCH_STALE":
      return { retryable: true, recovery: "retry" };
    case "REVISION_CONFLICT":
      return { retryable, recovery: "refresh" };
    case "NOT_FOUND":
      return { retryable: false, recovery: "refresh" };
    case "REDACTION_REQUIRED":
    case "IO_FAILED":
    case "MIGRATION_FAILED":
      return { retryable, recovery: "review-path" };
    case "CONTEXT_BUDGET_EXCEEDED":
    case "ASSERTION_CONFLICT":
    case "NEXT_ACTION_REVIEW_REQUIRED":
      return { retryable: false, recovery: "edit-and-save" };
    case "TARGET_UNSUPPORTED":
      return { retryable: false, recovery: "export-only" };
    case "INVALID_INPUT":
    case "BODY_TOO_LARGE":
    case "PROJECT_MISMATCH":
    case "INDEX_STALE":
    case "INDEX_LIMIT":
    case "WORKSPACE_BUSY":
    case "LAUNCH_STATE_UNKNOWN":
    case "TARGET_EXITED":
    case "FORBIDDEN":
      return { retryable, recovery: "none" };
    default:
      return { retryable, recovery: "none" };
  }
}

export function errorBody(
  code: string,
  message: string,
  retryable = false,
): ApiErrorBody {
  return { code, message, ...classifyError(code, retryable) };
}
