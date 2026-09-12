import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { gitStateMatches, readGitState } from "../src/git.js";

const exec = promisify(execFile);

describe("Git state model", () => {
  it("captures a clean state and detects a dirty change", async () => {
    const root = await mkdtemp(join(tmpdir(), "threadport-git-"));
    await exec("git", ["-C", root, "init", "-b", "main"]);
    await exec("git", ["-C", root, "config", "user.email", "threadport@example.com"]);
    await exec("git", ["-C", root, "config", "user.name", "ThreadPort Test"]);
    await writeFile(join(root, "README.md"), "initial\n");
    await exec("git", ["-C", root, "add", "README.md"]);
    await exec("git", ["-C", root, "commit", "-m", "initial"]);

    const clean = await readGitState(root);
    expect(clean.dirty).toBe(false);
    expect(clean.head).toMatch(/^[0-9a-f]{40}$/);
    expect(clean.dirty_diff_hash).toMatch(/^[0-9a-f]{64}$/);

    await writeFile(join(root, "README.md"), "changed\n");
    const dirty = await readGitState(root);
    expect(dirty.dirty).toBe(true);
    expect(dirty.changed_files).toContain("README.md");
    expect(gitStateMatches(clean, dirty)).toBe(false);
  });
});
