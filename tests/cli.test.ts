import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parseCapsule } from "../src/capsule.js";
import { runCli } from "../src/cli.js";

const exec = promisify(execFile);
const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/claude/session-basic.jsonl"
);
const codexFixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/codex/session-basic.jsonl"
);
const cursorFixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/cursor/session-basic.jsonl"
);
const geminiFixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/gemini/session-basic.json"
);

async function isolatedProjectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "threadport-cli-project-"));
  await exec("git", ["-C", root, "init", "-b", "main"]);
  await exec("git", ["-C", root, "config", "user.email", "threadport@example.com"]);
  await exec("git", ["-C", root, "config", "user.name", "ThreadPort Test"]);
  await writeFile(join(root, "README.md"), "fixture project\n");
  await exec("git", ["-C", root, "add", "README.md"]);
  await exec("git", ["-C", root, "commit", "-m", "initial"]);
  return root;
}

async function captureCli(argv: string[], cwd: string) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(argv, {
    cwd: () => cwd,
    stdout: { write(text) { stdout += text; } },
    stderr: { write(text) { stderr += text; } }
  });
  return { code, stdout, stderr };
}

describe("Handoff CLI", () => {
  it('keeps native and sparse Cursor evidence warnings through validation and handoff', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'threadport-cli-cursor-evidence-'));
    const project = await isolatedProjectRoot();
    const createdAt = '2026-09-14T00:00:00.000Z';
    const cases = [
      { name: 'sparse', source: [{ role: 'user', content: 'Review only.' }, { role: 'assistant', content: [{ type: 'tool_use', name: 'Shell', input: { command: 'node --test' } }] }] },
      { name: 'native', source: { format: 'threadport.cursor-native.v1', sessionId: '11111111-1111-4111-8111-111111111111', createdAt: Date.parse(createdAt), bubbles: [
        { bubbleId: 'u', type: 1, createdAt, text: 'Review only.' },
        { bubbleId: 'tool', type: 2, createdAt, startedAtMs: Date.parse(createdAt), completedAtMs: Date.parse(createdAt) + 1,
          tool: { name: 'run_terminal_command_v2', toolCallId: 'tool', status: 'completed', params: { command: 'node --test', cwd: '/synthetic' }, result: { rejected: true } } }
      ] } }
    ];
    for (const entry of cases) {
      const source = join(cwd, `${entry.name}.json`);
      const out = join(cwd, `${entry.name}-capsule.json`);
      await writeFile(source, JSON.stringify(entry.source));
      const result = await captureCli(['extract', '--from', 'cursor', '--session', source, '--project', project, '--out', out], cwd);
      expect(result.code).toBe(0);
      expect(result.stdout.trim().split('\n')).toHaveLength(2);
      expect(result.stderr).toContain('incomplete tool evidence');
      if (entry.name === 'native') expect(result.stderr).toContain('Experimental selected Cursor database evidence');
      const capsule = parseCapsule(await readFile(out, 'utf8'));
      expect(capsule.status).toBe('paused');
      expect(capsule.commands[0]).not.toHaveProperty('exit_code');
      expect((await captureCli(['validate', out], cwd)).code).toBe(0);
      const handoff = await captureCli(['handoff', '--to', 'cursor', out, '--out', join(cwd, `${entry.name}-handoff.md`)], cwd);
      expect(handoff.code).toBe(0);
      expect(await readFile(handoff.stdout.trim(), 'utf8')).toContain('incomplete tool evidence');
    }
  });

  it('warns on transcript-only Cursor imports and carries the warning through handoff', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'threadport-cli-cursor-md-'));
    const project = await isolatedProjectRoot();
    const result = await captureCli([
      'extract', '--from', 'cursor', '--session', join(dirname(cursorFixturePath), 'session-copy-transcript.md'),
      '--project', project, '--out', join(cwd, 'capsule.json')
    ], cwd);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('Warning: Cursor Markdown import is transcript-only');
    const paths = result.stdout.trim().split('\n');
    expect(paths).toHaveLength(2);
    const capsule = parseCapsule(await readFile(paths[0], 'utf8'));
    expect(capsule.status).toBe('paused');
    expect(capsule.tests).toEqual([]);
    expect((await captureCli(['validate', paths[0]], cwd)).code).toBe(0);
    const markdown = await readFile(paths[1], 'utf8');
    expect(markdown).toContain('transcript-only');
    expect(markdown).toContain('README usage example');
    expect(markdown).not.toContain('sk-syntheticsecret1234567890abcdef');
    const handoff = await captureCli(['handoff', '--to', 'codex', paths[0], '--out', join(cwd, 'handoff.md')], cwd);
    expect(handoff.code).toBe(0);
    expect(await readFile(handoff.stdout.trim(), 'utf8')).toContain('transcript-only');
  });

  it("extracts a valid Capsule outside the project without running session commands", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "threadport-cli-cwd-"));
    const project = await isolatedProjectRoot();
    const result = await captureCli([
      "extract",
      "--from", "claude",
      "--session", fixturePath,
      "--project", project
    ], cwd);

    expect(result.code).toBe(0);
    const [jsonPath, mdPath] = result.stdout.trim().split('\n');
    const capsule = parseCapsule(await readFile(jsonPath, "utf8"));
    const markdown = await readFile(mdPath, "utf8");
    expect(capsule.source_agent).toBe("claude");
    expect(capsule.objective).toBe("Also add a unit test for the limiter.");
    expect(markdown).toContain(capsule.objective);
    expect(await readFile(join(project, "README.md"), "utf8")).toBe("fixture project\n");
    await expect(readFile(join(project, "package.json"), "utf8")).rejects.toThrow();
  });

  it("validates and renders a Capsule written by extract", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "threadport-cli-roundtrip-"));
    const project = await isolatedProjectRoot();
    const extracted = await captureCli([
      "extract",
      "--from", "claude",
      "--session", fixturePath,
      "--project", project
    ], cwd);
    expect(extracted.code).toBe(0);

    const capsulePath = extracted.stdout.trim().split('\n')[0];
    const validated = await captureCli(["validate", capsulePath], cwd);
    expect(validated.code).toBe(0);

    const rendered = await captureCli(["render", capsulePath], cwd);
    expect(rendered.code).toBe(0);
    expect(rendered.stdout).toContain("# ThreadPort Context Capsule");
    expect(rendered.stdout).toContain("Add a sliding-window login rate limiter.");
    expect(rendered.stdout).toContain("Do not execute commands");
  });

  it("rejects an invalid Capsule and refuses to overwrite without --force", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "threadport-cli-errors-"));
    const badPath = join(cwd, "bad.json");
    await writeFile(badPath, JSON.stringify({ nope: true }));
    const invalid = await captureCli(["validate", badPath], cwd);
    expect(invalid.code).not.toBe(0);
    expect(invalid.stderr.length).toBeGreaterThan(0);

    const project = await isolatedProjectRoot();
    const out = join(cwd, "capsule.json");
    const first = await captureCli([
      "extract",
      "--from", "claude",
      "--session", fixturePath,
      "--project", project,
      "--out", out
    ], cwd);
    expect(first.code).toBe(0);
    const blocked = await captureCli([
      "extract",
      "--from", "claude",
      "--session", fixturePath,
      "--project", project,
      "--out", out
    ], cwd);
    expect(blocked.code).not.toBe(0);
    const forced = await captureCli([
      "extract",
      "--from", "claude",
      "--session", fixturePath,
      "--project", project,
      "--out", out,
      "--force"
    ], cwd);
    expect(forced.code).toBe(0);
  });

  it("exports a machine-readable handoff envelope", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "threadport-cli-json-") );
    const project = await isolatedProjectRoot();
    const extracted = await captureCli(["extract", "--from", "claude", "--session", fixturePath, "--project", project], cwd);
    expect(extracted.code).toBe(0);
    const capsulePath = extracted.stdout.trim().split('\n')[0];
    const result = await captureCli(["handoff", "--to", "codex", "--format", "json", capsulePath], cwd);
    expect(result.code).toBe(0);
    const envelope = JSON.parse(await readFile(result.stdout.trim(), "utf8"));
    expect(envelope.protocol).toBe("threadport.handoff.v1");
    expect(envelope.target_agent).toBe("codex");
    expect(envelope.safety).toEqual({ execute_commands: false, modify_workspace: false });
    expect(envelope.capsule.id).toBe("sess-claude-fixture-basic-001");
  });

  it("extracts a Cursor fixture through --from cursor", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "threadport-cli-cursor-"));
    const project = await isolatedProjectRoot();
    const result = await captureCli([
      "extract",
      "--from", "cursor",
      "--session", cursorFixturePath,
      "--project", project
    ], cwd);
    expect(result.code).toBe(0);
    const capsule = parseCapsule(
      await readFile(result.stdout.trim().split('\n')[0], "utf8")
    );
    expect(capsule.source_agent).toBe("cursor");
  });

  it("extracts a Gemini fixture through --from gemini", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "threadport-cli-gemini-"));
    const project = await isolatedProjectRoot();
    const result = await captureCli([
      "extract",
      "--from", "gemini",
      "--session", geminiFixturePath,
      "--project", project
    ], cwd);
    expect(result.code).toBe(0);
    const capsule = parseCapsule(
      await readFile(result.stdout.trim().split('\n')[0], "utf8")
    );
    expect(capsule.source_agent).toBe("gemini");
  });

  it("extracts a Codex fixture through --from codex", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "threadport-cli-codex-"));
    const project = await isolatedProjectRoot();
    const result = await captureCli([
      "extract",
      "--from", "codex",
      "--session", codexFixturePath,
      "--project", project
    ], cwd);
    expect(result.code).toBe(0);
    const capsule = parseCapsule(
      await readFile(result.stdout.trim().split('\n')[0], "utf8")
    );
    expect(capsule.source_agent).toBe("codex");
  });

  it("keeps .threadport ignored and rejects other --from agents", async () => {
    const gitignore = await readFile(join(dirname(fileURLToPath(import.meta.url)), "../.gitignore"), "utf8");
    expect(gitignore).toMatch(/^\.threadport\/$/m);

    const cwd = await mkdtemp(join(tmpdir(), "threadport-cli-from-"));
    const other = await captureCli([
      "extract",
      "--from", "unknown",
      "--session", fixturePath,
      "--project", cwd
    ], cwd);
    expect(other.code).not.toBe(0);
    expect(other.stderr).toMatch(/gemini/i);
  });
});
