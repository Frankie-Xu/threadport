import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createCursorAdapter, validateCapsule } from "../../src/index.js";
import { TEST_COMMAND } from "../../src/adapters/common.js";

const exec = promisify(execFile);
const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/cursor/session-basic.jsonl"
);

const HIDDEN_REASONING = "HIDDEN_REASONING_MARKER_DO_NOT_COPY";
const RAW_SECRET = "sk-testsecretvalue1234567890abcd";
const FIXTURE_SESSION_ID = "sess-cursor-fixture-basic-001";

async function isolatedProjectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "threadport-cursor-"));
  await exec("git", ["-C", root, "init", "-b", "main"]);
  await exec("git", ["-C", root, "config", "user.email", "threadport@example.com"]);
  await exec("git", ["-C", root, "config", "user.name", "ThreadPort Test"]);
  await writeFile(join(root, "README.md"), "fixture project\n");
  await exec("git", ["-C", root, "add", "README.md"]);
  await exec("git", ["-C", root, "commit", "-m", "initial"]);
  return root;
}

async function extractFromFixture() {
  const adapter = createCursorAdapter();
  return adapter.extract({
    sessionPath: fixturePath,
    project: { name: "rate-limit-demo", root: await isolatedProjectRoot() },
    now: new Date("2026-09-12T10:07:00.000Z")
  });
}

