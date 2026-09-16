# ADR 0015: Redacted commands are review evidence

Date: 2026-09-16. Report item R07.

The historical Codex attempt used an opaque external path as an executable and exited 127. That failure stays in the original evidence. Portable Capsule projection now labels any rewritten/redacted command or test as not directly executable while retaining its recorded outcome. An altered next action carries an explicit review warning in legacy exports. Applying protection again does not repeatedly prepend the warning.

For workbench continuation, a next action that changes at the portable boundary or already contains an opaque external/redacted placeholder blocks preparation with NEXT_ACTION_REVIEW_REQUIRED. The user edits and explicitly saves a portable replacement. ThreadPort does not restore private paths, invent an executable mapping or change the original failure to success. Existing manual constraints and file evidence remain protected independently.

Context transport remains the already reviewed single argv parameter. R02 binds exact bytes, executable, cwd and argument list; it exposes argv visibility and inherited-configuration limits. No unsupported stdin/file mode is added. Existing transport regressions cover quotes, Unicode/newlines, argument boundaries, rejection, cancellation and platform length limits. Real vendor content/first-command verification still requires the actual R09 candidate matrix; synthetic checks do not close that gate.

No Capsule schema or database migration is needed. Rollback removes the warning/refusal policy, so it requires explicitly accepting the known placeholder risk; old failure records remain unchanged.
