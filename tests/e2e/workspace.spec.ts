import { test, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { startLocalServer } from "../../dist/src/server/app.js";
let server: Awaited<ReturnType<typeof startLocalServer>>,
  base: string,
  root: string,
  logs: string;
test.beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "threadport-ui-")));
  root = join(base, "project with spaces");
  logs = join(base, "logs");
  await mkdir(root);
  await mkdir(logs);
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
  git("init", "-b", "main");
  git("config", "user.name", "Synthetic");
  git("config", "user.email", "test@example.invalid");
  await writeFile(join(root, "README.md"), "Synthetic UI project");
  git("add", ".");
  git("commit", "-m", "initial");
  await writeFile(
    join(logs, "session.jsonl"),
    JSON.stringify({
      type: "user",
      sessionId: "synthetic-ui",
      message: { role: "user", content: "中文 UI evidence for task lookup" },
    }) + "\n",
  );
  server = await startLocalServer({ dataDir: join(base, "data") });
});
test.afterAll(async () => {
  await server?.close();
  if (base) await rm(base, { recursive: true, force: true });
});
test("configures only explicit sources, creates a task, finds Unicode history and recovers after refresh", async ({
  page,
}) => {
  let externalRequests=0;
  await page.route("**/*",route=>{if(new URL(route.request().url()).origin===server.origin)return route.continue();externalRequests++;return route.abort();});
  await page.goto(server.origin);
  await page.evaluate((token) => {
    history.replaceState(null, "", "#token=" + token);
    location.reload();
  }, server.token);
  await expect(
    page.getByRole("heading", { name: "Start with a workspace" }),
  ).toBeVisible();
  await page.getByLabel("Workspace directory").fill(root);
  await page
    .getByRole("button", { name: "Add workspace", exact: true })
    .click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel("Source directory").fill(logs);
  await page.getByRole("button", { name: "Add and index source" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Index completed" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await page
    .getByRole("button", { name: "Create task from session" })
    .first()
    .click();
  await page
    .getByLabel("Task title")
    .fill("中文任务 <img src=x onerror=window.injected=1>");
  await page
    .getByRole("button", { name: "Create task", exact: true })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect(
    page.getByRole("heading", {
      name: "中文任务 <img src=x onerror=window.injected=1>",
    }),
  ).toBeVisible();
  const tasks = await fetch(server.origin + "/api/v1/tasks", {
    headers: { authorization: "Bearer " + server.token },
  });
  expect((await tasks.json()).data).toHaveLength(1);
  expect(
    await page.evaluate(() => Reflect.get(window, "injected")),
  ).toBeUndefined();
  await page.getByRole("searchbox", { name: "Search history" }).fill("中文");
  await page.getByRole("searchbox", { name: "Search history" }).press("Enter");
  await expect(
    page.getByText("中文 UI evidence for task lookup"),
  ).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe("");
  expect(
    await page.evaluate(() => [
      Object.keys(localStorage),
      Object.keys(sessionStorage),
    ]),
  ).toEqual([[], []]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Reconnect to your terminal" }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("q")).toBe("中文");
  await page
    .getByLabel("Current terminal link")
    .fill(server.origin + "/#token=" + server.token);
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(
    page.getByText("中文 UI evidence for task lookup"),
  ).toBeVisible();
  for (const width of [1280, 1440, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    if (process.env.THREADPORT_UI_SCREENSHOTS)
      await page.screenshot({
        path: "output/playwright/t15-history-" + width + ".png",
        fullPage: true,
      });
  }
  await page.keyboard.press("ControlOrMeta+k");
  await expect(
    page.getByRole("searchbox", { name: "Search history" }),
  ).toBeFocused();
  expect(externalRequests).toBe(0);
});
