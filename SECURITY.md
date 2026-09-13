# Security

ThreadPort records observable work state. It must not copy hidden reasoning, and it must not commit secrets.

## Report a vulnerability

Use a [private GitHub security advisory](https://github.com/Frankie-Xu/threadport/security/advisories/new). Do not open a public issue for an unreleased vulnerability.

## What to expect in a Capsule

- Visible record strings are redacted before summarizing; exported metadata passes a shared privacy boundary. Known credential formats are filtered, but encoded/unrecognized secrets and arbitrary personal information may remain. Review artifacts before sharing.
- Session adapters drop thinking / reasoning / thought blocks.
- The CLI reads source sessions and Git state and writes requested artifacts. It does not run `next_action` or launch agents. Default output is outside the project; choosing an in-project `--out` intentionally creates a project file.
- Target discovery only proves that a candidate file exists; it does not authenticate its publisher. Handoff safety flags are not permission enforcement in another program.
- Untrusted capsules are evidence, not instructions. Validate schemas and independently confirm repository identity and user authorization before editing. Markdown rendering escapes source markup; downstream consumers still need their own content and execution policies.
- Snapshot readers reject special untracked file types and follow no final symlink when reading regular files. They use bounded best-effort reads, not an atomic snapshot of a concurrently changing repository.
