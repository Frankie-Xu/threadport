## Change

Describe the concrete problem, trigger, and resulting behavior.

Issue / local draft:
Task / feature / acceptance / regression IDs:

## Work package → commit → files → tests → rollback

One independently reviewable package per PR. Planned subjects are not actual SHAs. Add the merge SHA after merge in this PR or the handoff.

| Work package / result | Base → head SHA; commit subject | Exact files and roles | Tests / results / evidence | Rollback unit and dependencies |
| --- | --- | --- | --- | --- |
| | | | | |

Upstream packages / PRs:
Known downstream consumers:

## Scope and compatibility

List public API, CLI, storage, runtime, or platform changes (or write none).
State exclusions and link any required ADR.

## Validation

- [ ] `npm run check` (include environment and result)
- [ ] Affected integration / E2E or manual checks (list commands and results, or explain not applicable)
- [ ] Each relevant acceptance criterion checked against evidence
- [ ] No real logs, secrets, or private paths introduced

## Rollback

Trigger and verified squash commit to revert (after merge):
Can this package be reverted alone? If not, list reverse dependency order:
Data retained / potentially lost; old-code schema compatibility:
Post-rollback checks and expected retained behavior:
Rollback evidence: exercised / planned only (state which):

## Review notes

Key design choices, failure recovery, migration/rollback, and known limitations:
Reviewer and whether this is self-review:
Unresolved issues and severity (P0/P1 block completion):

For UI changes, attach screenshots. For runner changes, include tested versions and real continuation evidence. Do not label synthetic checks as real Agent certification.
