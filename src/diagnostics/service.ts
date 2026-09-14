import { platform, arch } from "node:os";
import { APP_VERSION } from "../version.js";
import type { SqliteStore } from "../storage/sqlite-store.js";
/** Deliberately construct an allowlist; never serialize settings, source metadata, env or logs. */
export function diagnostics(store: SqliteStore) {
  const counts = store.statusCounts();
  return {
    protocol: "threadport.diagnostics.v1",
    version: APP_VERSION,
    os: platform(),
    arch: arch(),
    capturedAt: new Date().toISOString(),
    counts: {
      sources: counts.sources,
      sessions: counts.sessions,
      events: counts.events,
      tasks: counts.tasks,
    },
    capacity: {
      indexedBytes: counts.indexedBytes,
      eventLimit: 100000,
      byteLimit: 1024 ** 3,
    },
    supportedParserVersions: ["claude-jsonl-v1", "codex-jsonl-v1"],
    errors: store.apiStore().diagnosticErrors(),
  };
}
