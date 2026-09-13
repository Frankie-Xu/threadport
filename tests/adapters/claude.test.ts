import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { project } from "../helpers.js";
import { createClaudeAdapter, validateCapsule } from "../../src/index.js";

const exec = promisify(execFile);
const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/claude/session-basic.jsonl"
);

const HIDDEN_REASONING = "HIDDEN_REASONING_MARKER_DO_NOT_COPY";
const RAW_SECRET = "sk-testsecretvalue1234567890abcd";
const FIXTURE_SESSION_ID = "sess-claude-fixture-basic-001";

async function isolatedProjectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "threadport-claude-"));
  await exec("git", ["-C", root, "init", "-b", "main"]);
  await exec("git", ["-C", root, "config", "user.email", "threadport@example.com"]);
  await exec("git", ["-C", root, "config", "user.name", "ThreadPort Test"]);
  await writeFile(join(root, "README.md"), "fixture project\n");
  await exec("git", ["-C", root, "add", "README.md"]);
  await exec("git", ["-C", root, "commit", "-m", "initial"]);
  return root;
}

async function extractFromFixture() {
  const adapter = createClaudeAdapter();
  return adapter.extract({
    sessionPath: fixturePath,
    project: { name: "rate-limit-demo", root: await isolatedProjectRoot() },
    now: new Date("2026-09-12T10:07:00.000Z")
  });
}

describe("Claude Code session adapter", () => {
  it("extracts a valid Capsule v1 from a synthetic Claude session", async () => {
    const capsule = await extractFromFixture();
    expect(validateCapsule(capsule).schema_version).toBe("1.0");
    expect(capsule.source_agent).toBe("claude");
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
    expect(capsule.objective).toBe("Add a sliding-window login rate limiter.");
    expect(capsule.acceptance_criteria).toEqual([
      "More than 10 requests per minute return 429.",
      "Existing valid logins still succeed."
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
    expect(capsule.decisions[0]?.decision).toMatch(/sliding window/i);
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
    expect(capsule.redaction).toEqual({ applied: true, count: expect.any(Number) });
    expect(capsule.redaction?.count).toBeGreaterThan(0);
    expect(capsule.constraints.some((item) => item.includes("[REDACTED"))).toBe(true);
  });

  it("is deterministic when created_at is pinned", async () => {
    const root = await isolatedProjectRoot();
    const adapter = createClaudeAdapter();
    const input = {
      sessionPath: fixturePath,
      project: { name: "rate-limit-demo", root },
      now: new Date("2026-09-12T10:07:00.000Z")
    };
    const first = await adapter.extract(input);
    const second = await adapter.extract(input);
    expect(second).toEqual(first);
  });

  it("applies portable path policy to project, git, files, and evidence", async () => {
    const adapter = createClaudeAdapter();
    const capsule = await adapter.extract({
      sessionPath: fixturePath,
      project: { name: "rate-limit-demo", root: await isolatedProjectRoot() },
      privacy: "portable",
      now: new Date("2026-09-12T10:07:00.000Z")
    });
    expect(capsule.project.root).toBe(".");
    expect(capsule.git.root).toBe(".");
    expect(capsule.files.map((file) => file.path)).toEqual([
      "src/rate-limit.ts",
      "src/login.ts",
      "tests/rate-limit.test.ts"
    ]);
    expect(capsule.evidence.find((item) => item.kind === "session")?.locator)
      .toMatch(/^external\/[a-f0-9]{24}$/);
  });
  it('keeps distinct file evidence for nested, Unicode, and external paths', async () => {
    const root = await project();
    const paths = ['src/a/index.ts', 'src/b/index.ts', 'src/目录/a file.ts'].map(path => join(root, path));
    paths.push(join(root, '..', 'synthetic-private', 'index.ts'));
    const records = paths.flatMap((path, index) => [
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: `edit-${index}`, name: 'Edit', input: { file_path: path } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `edit-${index}`, content: 'Updated file' }] } },
    ]);
    const capsule = await createClaudeAdapter().extract({
      sessionText: JSON.stringify(records), project: { name: 'path-identity', root },
      now: new Date('2026-09-14T00:00:00Z'),
    });
    const expected = capsule.files.map(file => file.path);
    expect(expected.slice(0, 3)).toEqual(['src/a/index.ts', 'src/b/index.ts', 'src/目录/a file.ts']);
    expect(expected[3]).toMatch(/^external\/[a-f0-9]{24}$/);
    expect(new Set(expected).size).toBe(4);
    expect(capsule.evidence.filter(item => item.kind === 'file').map(item => item.locator)).toEqual(expected);
    expect(capsule.evidence.filter(item => item.kind === 'file').map(item => item.title)).toEqual(expected);
    expect(JSON.stringify(capsule)).not.toContain('synthetic-private');
    expect(JSON.stringify(capsule)).not.toContain(JSON.stringify(root).slice(1, -1));
    expect(validateCapsule(capsule)).toEqual(capsule);
  });

});
