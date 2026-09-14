import { test, expect } from "@playwright/test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLocalServer } from "../../dist/src/server/app.js";
let server: Awaited<ReturnType<typeof startLocalServer>>,
  base: string,
  taskId: string;
test.beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "threadport-data-ui-"));
  server = await startLocalServer({ dataDir: join(base, "data") });
  const api = async (path: string, body: unknown) => {
    const response = await fetch(server.origin + "/api/v1" + path, {
      method: "POST",
      headers: {
        authorization: "Bearer " + server.token,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return response.json();
  };
  const workspace = await api("/workspaces", {
    root: base,
    confirmBinding: true,
  });
  taskId = (
    await api("/tasks", {
      projectId: workspace.data.projectId,
      title: "Synthetic export task",
    })
  ).data.id;
});
test.afterAll(async () => {
  await server?.close();
  if (base) await rm(base, { recursive: true, force: true });
});
test("previews safe diagnostics and explicitly writes reviewed metadata to a selected directory", async ({
  page,
}) => {
  await page.goto(server.origin + "/?v=inbox&t=" + taskId);
  await page.evaluate((token) => {
    history.replaceState(null, "", location.search + "#token=" + token);
    location.reload();
  }, server.token);
  await page.getByRole("button", { name: "Export task", exact: true }).click();
  await expect(page.getByLabel("Export content")).toContainText(
    "Synthetic export task",
  );
  await page.getByLabel("Export directory").fill(base);
  await expect(
    page.getByRole("button", { name: "Write export" }),
  ).toBeDisabled();
  await page.getByLabel("I reviewed this metadata export").check();
  await page.getByRole("button", { name: "Write export" }).click();
  await expect(page.getByRole("status")).toContainText("Export saved");
  const text = await readFile(join(base, "task-" + taskId + "-r1.md"), "utf8");
  expect(text).toContain("Origin: unknown");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Preview diagnostics" }).click();
  const report = await page.getByLabel("Diagnostic content").textContent();
  expect(report).not.toContain(base);
  expect(report).not.toContain(server.token);
  expect(report).not.toContain("Synthetic export task");
  expect(JSON.parse(report!).counts.tasks).toBe(1);
  if(process.env.THREADPORT_UI_SCREENSHOTS)await page.screenshot({path:"output/playwright/t17-diagnostics.png",mask:[page.locator(".path")]});
});

test("cancels index clearing without side effects and explicitly confirms cache removal", async ({
  page,
}) => {
  await page.goto(server.origin + "/?v=settings#token=" + server.token);
  await page.getByRole("button", { name: "Clear cached index…" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm clear index" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear cached index…" }).click();
  await page
    .getByLabel(
      "I understand that imported evidence will be unavailable until rebuilt",
    )
    .check();
  await page.getByRole("button", { name: "Confirm clear index" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/Removed 0 cached events/)).toBeVisible();
  const response = await fetch(server.origin + "/api/v1/tasks/" + taskId, {
    headers: { authorization: "Bearer " + server.token },
  });
  expect((await response.json()).data.task.title).toBe("Synthetic export task");
});

test("requires the deletion phrase and stops after removing only application data", async ({
  page,
}) => {
  const own = await mkdtemp(join(tmpdir(), "threadport-delete-ui-")),
    local = await startLocalServer({ dataDir: join(own, "data") });
  try {
    await page.goto(local.origin + "/?v=settings#token=" + local.token);
    await page.getByRole("button", { name: "Delete local data…" }).click();
    await expect(
      page.getByRole("button", { name: "Delete and stop service" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Delete local data…" }).click();
    await page.getByLabel("Deletion confirmation").fill("DELETE LOCAL DATA");
    if(process.env.THREADPORT_UI_SCREENSHOTS)await page.getByRole("dialog").screenshot({path:"output/playwright/t17-delete.png"});
    await page.getByRole("button", { name: "Delete and stop service" }).click();
    await expect(
      page.getByText(/Local data deleted. The service has stopped./),
    ).toBeVisible();
    await local.closed;
  } finally {
    await local.close();
    await rm(own, { recursive: true, force: true });
  }
});
