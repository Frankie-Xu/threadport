# Changelog

## 0.3.0-dev.0 — 2026-09-22

This prerelease closes the v0.3 Observe slice for the control plane.

- Rejects agent-reported or direct `verified-complete` receipt claims without independent evidence.
- Requires every persisted receipt to match a prepared manifest digest and explicit session/run target.
- Keeps unbound or forged receipt confirmations `unknown` and raises a visible verification attention item.
- Includes persisted manifest receipts in the task control projection and labels receipt facts in the task detail UI.
- Adds a read endpoint for live takeover records while retaining explicit `stop-unavailable` semantics.
- Documents source coverage gaps, unsupported cross-agent authentication/continuation, and in-memory takeover limitations.

This is an Observe prerelease. It does not claim cross-agent authentication, native continuation success, automatic parent/child repair, or durable takeover recovery across service restart.
