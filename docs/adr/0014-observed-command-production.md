# ADR 0014: Produce evidence at the process boundary

Date: 2026-09-16. Report item R06.

ThreadPort can observe the target process it launches after the existing exact-plan terminal confirmation. It cannot see the target Agent's internal shell commands, tests or environment changes. The first production integration therefore records the outer process only and explicitly identifies it as a ThreadPort launch. Imported native command events keep their missing bindings; no historical evidence is reconstructed.

A `threadport.execution-observation.v1` record binds the immutable approved argv/cwd and executable identity to the launch attempt, task, selected session, pre-execution snapshot, observed spawn time, exit state, post-execution snapshot, and a narrowly declared environment observation. Before/after environment metadata contains Node observer version, OS/architecture and digests of a fixed allowlist of inherited environment keys; it is not a certificate of all external configuration. Test counts and test scope stay null because the outer process cannot establish them.

The existing workspace reservation and unknown recovery remain authoritative. Evidence is started only after claim, marked spawned at the actual process callback, and completed after the process result. Post-capture failures keep evidence incomplete rather than turning a command success into a test failure. A crash can leave a running record with no result; it remains unverified. The exact launch plan was already persisted before claim; the observation stores its identity and accesses its argv from that immutable record, avoiding another private prompt copy.

Preparation includes these observations as explicitly labeled process evidence alongside native events. Every observation contributes to aggregate warnings even when excerpts are omitted. The pre-execution snapshot enables later stale detection; differences between pre/post snapshots or environment digests invalidate any inference that an exit result applies to a stable workspace. Missing completion or spawn evidence remains unverified. No `current` result is introduced. Values that were never observed, including test counts, remain null.

The storage extension is additive (schema 7). Completed observation records are immutable; at most 1,000 observations per task are accepted, checked before claim and rechecked transactionally before start. `inspect-run` shows the observation and integrity-checked approved plan when it is still retained. Referenced pre/post snapshots survive normal retention. Observation records are app-owned metadata, retained while their task exists and included in explicit full data deletion. Native source revocation must not rewrite observations; unavailable approved-plan details are reported unavailable. The private exact argv remain subject to existing handoff payload retention, so a retained observation cannot promise indefinite recovery of old argv.

This integration closes a real observed-process path, not inner-Agent test instrumentation. A future user-triggered check runner or vendor hook needs its own explicit execution and environment scope; it must not parse shell prose into invented argv. Tests use an actual Node child process through the same launch gateway and verify capture → persistence → workspace modification → stale preparation.

## Inner-Agent evidence boundary

The outer observation above remains unchanged. A separate `threadport.inner-agent-observation.v1` record is accepted only from a structured Agent hook or an explicitly selected structured export. It carries the source protocol and version, source event ID, command/test kind and status, optional numeric exit code, before/after workspace snapshot IDs, and an explicit environment scope and digest. The corresponding `threadport.inner-agent-evidence.v1` envelope is kept separate from the outer observation so a target-process exit cannot be presented as an Agent command or test result.

No structured result produces an explicit `unverified` record. Pending tools, interrupted calls, incomplete logs, missing completion, or an unknown status remain `unverified`; assistant prose, turn-ended markers, and exit-looking text are never parsed into an inner result. A complete structured result whose bound pre-execution snapshot still matches the reviewed workspace is `current`; a changed workspace is `stale`. Missing or unverifiable snapshot/environment bindings are `unknown`. In particular, a native import without a historical pre-execution snapshot is `unknown`; the current workspace is never substituted for that missing history.

### Inner-Agent association and workspace binding

The structured inner result is associated with the outer event by the caller-supplied `eventId` and `kind`. The evaluator checks both fields before any result is classified. `EVENT_MISMATCH` and `KIND_MISMATCH` are stable reasons and force `unverified` evidence; the result is never attached to a different event or kind.

An event ID is accepted at most once for a preparation request. Duplicate inputs collapse to one `unverified` envelope with `DUPLICATE_EVENT`; no first-wins or last-wins policy can silently select an arbitrary vendor result. The warning counts the resulting event map, so duplicate payloads cannot inflate evidence totals.

Every referenced before and after snapshot must be readable and belong to the reviewed workspace identity (`workspaceId`). A foreign or internally inconsistent pair receives `SNAPSHOT_WORKSPACE_MISMATCH` and remains `unknown`; missing or unreadable history receives `SNAPSHOT_MISSING` or `SNAPSHOT_UNVERIFIABLE`. The current snapshot is never substituted for missing history, and a foreign snapshot is never treated as ordinary workspace drift.
