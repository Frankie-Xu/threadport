import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLocalServer } from "../../dist/src/server/app.js";
let server: Awaited<ReturnType<typeof startLocalServer>>;
let base: string;
let taskId: string;
test.beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "threadport-recovery-"));
  server = await startLocalServer({ dataDir: join(base, "data") });
  const post = async (path: string, body: unknown) => (await fetch(server.origin + "/api/v1" + path, {
    method: "POST", headers: { authorization: "Bearer " + server.token, "content-type": "application/json" }, body: JSON.stringify(body),
  })).json();
  const workspace = await post("/workspaces", { root: base, confirmBinding: true });
  taskId = (await post("/tasks", { projectId: workspace.data.projectId, title: "Recovery task" })).data.id;
});
test.afterAll(async () => { await server?.close(); if (base) await rm(base, { recursive: true, force: true }); });

test("failed saves preserve long drafts, focus the error, and allow keyboard retry", async ({ page }) => {
  await page.goto(server.origin + "/?v=inbox&t=" + taskId + "#token=" + server.token);
  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  const draft = "A long objective with explicit constraints. ".repeat(100);
  await page.getByLabel("Objective", { exact: true }).fill(draft);
  let fail = true;
  await page.route("**/api/v1/tasks/" + taskId, async route => {
    if (route.request().method() === "PATCH" && fail) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "STORAGE_BUSY", message: "opaque server detail", recovery: "not-a-real-action" } }) });
    return route.continue();
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(page.getByRole("alert")).toContainText("Another operation is writing local data");
  await expect(page.getByLabel("Objective", { exact: true })).toHaveValue(draft);
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Save changes" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  await expect(page.getByLabel("Objective", { exact: true })).toHaveValue(draft);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Edit task", exact: true })).toBeFocused();
});

test("authentication recovery keeps the editor and unsaved text mounted", async ({ page }) => {
  await page.goto(server.origin + "/?v=inbox&t=" + taskId + "#token=" + server.token);
  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  await page.getByLabel("Objective", { exact: true }).fill("Unsaved authentication recovery draft");
  let fail = true;
  await page.route("**/api/v1/tasks/" + taskId, async route => {
    if (route.request().method() === "PATCH" && fail) return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAUTHORIZED", recovery: "reconnect" } }) });
    return route.continue();
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByLabel("Current terminal link").fill(server.origin + "/#token=" + server.token);
  fail = false;
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit task", exact: true })).toBeVisible();
  await expect(page.getByLabel("Objective", { exact: true })).toHaveValue("Unsaved authentication recovery draft");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("export preview failure is recoverable without a misleading reconnect action", async ({ page }) => {
  await page.goto(server.origin + "/?v=inbox&t=" + taskId + "#token=" + server.token);
  await page.route("**/api/v1/exports/preview", route => route.abort());
  await page.getByRole("button", { name: "Export task", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("local service is unavailable");
  await expect(page.getByRole("button", { name: "Reconnect", exact: true })).toHaveCount(0);
  await page.unroute("**/api/v1/exports/preview");
  await page.getByRole("button", { name: "Refresh export preview" }).click();
  await expect(page.getByLabel("Export content")).toContainText("Recovery task");
});
