# ADR 0012: Version the workspace reading boundary

Date: 2026-09-16. Report item: R04.

New captures use `threadport.workspace.raw.v2` and `threadport.workspace.scope.v1`. The fingerprint includes both domain identifiers. Old raw.v1 records remain readable, but cross-version/policy comparisons return unverifiable / SCOPE_CHANGED. Previously prepared handoffs require fresh preparation. Capsule v1 stays unchanged; snapshot JSON adds policy and omission counts without changing its table.

Before opening any worktree content, the inventory rejects tracked or non-ignored paths matching the conservative filename policy: `.env` and `.env.*` (including templates), credentials/secret/secrets with an optional extension, `.key/.pem/.p12/.pfx`, `.npmrc/.netrc/.pypirc`, standard SSH private-key names, and paths under `.ssh/.aws/.gnupg`. Matching is case-insensitive. The snapshot records SENSITIVE_EXCLUDED with a count and no digest. This is a filename boundary, not secret detection in arbitrary source code, nor an OS sandbox against hostile concurrent path replacement.

Git-ignored paths are never opened by the content reader. They are outside the declared scope and have a GIT_IGNORED entry count; an ignored directory may represent many files. Ignored inventory changes during capture invalidate that capture. Changes to ignored contents do not change the digest and do not establish equality of those contents. Counts and scope warnings are carried into the handoff preview.

Leaf symbolic links are hashed as link text, never dereferenced for content. Lexically external targets yield SYMLINK_OUTSIDE; nested link chains are unsupported, and symbolic-link ancestors are rejected. Normal files that happen to be link targets can still be read independently when included in the inventory. This is best-effort path validation, not an atomic filesystem snapshot.

Submodule entries produce SUBMODULE_UNSUPPORTED. Non-UTF8 filenames/link text produce PATH_ENCODING_UNSUPPORTED. Repositories without a HEAD commit remain NO_COMMIT; unusual filesystem objects remain READ_FAILED. Budget, missing-source and race reasons remain explicit. These unsupported/incomplete captures cannot produce a launchable handoff.

Tests intercept filesystem open calls and prove tracked and untracked synthetic secrets are not opened, external link targets are not opened, internal link text is supported, ignored omissions are visible, scope versions cannot match, and submodules/non-UTF8 paths cannot produce complete captures. Existing tests cover unborn repositories, budgets, deletion, worktrees and races.

Rollback must include all consumers of raw.v2 snapshot JSON. Do not rewrite old records or remove policy metadata to manufacture a match. The current database is schema 5 because of R03; old schema-4 code cannot open it. Legacy artifact extraction remains its separately documented algorithm and is not covered by this workbench reader policy.
