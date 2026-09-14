import { test, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { startLocalServer } from "../../dist/src/server/app.js";
let server: Awaited<ReturnType<typeof startLocalServer>>,
  base: string,
  taskId: string;
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(server.origin + "/api/v1" + path, {
    method,
    headers: {
      authorization: "Bearer " + server.token,
      ...(method === "GET" ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(response.ok).toBe(true);
  return response.json();
}
test.beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "threadport-edit-")));
  const root = join(base, "project"),
    logs = join(base, "logs");
  await mkdir(root);
  await mkdir(logs);
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
  git("init", "-b", "main");
  git("config", "user.name", "Synthetic");
  git("config", "user.email", "test@example.invalid");
  await writeFile(join(root, "README.md"), "Synthetic editor project");
  git("add", ".");
  git("commit", "-m", "initial");
  await writeFile(
    join(logs, "session.jsonl"),
    JSON.stringify({
      type: "user",
      sessionId: "11111111-1111-4111-8111-111111111111",
      message: { role: "user", content: "Keep the synthetic project offline." },
    }) + "\n",
  );
  server = await startLocalServer({ dataDir: join(base, "data") });
  const workspace = await api("/workspaces", "POST", {
      root,
      confirmBinding: true,
    }),
    source = await api("/sources", "POST", { agent: "claude", root: logs }),
    job = await api("/index-jobs", "POST", { sourceIds: [source.data.id] });
  await expect
    .poll(
      async () =>
        (await api("/index-jobs/" + job.data.jobId)).data.progress[0].state,
    )
    .toBe("completed");
  const sessions = await api("/sessions/unassigned");
  taskId = (
    await api("/tasks", "POST", {
      projectId: workspace.data.projectId,
      title: "Review offline changes",
      sessionId: sessions.data[0].id,
    })
  ).data.id;
});
test.afterAll(async () => {
  await server?.close();
  if (base) await rm(base, { recursive: true, force: true });
});
test("preserves conflict drafts and reviews the exact immutable prompt before a terminal command", async ({
  page,
}) => {
  // Only the display capability probe is synthetic. Mutations, snapshot and export use the actual server.
  await page.route("**/api/v1/targets", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            agent: "claude",
            installed: true,
            version: "synthetic",
            auth: "unknown",
            nativeResume: true,
            newSessionWithContext: true,
            reason: null,
          },
          {
            agent: "codex",
            installed: false,
            version: null,
            auth: "unknown",
            nativeResume: false,
            newSessionWithContext: false,
            reason: "Synthetic unavailable target",
          },
        ],
      },
    }),
  );
  await page.goto(server.origin + "/?v=inbox&t=" + taskId);
  await page.evaluate((token) => {
    history.replaceState(null, "", location.search + "#token=" + token);
    location.reload();
  }, server.token);
  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  await page
    .getByLabel("Objective", { exact: true })
    .fill("My preserved draft");
  const second = await page.context().newPage();
  await second.goto(server.origin + "/?v=inbox&t=" + taskId);
  await second.evaluate((token) => {
    history.replaceState(null, "", location.search + "#token=" + token);
    location.reload();
  }, server.token);
  await second.getByRole("button", { name: "Edit task", exact: true }).click();
  await second
    .getByLabel("Next action", { exact: true })
    .fill("Independent edit");
  await second.getByRole("button", { name: "Save changes" }).click();
  await expect(
    second.getByText("Independent edit", { exact: true }),
  ).toBeVisible();
  await second.close();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toContainText("changed");
  await expect(page.getByLabel("Objective", { exact: true })).toHaveValue(
    "My preserved draft",
  );
  await page.getByRole("button", { name: "Discard draft and reload" }).click();
  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  await page
    .getByLabel("Objective", { exact: true })
    .fill("Keep all operations offline");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText("Keep all operations offline", { exact: true }),
  ).toBeVisible();
  expect((await api("/tasks/" + taskId)).data.task.nextAction.text).toBe(
    "Independent edit",
  );
  await page
    .getByRole("combobox", { name: "Lifecycle", exact: true })
    .selectOption("completed");
  await page.getByRole("button", { name: "Save status", exact: true }).click();
  await expect
    .poll(async () => (await api("/tasks/" + taskId)).data.task.lifecycle)
    .toBe("completed");
  await page.getByRole("button", { name: "Archive task", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unarchive task" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Unarchive task" }).click();
  await expect(
    page.getByRole("button", { name: "Archive task", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View evidence", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Keep the synthetic project offline.",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Detach session", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm detach" }).click();
  await expect(
    page.getByRole("button", { name: "Continue task", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Attach a session" }).click();
  await page
    .getByRole("button", { name: "Attach session", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Continue task", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Continue task", exact: true })
    .click();
  await page.getByRole("button", { name: "Prepare preview" }).click();
  const prompt = page.getByLabel("Complete transfer text");
  await expect(prompt).toContainText("Keep all operations offline");
  await expect(
    page.getByRole("button", { name: "Confirm preview" }),
  ).toBeDisabled();
  await page
    .getByLabel(
      "I reviewed the complete text and accept the listed uncertainty",
    )
    .check();
  await page.getByRole("button", { name: "Confirm preview" }).click();
  await expect(page.getByLabel("Terminal command")).toHaveValue(
    /^threadport continue --handoff [0-9a-f-]{36}$/,
  );
  const command = await page.getByLabel("Terminal command").inputValue(),
    id = command.split(" ").at(-1)!;
  const handoff = (await api("/handoffs/" + id)).data;
  expect(handoff.attempts).toEqual([]);
  expect(await prompt.textContent()).toBe(handoff.handoff.prompt);
  expect(handoff.handoff.mode).toBe("native-resume");
  if (process.env.THREADPORT_UI_SCREENSHOTS)
    await page.screenshot({
      path: "output/playwright/t15-handoff.png",
      fullPage: true,
      mask: [page.getByLabel("Workspace", { exact: true })],
    });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Markdown" }).click();
  const file = await download;
  const stream = await file.createReadStream();
  let bytes = "";
  for await (const chunk of stream!) bytes += chunk.toString();
  expect(bytes).toBe(handoff.handoff.prompt);
  await page.getByLabel("Target Agent").selectOption("codex");
  await expect(page.getByLabel("Terminal command")).toHaveCount(0);
  await page.getByRole("button", { name: "Prepare preview" }).click();
  await expect(page.getByText("Export only", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm preview" }),
  ).toBeDisabled();
  await page.getByLabel("Target Agent").selectOption("claude");
  await page.getByRole("button", { name: "Prepare preview" }).click();
  await expect(prompt).toBeVisible();
  await writeFile(join(base, "project", "README.md"), "Changed after preview");
  await page
    .getByLabel(
      "I reviewed the complete text and accept the listed uncertainty",
    )
    .check();
  await page.getByRole("button", { name: "Confirm preview" }).click();
  await expect(page.getByRole("alert")).toContainText("changed");
  await expect(page.getByLabel("Terminal command")).toHaveCount(0);
  await page.getByRole("button", { name: "Prepare preview" }).click();
  await expect(prompt).toBeVisible();
  await page.clock.install();
  await page.clock.fastForward(16 * 60 * 1000);
  await expect(page.getByRole("alert")).toContainText("expired");
  await expect(
    page.getByRole("button", { name: "Confirm preview" }),
  ).toBeDisabled();
});
test("requires a second save after credential redaction and preserves failed drafts", async ({
  page,
}) => {
  await page.goto(server.origin + "/?v=inbox&t=" + taskId);
  await page.evaluate((token) => {
    history.replaceState(null, "", location.search + "#token=" + token);
    location.reload();
  }, server.token);
  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  await page
    .getByLabel("Objective", { exact: true })
    .fill("secret=abcdefghijklmnop");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Credentials were removed",
  );
  await expect(page.getByLabel("Objective", { exact: true })).not.toHaveValue(
    /abcdefghijklmnop/,
  );
  const before = (await api("/tasks/" + taskId)).data.task.revision;
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = (await api("/tasks/" + taskId)).data.task;
  expect(saved.revision).toBe(before + 1);
  expect(saved.objective.text).not.toContain("abcdefghijklmnop");
});
