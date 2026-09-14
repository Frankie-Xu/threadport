import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, appendFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { openStore, type SqliteStore } from "../../src/storage/sqlite-store.js";
import { IndexService } from "../../src/indexing/service.js";
import { createSourceRegistry } from "../../src/sources/registry.js";
const dirs: string[] = [],
  stores: SqliteStore[] = [],
  services: IndexService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.stop();
  for (const store of stores.splice(0)) store.close();
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});
const row = (text: string) =>
  JSON.stringify({
    type: "user",
    sessionId: "synthetic",
    message: { content: text },
  }) + "\n";
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "tp-capacity-"));
  dirs.push(dir);
  const root = join(dir, "logs");
  await mkdir(root);
  const path = join(root, "session.jsonl"),
    dataDir = join(dir, "data"),
    store = await openStore({ dataDir });
  stores.push(store);
  store.saveSource({
    id: "source",
    agent: "claude",
    roots: [root],
    enabled: true,
    parserVersion: "claude-jsonl-v1",
  });
  return { root, path, dataDir, store };
}
it("accepts exactly 1 GiB of indexed offsets and atomically rejects the next page", async () => {
  const { store, path, dataDir } = await setup();
  const first = row("Within limit");
  await writeFile(path, first);
  const seed = new Database(join(dataDir, "threadport.sqlite"));
  try {
    seed
      .prepare("INSERT INTO sessions(id,metadata_json) VALUES('capacity','{}')")
      .run();
    seed
      .prepare(
        "INSERT INTO source_cursors(session_id,file_identity,byte_offset,parser_version,cursor_json) VALUES('capacity','seed',?,'seed','{}')",
      )
      .run(1024 ** 3 - Buffer.byteLength(first));
    const index = new IndexService(store);
    services.push(index);
    expect((await index.refresh("source")).state).toBe("completed");
    expect(store.statusCounts().indexedBytes).toBe(1024 ** 3);
    const session = store.listIndexedSessions("source")[0],
      cursor = store.getIndexedSession("source", session.sourcePath)?.cursor;
    await appendFile(path, row("Over limit"));
    const result = await index.refresh("source");
    expect(result.state).toBe("failed");
    expect(result.warnings).toContain("INDEX_LIMIT");
    expect(
      store.getIndexedSession("source", session.sourcePath)?.cursor,
    ).toEqual(cursor);
    expect(store.listEvents(session.id).map((e) => e.text)).toEqual([
      "Within limit",
    ]);
    expect(store.statusCounts().indexedBytes).toBe(1024 ** 3);
  } finally {
    seed.close();
  }
});
it("cancels after the current bounded batch, starts no further reads and resumes without duplicates", async () => {
  const { store, path, root } = await setup();
  await writeFile(
    path,
    Array.from({ length: 1000 }, (_, i) =>
      row("中文 bounded " + i + " " + "x".repeat(3000)),
    ).join(""),
  );
  const adapter = createSourceRegistry([
    { sourceId: "source", agent: "claude", roots: [root] },
  ]).get("source")!;
  let reads = 0,
    readsAtCancel = 0,
    cancelAt = 0,
    cancelled = false;
  const index = new IndexService(store, {
    adapterFactory: () => ({
      ...adapter,
      read: (input) => {
        reads++;
        return adapter.read(input);
      },
    }),
    onProgress: (progress) => {
      if (!cancelled && progress.events >= 100) {
        cancelled = true;
        readsAtCancel = reads;
        cancelAt = performance.now();
        index.cancel("source");
      }
    },
  });
  services.push(index);
  const result = await index.refresh("source");
  expect(result.state).toBe("cancelled");
  expect(performance.now() - cancelAt).toBeLessThan(2000);
  expect(reads).toBe(readsAtCancel);
  expect(readsAtCancel).toBeGreaterThan(0);
  const session = store.listIndexedSessions("source")[0];
  expect(store.listEvents(session.id, 1000)).toHaveLength(readsAtCancel);
  expect(readsAtCancel).toBeGreaterThanOrEqual(100);
  expect(readsAtCancel).toBeLessThan(200);
  expect((await index.refresh("source")).state).toBe("completed");
  expect(store.listEvents(session.id, 1000)).toHaveLength(1000);
}, 30000);