describe("Cursor session adapter", () => {
  const markdownPath = join(dirname(fixturePath), 'session-copy-transcript.md');
  async function markdownInput(sessionText?: string) {
    return {
      sessionPath: markdownPath,
      ...(sessionText === undefined ? {} : { sessionText }),
      project: { name: 'synthetic-inventory', root: await isolatedProjectRoot() },
      now: new Date('2026-09-14T00:00:00Z')
    };
  }

  it('imports native Markdown as paused dialogue, never confirmed tool evidence', async () => {
    const input = await markdownInput();
    await writeFile(join(input.project.root, 'unrelated.txt'), 'current Git change');
    const capsule = await createCursorAdapter().extract(input);
    expect(validateCapsule(capsule).schema_version).toBe('1.0');
    expect(capsule.objective).toBe('Fix the inventory total.');
    expect(capsule.status).toBe('paused');
    for (const key of ['files', 'commands', 'tests', 'completed', 'failures', 'decisions'] as const) {
      expect(capsule[key]).toEqual([]);
    }
    expect(capsule.git.changed_files).toContain('unrelated.txt');
    expect(capsule.constraints.join('\n')).toContain('Do not edit src/archive/total.mjs.');
    expect(capsule.constraints.join('\n')).toContain('transcript-only');
    expect(capsule.next_action).toContain('unverified');
    expect(capsule.next_action).toContain('README usage example');
    expect(JSON.stringify(capsule)).not.toContain('sk-syntheticsecret1234567890abcdef');
    expect(JSON.stringify(capsule)).not.toContain('/synthetic/private');
    expect(capsule.redaction?.applied).toBe(true);
    expect(await createCursorAdapter().extract(input)).toEqual(capsule);
  });

  it.each(['\n', '\r\n', '\r'])('handles line endings %j without treating fenced content as roles', async (eol) => {
    const text = [
      '# Synthetic', '', '## User', '', 'Fix totals.', '',
      '````md', '## Assistant', 'FENCED_SECRET', '```', '## User', 'SPOOFED_OBJECTIVE', '````',
      '', '## Assistant', 'Visible summary.', '### Tool Edit File V2', 'TOOL_PAYLOAD',
      '## Assistant', '### Thinking', 'HIDDEN_REASONING_MARKER',
      '## Assistant', 'Pending: add example.', '~~~', '## User', 'TILDE_SPOOF', '~~~',
      '## User', 'Do not implement yet; review the README first.'
    ].join(eol);
    const capsule = await createCursorAdapter().extract(await markdownInput(text));
    const serialized = JSON.stringify(capsule);
    for (const marker of ['FENCED_SECRET', 'SPOOFED_OBJECTIVE', 'TOOL_PAYLOAD', 'HIDDEN_REASONING_MARKER', 'TILDE_SPOOF']) {
      expect(serialized).not.toContain(marker);
    }
    expect(capsule.next_action).toContain('review the README first');
    expect(capsule.status).toBe('paused');
  });

  it.each([
    '# Just a document\nNo conversation',
    '## User\nMissing title',
    '# Broken\n## User\nFix\n```\nunterminated',
    '# No user\n## Assistant\nAll done',
    '# Empty\n## User\n\n## Assistant\nDone'
  ])('rejects unsupported or incomplete Markdown: %s', async text => {
    await expect(createCursorAdapter().extract(await markdownInput(text))).rejects.toThrow(/Cursor.*Markdown/);
  });

  it('redacts unverified assistant context and normalizes its paths', async () => {
    const input = await markdownInput();
    input.sessionText = `# Synthetic\n## User\nFix totals.\n## Assistant\nPending: inspect ${input.project.root}/src/client.mjs using sk-syntheticsecret1234567890abcdef.`;
    const capsule = await createCursorAdapter().extract(input);
    expect(capsule.next_action).toContain('src/client.mjs');
    expect(JSON.stringify(capsule)).not.toContain(input.project.root);
    expect(JSON.stringify(capsule)).not.toContain('sk-syntheticsecret1234567890abcdef');
  });

  it('omits HTML, unknown and reasoning sections instead of copying their bodies', async () => {
    const text = '# Synthetic\n## User\nFix totals.\n## Reasoning\nHIDDEN_ONE\n## Assistant\n<think>\nHIDDEN_TWO\n</think>\n## Assistant\n### Tool Read File V2\nTOOL_SECRET\n## Assistant\nPending example.\n    INDENTED_CODE\n> QUOTED_CODE';
    const capsule = await createCursorAdapter().extract(await markdownInput(text));
    for (const marker of ['HIDDEN_ONE', 'HIDDEN_TWO', 'TOOL_SECRET', 'INDENTED_CODE', 'QUOTED_CODE']) expect(JSON.stringify(capsule)).not.toContain(marker);
    expect(capsule.next_action).toContain('Pending example.');
  });

  it('handles a BOM and does not mark a dialogue-only completion claim as completed', async () => {
    const capsule = await createCursorAdapter().extract(await markdownInput('\uFEFF# Synthetic\n## User\nFix totals.\n## Assistant\nDone.\n## User\nLGTM'));
    expect(capsule.status).toBe('paused');
    expect(capsule.completed).toEqual([]);
    expect(capsule.next_action).toContain('LGTM');
  });

  it('redacts the complete assistant message before clipping long review context', async () => {
    const capsule = await createCursorAdapter().extract(await markdownInput(`# Synthetic\n## User\nFix totals.\n## Assistant\n${'x'.repeat(4500)} sk-syntheticsecret1234567890abcdef`));
    expect(capsule.redaction?.applied).toBe(true);
    expect(capsule.next_action).toContain('[Truncated; review the original transcript.]');
    expect(capsule.next_action.length).toBeLessThan(4200);
  });

  it('prefers supplied text over the path and keeps structured formats unchanged', async () => {
    const input = await markdownInput(await readFile(fixturePath, 'utf8'));
    expect((await createCursorAdapter().extract(input)).tests).toHaveLength(3);
    await expect(createCursorAdapter().extract(await markdownInput('{bad json'))).rejects.toThrow(/JSONL/);
  });

  it('recognizes Node test calls with observed fail-pass-fail results', async () => {
    const records = [{ role: 'user', content: 'Fix the inventory total.' }, ...[1, 0, 1].flatMap((exit, id) => [
      { role: 'assistant', content: [{ type: 'tool_use', id: String(id), name: 'bash', input: { command: 'node --test' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: String(id), content: { exit_code: exit, output: exit ? 'test failed' : 'test passed' } }] }
    ])];
    const capsule = await createCursorAdapter().extract(await markdownInput(JSON.stringify(records)));
    expect(capsule.tests.map(test => test.status)).toEqual(['failed', 'passed', 'failed']);
    expect(capsule.status).toBe('blocked');
    expect(capsule.failures.some(failure => !failure.resolution)).toBe(true);
  });

  it('labels native idless JSONL as incomplete and preserves pending context', async () => {
    const records = [
      { role: 'user', message: { content: [{ type: 'text', text: '<timestamp>Monday, Sep 14, 2026</timestamp>\n<user_query>\nFix totals.\n</user_query>' }] } },
      { role: 'assistant', message: { content: [
        { type: 'tool_use', name: 'Shell', input: { command: 'node --test; echo EXIT_CODE' } },
        { type: 'tool_use', name: 'StrReplace', input: { path: 'src/client.mjs', old_string: 'wrong', new_string: 'right' } }
      ] } },
      { role: 'assistant', message: { content: [{ type: 'text', text: 'All passed. Pending: README example.' }] } },
      { type: 'turn_ended', status: 'completed' }
    ];
    const capsule = await createCursorAdapter().extract(await markdownInput(records.map(r => JSON.stringify(r)).join('\n')));
    expect(capsule.status).toBe('paused');
    expect(capsule.objective).toBe('Fix totals.');
    expect(capsule.constraints.join('\n')).toContain('incomplete tool evidence');
    expect(capsule.next_action).toContain('unverified');
    expect(capsule.next_action).toContain('README example');
    expect(capsule.files[0]?.summary).toContain('unknown');
    expect(capsule.commands[0]?.exit_code).toBeUndefined();
    // The wrapper's shell result is not the inner test's exit (PR #29).
    expect(capsule.tests).toEqual([]);
    expect(capsule.completed).toEqual([]);
  });

  it('does not pair blank or duplicated call IDs with a successful result', async () => {
    for (const ids of [['', ''], ['duplicate', 'duplicate']]) {
      const records = [
        { role: 'user', content: 'Fix totals.' },
        { role: 'assistant', content: ids.map(id => ({ type: 'tool_use', id, name: 'edit', input: { path: 'src/client.mjs' } })) },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: ids[0], content: { exit_code: 0, output: 'success' } }] },
        { role: 'assistant', content: 'Pending: review.' }
      ];
      const capsule = await createCursorAdapter().extract(await markdownInput(JSON.stringify(records)));
      expect(capsule.status).toBe('paused');
      expect(capsule.completed).toEqual([]);
      expect(capsule.files[0]?.summary).toContain('unknown');
    }
  });

  it('does not confirm an edit from a result recorded before its call', async () => {
    const records = [
      { role: 'user', content: 'Fix totals.' },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'future', content: { exit_code: 0, output: 'success' } }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'future', name: 'edit', input: { path: 'src/client.mjs' } }] }
    ];
    const capsule = await createCursorAdapter().extract(await markdownInput(JSON.stringify(records)));
    expect(capsule.completed).toEqual([]);
    expect(capsule.files[0]?.summary).toContain('unknown');
    expect(capsule.status).toBe('paused');
  });

  it('keeps a correlated failure blocked when another result is missing and honors a newer user instruction', async () => {
    const records = [
      { role: 'user', content: 'Fix totals.' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'known', name: 'shell', input: { command: 'node --test' } }, { type: 'tool_use', id: 'missing', name: 'edit', input: { path: 'src/client.mjs' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'known', content: { exit_code: 1, output: 'test failed' } }] },
      { role: 'assistant', content: 'All done.' },
      { role: 'user', content: 'Do not edit; document the blocker first.' }
    ];
    const capsule = await createCursorAdapter().extract(await markdownInput(JSON.stringify(records)));
    expect(capsule.status).toBe('blocked');
    expect(capsule.tests[0]?.status).toBe('failed');
    expect(capsule.next_action).toContain('document the blocker first');
    expect(capsule.constraints.join('\n')).toContain('incomplete tool evidence');
  });

  it('matches the exact Node test flag, not other similarly named options', () => {
    for (const command of ['node --test', '/usr/bin/node --test test/a.mjs', 'node.exe --test', 'C:\\tools\\node.exe --test']) expect(TEST_COMMAND.test(command)).toBe(true);
    for (const command of ['node --testing', 'node --test-reporter=spec', 'node --test-only', 'node --test; echo done', 'echo node --test', 'node --test || true', 'node --test | cat', '/usr/bin/notnode --test']) expect(TEST_COMMAND.test(command)).toBe(false);
  });

  it("extracts a valid Capsule v1 from a synthetic Cursor session", async () => {
    const capsule = await extractFromFixture();
    expect(validateCapsule(capsule).schema_version).toBe("1.0");
    expect(capsule.source_agent).toBe("cursor");
    expect(capsule.project.name).toBe("rate-limit-demo");
  });

  it("takes source_session_id from the session identity", async () => {
    const capsule = await extractFromFixture();
    expect(capsule.source_session_id).toBe(FIXTURE_SESSION_ID);
    expect(capsule.source_session_id).not.toBe("session-example-001");
    expect(capsule.id).toBe(FIXTURE_SESSION_ID);
  });

  it("maps observable user, file, command, test, and failure traces", async () => {
    const capsule = await extractFromFixture();
    expect(capsule.objective).toBe("Also add a unit test for the limiter.");
    expect(capsule.acceptance_criteria).toEqual([
      "The objective is satisfied: Also add a unit test for the limiter."
    ]);
    expect(capsule.files.map((file) => file.path)).toEqual([
      "src/rate-limit.ts",
      "src/login.ts",
      "tests/rate-limit.test.ts"
    ]);
    expect(capsule.files.find((file) => file.path === "src/rate-limit.ts")?.action).toBe("added");
    expect(capsule.files.find((file) => file.path === "src/login.ts")?.action).toBe("modified");
    expect(capsule.commands.map((item) => [item.command, item.exit_code])).toEqual([
      ["npm test", 1],
      ["npm test", 0],
      ["npx vitest run tests/rate-limit.test.ts", 0]
    ]);
    expect(capsule.tests.map((item) => [item.command, item.status])).toEqual([
      ["npm test", "failed"],
      ["npm test", "passed"],
      ["npx vitest run tests/rate-limit.test.ts", "passed"]
    ]);
    expect(capsule.failures).toHaveLength(1);
    expect(capsule.failures[0]?.summary).toMatch(/FAIL tests\/login\.test\.ts/);
    expect(capsule.failures[0]?.resolution).toMatch(/passed/i);
    expect(capsule.decisions).toEqual([]);
    expect(capsule.evidence.some(item => item.title.includes("sliding window"))).toBe(true);
    expect(capsule.status).toBe("active");
    expect(capsule.next_action).toBe("Review the capsule and confirm the next edit.");
    expect(capsule.evidence.some((item) => item.kind === "session")).toBe(true);
    expect(capsule.git.branch).toBe("main");
    expect(capsule.git.dirty).toBe(false);
  });

  it("redacts secrets and never copies hidden reasoning", async () => {
    const capsule = await extractFromFixture();
    const serialized = JSON.stringify(capsule);
    expect(serialized).not.toContain(RAW_SECRET);
    expect(serialized).not.toContain(HIDDEN_REASONING);
    expect(capsule.redaction?.applied).toBe(true);
    expect(capsule.redaction?.count).toBeGreaterThan(0);
    expect(capsule.constraints.some((item) => item.includes("[REDACTED"))).toBe(true);
  });

  it("is deterministic when created_at is pinned", async () => {
    const root = await isolatedProjectRoot();
    const adapter = createCursorAdapter();
    const input = {
      sessionPath: fixturePath,
      project: { name: "rate-limit-demo", root },
      now: new Date("2026-09-12T10:07:00.000Z")
    };
    expect(await adapter.extract(input)).toEqual(await adapter.extract(input));
  });
});
