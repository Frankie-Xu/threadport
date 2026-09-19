# Recovery and compatibility coverage (2026-09-19)

This pass adds repeatable tests for recovery behavior that can be exercised on a local filesystem:

- An incomplete JSONL record is completed after a process/database reopen. The index resumes from its persisted cursor, does not duplicate previously imported events, and preserves a manually edited task and its revision history.
- A failed task revision append is rolled back atomically. After the injected failure is removed, the same edit can be written successfully after reopening the database.
- The documented TypeScript entry point and the `threadport.handoff.v1` CLI JSON output remain consumable through public parsers and factories.

Existing coverage also exercises source truncation/replacement, duplicate refreshes, cancellation and resume, SQL batch rollback, publication failures, and storage lock timeout behavior.

The suite does not claim to simulate a physical disk-full condition, sudden power loss, or a real operating-system process kill. Those require platform or CI jobs and remain separate validation items.
