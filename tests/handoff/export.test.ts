import { afterEach, expect, it, vi } from "vitest";
const fault = vi.hoisted(() => ({ write: false, publish: false }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...real,
    open: async (...args: Parameters<typeof real.open>) => {
      const handle = await real.open(...args);
      if (!fault.write) return handle;
      handle.writeFile = async () => {
        throw Object.assign(new Error("synthetic disk full"), {
          code: "ENOSPC",
        });
      };
      return handle;
    },
    link: async (...args: Parameters<typeof real.link>) => {
      if (fault.publish)
        throw Object.assign(new Error("synthetic disk full"), {
          code: "ENOSPC",
        });
      return real.link(...args);
    },
  };
});
afterEach(() => {
  fault.write = false;
  fault.publish = false;
});
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite } from "../../src/platform/atomic-write.js";
import { temporary } from "../helpers.js";
it("publishes one complete export under concurrent writers and preserves the winning bytes", async () => {
  const dir = await temporary(),
    path = join(dir, "export.md");
  const results = await Promise.allSettled([
    atomicWrite(path, "first"),
    atomicWrite(path, "second"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(["first", "second"]).toContain(await readFile(path, "utf8"));
  expect(await readdir(dir)).toEqual(["export.md"]);
});
it("fails safely for an invalid destination and leaves an existing file intact", async () => {
  const dir = await temporary(),
    path = join(dir, "export.md");
  await writeFile(path, "original");
  await expect(atomicWrite(path, "replacement")).rejects.toMatchObject({
    code: "REVISION_CONFLICT",
  });
  expect(await readFile(path, "utf8")).toBe("original");
  await expect(
    atomicWrite(join(dir, "missing", "x.md"), "partial"),
  ).rejects.toMatchObject({ code: "IO_FAILED" });
  expect(await readdir(dir)).toEqual(["export.md"]);
});

it.each(["write", "publish"] as const)(
  "cleans partial export after %s disk failure",
  async (phase) => {
    const dir = await temporary();
    fault[phase] = true;
    await expect(
      atomicWrite(join(dir, "export.md"), "complete metadata"),
    ).rejects.toMatchObject({ code: "IO_FAILED" });
    expect(await readdir(dir)).toEqual([]);
  },
);
