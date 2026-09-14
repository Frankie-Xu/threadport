import { afterEach, expect, it } from "vitest";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import Database from "better-sqlite3";
import { temporary } from "../helpers.js";
import { openStore, type SqliteStore } from "../../src/storage/sqlite-store.js";
import { IndexService } from "../../src/indexing/service.js";
import { TaskService } from "../../src/tasks/service.js";
const stores: SqliteStore[] = [],
  indexes: IndexService[] = [];
afterEach(async () => {
  for (const index of indexes.splice(0)) await index.stop();
  for (const store of stores.splice(0)) store.close();
});
it("clears cached evidence, preserves manual revisions and links, and rebuilds the same IDs", async () => {
  const dataDir = await temporary(),
    root = await temporary(),
    path = join(root, "session.jsonl");
  const text =
    JSON.stringify({
      type: "user",
      sessionId: "synthetic",
      message: { content: "Historical observation" },
    }) + "\n";
  await writeFile(path, text);
  const store = await openStore({ dataDir });
  stores.push(store);
  const source = {
    id: "source",
    agent: "claude" as const,
    roots: [root],
    enabled: true,
    parserVersion: "claude-jsonl-v1",
  };
  store.saveSource(source);
  const index = new IndexService(store);
  indexes.push(index);
  expect((await index.refresh("source")).state).toBe("completed");
  const session = store.listIndexedSessions("source")[0],
    events = store.listEvents(session.id);
  store.createProject("project", "Project");
  store.bindSession(session.id, "project", null);
  const tasks = new TaskService(store),
    task = await tasks.create({ projectId: "project", title: "Manual task" });
  await tasks.attachSession(task.id, session.id, task.revision);
  const before = store.getTask(task.id),
    revisions = store.getRevisions(task.id);
  await index.pause();
  expect(() => store.maintenance().clearIndex()).not.toThrow();
  expect(store.statusCounts().events).toBe(0);
  expect(store.getSource("source")?.enabled).toBe(false);
  expect(store.getTask(task.id)).toEqual(before);
  expect(store.getRevisions(task.id)).toEqual(revisions);
  expect(store.sessionIds(task.id)).toEqual([session.id]);
  expect(store.listIndexedSessions("source")[0].status).toBe("missing");
  await expect(index.refresh("source")).rejects.toMatchObject({
    code: "STORAGE_BUSY",
  });
  index.resume();
  store.saveSource(source);
  expect((await index.refresh("source")).state).toBe("completed");
  expect(store.listEvents(session.id)).toEqual(events);
  expect(store.sessionIds(task.id)).toEqual([session.id]);
  expect(await readFile(path, "utf8")).toBe(text);
}, 30000);
it("refuses clearing while another process owns an index lease without deleting data", async () => {
  const store = await openStore({ dataDir: await temporary() });
  stores.push(store);
  store.saveSource({
    id: "source",
    agent: "claude",
    roots: [await temporary()],
    enabled: true,
    parserVersion: "v1",
  });
  expect(store.acquireIndexLease("source", "other")).toBe(true);
  expect(() => store.maintenance().clearIndex()).toThrow(
    expect.objectContaining({ code: "STORAGE_BUSY" }),
  );
  expect(store.getSource("source")?.enabled).toBe(true);
});
it("ages payloads and finished summaries separately, protects active packages, and forbids replay", async () => {
  const dataDir = await temporary(),
    store = await openStore({ dataDir });
  stores.push(store);
  store.createProject("project", "Project");
  const task = await new TaskService(store).create({
    projectId: "project",
    title: "Manual task",
  });
  const db = new Database(join(dataDir, "threadport.sqlite"));
  db.pragma("foreign_keys=ON");
  const now = Date.parse("2026-09-15T00:00:00.000Z"),
    old = "2026-08-01T00:00:00.000Z",
    recent = "2026-09-14T00:00:00.000Z",
    eightDays = "2026-09-07T00:00:00.000Z";
  try {
    const insert = db.prepare("INSERT INTO handoffs VALUES(?,?,?,?,?,?,?)");
    for (const [id, state, created] of [
      ["old", "exited", old],
      ["summary", "exited", eightDays],
      ["active", "launching", old],
      ["recent", "prepared", recent],
    ])
      insert.run(
        id,
        task.id,
        1,
        "digest",
        old,
        JSON.stringify({
          handoff: { createdAt: created },
          approval: { secret: "private" },
        }),
        state,
      );
    const attempt = db.prepare(
      "INSERT INTO launch_attempts VALUES(?,?,?,?,?,?)",
    );
    attempt.run("a", "old", "exited", old, old, null);
    attempt.run("b", "summary", "exited", eightDays, eightDays, null);
    attempt.run("c", "active", "launching", old, null, null);
    expect(store.maintenance().prune(now)).toMatchObject({
      attemptsRemoved: 1,
      payloadsRemoved: 2,
      handoffsRemoved: 1,
    });
    expect(
      db
        .prepare("SELECT body_json FROM handoffs WHERE id=?")
        .pluck()
        .get("summary"),
    ).toBe("{}");
    expect(() => store.handoffStore().read("summary")).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect(() => store.launchStore().claim("summary", "digest")).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect(store.launchStore().attempts("summary")).toHaveLength(1);
    expect(
      db.prepare("SELECT state FROM handoffs WHERE id=?").pluck().get("active"),
    ).toBe("launching");
    expect(
      db
        .prepare("SELECT body_json FROM handoffs WHERE id=?")
        .pluck()
        .get("active"),
    ).toContain("private");
    expect(() => store.maintenance().clearIndex()).toThrow(
      expect.objectContaining({ code: "STORAGE_BUSY" }),
    );
    expect(store.getTask(task.id)).toEqual(task);
  } finally {
    db.close();
  }
});

it("requires explicit clear confirmation through the authenticated API", async () => {
  const { startLocalServer } = await import("../../src/server/app.js");
  const dataDir = await temporary(),
    server = await startLocalServer({ dataDir });
  try {
    const send = (body: unknown) =>
      fetch(server.origin + "/api/v1/data/clear-index", {
        method: "POST",
        headers: {
          authorization: "Bearer " + server.token,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    expect((await send({ confirmation: false })).status).toBe(400);
    expect((await send({ confirmation: true, unexpected: true })).status).toBe(
      400,
    );
    const response = await send({ confirmation: true });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      eventsRemoved: 0,
      sourcesPaused: 0,
    });
  } finally {
    await server.close();
  }
});
