import { afterEach, expect, it } from "vitest";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startLocalServer } from "../../src/server/app.js";
import { runCli } from "../../src/cli.js";
import { temporary } from "../helpers.js";
const servers: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});
it("previews safe diagnostics and exports exactly reviewed task metadata without clobbering", async () => {
  const dataDir = await temporary(),
    out = await temporary(),
    server = await startLocalServer({ dataDir });
  servers.push(server);
  const api = async (path: string, body?: unknown) => {
    const response = await fetch(server.origin + "/api/v1" + path, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: "Bearer " + server.token,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  };
  const workspace = await api("/workspaces", {
      root: out,
      confirmBinding: true,
    }),
    task = await api("/tasks", {
      projectId: workspace.body.data.projectId,
      title: "<img src=x> ``` reviewed",
    });
  const id = task.body.data.id;
  const diagnostics = (await api("/diagnostics")).body;
  for (const value of [dataDir, out, server.token, "<img src=x>"])
    expect(JSON.stringify(diagnostics)).not.toContain(value);
  expect(diagnostics.data.counts.tasks).toBe(1);
  const preview = (
    await api("/exports/preview", { kind: "task", id, format: "markdown" })
  ).body.data;
  expect(preview.text).toContain("Origin: unknown");
  expect(preview.text).toContain("Metadata only");
  const body = {
    kind: "task",
    id,
    format: "markdown",
    directory: out,
    expectedDigest: preview.digest,
  };
  expect(
    (await api("/exports", { ...body, expectedDigest: "0".repeat(64) })).status,
  ).toBe(409);
  expect(await readdir(out)).toEqual([]);
  const responses = await Promise.all([
    api("/exports", body),
    api("/exports", body),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(await readFile(join(out, preview.fileName), "utf8")).toBe(
    preview.text,
  );
  expect(await readdir(out)).toEqual([preview.fileName]);
  let stdout = "",
    stderr = "";
  const io = {
    cwd: () => out,
    stdout: {
      write: (s: string) => {
        stdout += s;
      },
    },
    stderr: {
      write: (s: string) => {
        stderr += s;
      },
    },
  };
  expect(await runCli(["doctor", "--json", "--data-dir", dataDir], io)).toBe(0);
  expect(JSON.parse(stdout).counts.tasks).toBe(1);
  expect(stdout).not.toContain(dataDir);
  expect(stderr).toBe("");
  expect(await runCli(["doctor", "--source", "x"], io)).toBe(2);
  expect(await runCli(["index"], io)).toBe(2);
  expect(await runCli(["index","--source","unknown","--data-dir",dataDir],io)).toBe(2);
}, 30000);
