# Contributing

ThreadPort is a first-party repository. Changes land on `main` through a pull request.

## Branch

```text
<type>/Frankie-Xu/<description>
```

Examples: `feat/Frankie-Xu/claude-session-adapter`, `chore/Frankie-Xu/repo-hygiene`. One concern per branch. Open the branch from the current `main`.

## Quality gate

```bash
npm ci
npm run check
```

That runs `tsc` and Vitest. Tests use synthetic fixtures only. Do not commit real agent sessions, API keys, or `.env` files.

## Commits and pull requests

- Use an English imperative subject that says why the change exists.
- Keep the author as Frankie-Xu.
- Squash-merge into `main`. Do not push `main` directly.
- Fill in the pull request template. `npm run check` must stay green.

## Product boundary

Capsule v1 fields are frozen. Adapters and the CLI map onto the existing schema. Do not execute `next_action`, upload session data, or add an MCP server unless a later document opens that scope.
