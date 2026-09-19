# ADR 0010: Terminal grants bind the executable launch plan

Date: 2026-09-16. Report item: R02.

Construct a launch plan before asking for terminal consent. The versioned plan includes a random nonce, expiry, handoff and prompt binding, target/version, canonical launcher path, SHA-256 and filesystem identity, complete argv, cwd and transmission. Its permission statement explicitly says inherited Agent settings, interpreter and environment are not certified. The terminal shows the actual arguments and the complete context; browser confirmation alone cannot create this launch grant.

After consent, detect capabilities and construct the plan again. Compare exact canonical serialization and executable identity. Recheck workspace/task/source, hash the executable again, persist the terminal plan and consume the handoff once. Execute the approved canonical path and argument array with shell disabled. Plan construction or verification failure creates no launch attempt. Existing packages require a fresh terminal plan even if previously browser-confirmed.

The database remains schema 4 for this change. Approval carries a plan plus a separate digest; package digests retain their original meaning. Reverting requires reverting the terminal flow, approval and claim consumers together. No user-data rewrite is required.

This checks the launcher file, not all interpreters, dynamically loaded libraries or Agent configuration. There remains a filesystem race between the final identity check and OS execution; Node's ordinary spawn does not atomically execute a verified file handle. Full context remains in argv and this visibility is stated during review. A different transport requires its own verified adapter and grant version.

Validation: synthetic launchers test changes to executable content, version, argv, cwd and transport during review; existing cancellation, no-TTY, task/workspace drift and independent-process single-consumption tests remain required. This is local implementation evidence, not real Agent certification.
