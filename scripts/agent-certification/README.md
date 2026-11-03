# CERT-01 developer harness

Node 24 and the repository's locked dependencies are required. Run these commands from the repository root. These development tools are deliberately outside the published package. They prepare synthetic files, apply one fixed human edit, or inspect explicitly selected local files. They never start an Agent, install a tarball, change login/permissions, open a database, discover sessions, scan user logs, or create a receipt/attestation/authority record.

The implementation schema is [contracts.mjs](contracts.mjs); `prepare` writes an actual, complete `evidence.template.json`. The [usage guide](../../docs/verification/agent-certification-harness.md) defines the frozen commands, exit codes, evidence fields, operator procedure, limitations, and fault checklist. Artifact checks recognize a deliberately tiny arithmetic language; they do not execute workspace JavaScript. The protected Node tests are for separately reviewed operator execution and the automated synthetic regression, not automatically launched by this harness.

```sh
node scripts/agent-certification/cli.mjs --help
npm test -- tests/scripts/agent-certification.test.ts
```

No arguments show help. There is no `run`, `launch`, `--exec`, `--yes`, shell fallback, or production import entry point. A complete user-written JSON record can at most produce `complete-unverified`; authenticity, installation provenance, runtime observations and the certification matrix still require independent review.
