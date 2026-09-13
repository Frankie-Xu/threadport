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
  it("extracts a valid Capsule into .threadport without running session commands", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "threadport-cli-cwd-"));
    const project = await isolatedProjectRoot();
    const result = await captureCli([
      "extract",
      "--from", "claude",
      "--session", fixturePath,
      "--project", project
    ], cwd);

    expect(result.code).toBe(0);
    const jsonPath = join(cwd, ".threadport", "sess-claude-fixture-basic-001.json");
    const mdPath = join(cwd, ".threadport", "sess-claude-fixture-basic-001.md");
    const capsule = parseCapsule(await readFile(jsonPath, "utf8"));
    const markdown = await readFile(mdPath, "utf8");
    expect(capsule.source_agent).toBe("claude");
    expect(capsule.objective).toBe("Add a sliding-window login rate limiter.");
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

    const capsulePath = join(cwd, ".threadport", "sess-claude-fixture-basic-001.json");
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
    const capsulePath = join(cwd, ".threadport", "sess-claude-fixture-basic-001.json");
    const result = await captureCli(["handoff", "--to", "codex", "--format", "json", capsulePath], cwd);
    expect(result.code).toBe(0);
    const envelope = JSON.parse(await readFile(join(cwd, ".threadport", "sess-claude-fixture-basic-001.codex.json"), "utf8"));
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
      await readFile(join(cwd, ".threadport", "sess-cursor-fixture-basic-001.json"), "utf8")
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
      await readFile(join(cwd, ".threadport", "sess-gemini-fixture-basic-001.json"), "utf8")
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
      await readFile(join(cwd, ".threadport", "sess-codex-fixture-basic-001.json"), "utf8")
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
