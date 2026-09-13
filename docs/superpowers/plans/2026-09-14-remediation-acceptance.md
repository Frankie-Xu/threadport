# Remediation Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Execution exception: those execution skills are unavailable. The user requested execution; proceed inline with regression checkpoints, without delegating.

**Goal:** Fix the remaining portable path defect and complete the missing acceptance tests without presenting unverified live-agent compatibility as complete.

**Architecture:** Keep path privacy in `src/privacy.ts`, Markdown assertions in parser-backed tests and publication fault injection at the filesystem boundary. Require real symlinks on every CI operating system. Keep live transcript verification separate from synthetic fixtures and preserve explicit provenance.

**Tech Stack:** TypeScript, Node >=20, Vitest 4, marked 15 (development only), GitHub Actions.

## Global Constraints

- Capsule v1 fields are frozen; no launch, resume, MCP or execution of session commands.
- Do not inspect private historical sessions without user-supplied scope; never commit real logs or credentials.
- Work on `fix/Frankie-Xu/remediation-acceptance` from `455a153`, fetch before publishing, use a PR, never push main directly.
- Keep source edits and regression evidence together. Do not skip failing acceptance tests to obtain green CI.

### Task 1 — Portable path token boundaries

Files: `src/privacy.ts`, `tests/privacy.test.ts`.

Interface remains `protectCapsule(input, privacy, roots, priorCount)`. Replace only complete path tokens or real directory prefixes; prevent sibling names sharing a root prefix from becoming relative paths. Preserve known quoted paths containing spaces and Windows/UNC paths.

- [ ] Add a regression using root `/project` and objective `Read /project-sibling/private/file.ts`; assert the output contains `external/` and neither the original path nor `.-sibling`. Add Windows/UNC sibling prefixes, quoted spaces and all-adapter same-basename cases.

```ts
expect(protectCapsule(capsule, 'portable', ['/project']).objective)
  .toMatch(/^Read external\/[0-9a-f]{24}$/);
```

- [ ] Run `npm test -- tests/privacy.test.ts` and observe the existing failure. Replace blind `.split(from).join(to)` with boundary-aware matching and one-pass substitution; known directory matches must end at a separator or token boundary, never within a sibling name. Run the targeted suite and `npm run check`, then commit.

### Task 2 — Parsed Markdown structure

Files: `tests/markdown.test.ts`, `package.json`, `package-lock.json`; change `src/markdown.ts` only if new assertions expose a defect.

- [ ] Install Node-20-compatible `marked@15.0.12` as a pinned dev dependency. Parse rendered output with `marked.lexer`, discarding the known frontmatter block before parsing. Assert exactly three tables and three cells per header/body row, and unchanged product heading sequence under malicious source text.

```ts
const tokens = marked.lexer(markdown.replace(/^---\n[\s\S]*?\n---\n/, ''));
const tables = tokens.filter(token => token.type === 'table');
expect(tables).toHaveLength(3);
for (const table of tables) {
  expect(table.header).toHaveLength(3);
  for (const row of table.rows) expect(row).toHaveLength(3);
}
```

- [ ] Include pipes, backticks, LF/CRLF/CR, fake headings and links in source fields. Inspect parsed headings/HTML tokens; literal source HTML must never become an active tag. Run targeted tests and the full gate; commit tests and any necessary escaping correction.

### Task 3 — Post-JSON publication faults and Windows symlinks

Files: create `tests/cli-publication-faults.test.ts`; update `tests/git-regressions.test.ts` and CI only if Windows capability setup is needed.

- [ ] Use Vitest module mocks wrapping the real `node:fs/promises` implementation. Fail `link` for the Markdown destination only, after confirming JSON exists; assert status 0, JSON valid and unchanged, stdout only lists JSON, stderr reports cache failure and `render` regenerates the cache. Also inject a force-mode `rename` failure and assert prior Markdown survives; inject JSON publication failure and assert no Markdown is published. All temporary files must be cleaned.

```ts
expect(result.code).toBe(0);
expect(result.stdout.trim()).toBe(jsonPath);
expect(result.stderr).toContain('Capsule JSON saved; Markdown cache failed');
expect(await readdir(outputDirectory)).not.toContain(temporaryFileName);
```

- [ ] Remove the Windows skip from the real symlink regression. Use `symlink(target, linkPath, 'file')` and verify `lstat(linkPath).isSymbolicLink()`. Test external target changes, link replacement and broken targets on all six OS/Node jobs. A Windows privilege failure must fail CI explicitly; do not replace it with a junction or a skipped test.
- [ ] Run `npm run check`, `npm run check:pack`, `npm audit`, and `git diff --check`; commit and publish the PR. Inspect every platform result before claiming completion.

### Task 4 — Evidence and live-format gate

Files: `docs/review-remediation-2026-09-14.md`, `README.md`; add a compatibility evidence document if actual versioned samples are available.

- [ ] Record each implemented change, test and remote CI evidence. Correct the earlier all-complete claim while preserving historical verification runs.
- [ ] Request vendor versions and permitted sanitized samples from the user. Verify only supplied scope; do not launch installed agents, read historical sessions or fabricate provenance. If samples remain unavailable, leave live-format certification explicitly blocked and report the missing input separately from completed code fixes.
- [ ] Fetch remote main, ensure no unrelated changes are lost, merge only through green PR checks and verify the resulting main commit/CI. Do not mark the sample-dependent gate complete without evidence.
