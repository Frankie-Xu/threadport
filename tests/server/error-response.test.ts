import { describe, expect, it } from "vitest";
import { classifyError, errorBody } from "../../src/server/error-response.js";

describe("API error recovery contract", () => {
  it.each([
    ["NETWORK_ERROR", true, "reconnect"],
    ["STORAGE_BUSY", true, "retry"],
    ["SEARCH_STALE", true, "retry"],
    ["REVISION_CONFLICT", true, "refresh"],
    ["REDACTION_REQUIRED", false, "review-path"],
    ["TARGET_UNSUPPORTED", false, "export-only"],
    ["INVALID_INPUT", false, "none"],
  ] as const)("classifies %s as %s/%s", (code, retryable, recovery) => {
    expect(classifyError(code, retryable)).toEqual({ retryable, recovery });
  });

  it("preserves a stable code while adding recovery metadata", () => {
    expect(errorBody("STORAGE_BUSY", "Try again later.")).toEqual({
      code: "STORAGE_BUSY",
      message: "Try again later.",
      retryable: true,
      recovery: "retry",
    });
  });
});
