# ADR 0011: Reserve workspaces and preserve unknown runs

Date: 2026-09-16. Report item: R03. Storage schema: 5.

The same SQLite immediate transaction consumes the exact terminal plan and creates a run reservation by canonical workspace root. Every other handoff for that root is refused until an observed target outcome or explicit recovery releases the reservation. Different workspaces can run independently. This coordinates processes sharing one ThreadPort data directory; separate data directories do not share locks and concurrent use of the same workspace through multiple stores is unsupported. External editors and Agents remain outside this coordination.

Reservations record the approval nonce, observer identity and, after the OS spawn event, target identity. Linux records boot ID plus process start ticks; macOS records boot time plus process start time (second resolution); the current observer also has a random process-instance token. Unsupported or unreadable identity observations remain unavailable. PID reuse or a missing observer causes unknown and retains occupancy. macOS's limited timestamp resolution can retain an ambiguous reservation, never automatically release it. No probe kills a process.

The gap between reservation, spawn and target-identity persistence cannot be made atomic with SQLite. Exceptions after a possible spawn and persistence failures yield unknown. The system never automatically retries. Only an observed process exit releases normally; this observes the launched process, not every possible descendant.

`inspect-run --handoff <uuid>` exposes the recorded identities and observations. `recover-run --handoff <uuid>` requires a TTY, shows the exact reservation, and requires `RELEASE <nonce>` after the operator has checked the target stopped. A still-observed matching owner or target blocks recovery. Unavailable observations are not proof of exit; explicit operator attestation is recorded alongside evidence. Recovery frees the reservation but does not reuse the consumed handoff or rewrite its unknown outcome as success.

Unknown handoffs cannot be pruned, cleared or deleted through application maintenance. Once explicitly recovered, normal retention can remove expired attempts and their recovery history. An explicit complete data deletion still removes application-owned personal data after active/unknown runs are resolved.

Migration 005 is additive and runs after a consistent backup. Existing launching attempts become unknown reservations, including multiple overlapping legacy attempts. All must be resolved before that workspace is reused. Old schema-4 binaries reject the newer database; rollback is a forward fix or a separately reviewed backup restoration, not a schema-number edit. Migration-failure tests preserve pre-migration data and restore the backup to a new directory.
