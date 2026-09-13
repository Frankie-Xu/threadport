# Security

ThreadPort records observable work state. It must not copy hidden reasoning, and it must not commit secrets.

## Report a vulnerability

Use a [private GitHub security advisory](https://github.com/Frankie-Xu/threadport/security/advisories/new). Do not open a public issue for an unreleased vulnerability.

## What to expect in a Capsule

- Strings written into a Capsule go through `redactSecrets`.
- Session adapters drop thinking / reasoning / thought blocks.
- The handoff CLI is read-only. It does not run `next_action`.
