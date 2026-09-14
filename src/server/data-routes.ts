import type { IndexService } from '../indexing/service.js';
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createHash } from "node:crypto";
import { join, isAbsolute } from "node:path";
import type { SqliteStore } from "../storage/sqlite-store.js";
import { TaskService } from "../tasks/service.js";
import { exportTask } from "../tasks/export.js";
import { HandoffService } from "../handoff/prepare.js";
import { exportHandoff } from "../handoff/export.js";
import { diagnostics } from "../diagnostics/service.js";
import { atomicWrite } from "../platform/atomic-write.js";
import { DomainError } from "../domain/errors.js";
const choice = z
  .object({
    kind: z.enum(["task", "handoff"]),
    id: z.string().uuid(),
    format: z.enum(["markdown", "json"]),
  })
  .strict();
export async function exportPreview(
  store: SqliteStore,
  input: z.infer<typeof choice>,
) {
  const value = choice.parse(input);
  let text: string, fileName: string;
  if (value.kind === "task") {
    if (value.format !== "markdown")
      throw new DomainError("INVALID_INPUT", "Task export uses Markdown.");
    const detail = await new TaskService(store).detail(value.id);
    text = exportTask(detail);
    fileName = `task-${value.id}-r${detail.task.revision}.md`;
  } else {
    const handoff = new HandoffService(store).get(value.id).handoff;
    text = exportHandoff(handoff, value.format);
    fileName = `handoff-${value.id}.${value.format === "json" ? "json" : "md"}`;
  }
  return {
    text,
    fileName,
    digest: createHash("sha256").update(text).digest("hex"),
  };
}
export function registerDataRoutes(
  app: FastifyInstance,
  store: SqliteStore,
  dataDir: string,
  indexer: IndexService,
) {
  let maintaining=false;
  app.post('/api/v1/data/clear-index', async request=>{
    z.object({confirmation:z.literal(true)}).strict().parse(request.body);
    if(maintaining)throw new DomainError('STORAGE_BUSY','Maintenance is in progress.');
    maintaining=true;
    try{await indexer.pause();return{data:store.maintenance().clearIndex()};}
    finally{maintaining=false;indexer.resume();}
  });
  app.post('/api/v1/data/prune',async request=>{
    z.object({confirmation:z.literal(true)}).strict().parse(request.body);
    return{data:store.maintenance().prune()};
  });
  app.get("/api/v1/diagnostics", async (request) => {
    z.object({}).strict().parse(request.query);
    return { data: diagnostics(store) };
  });
  app.get("/api/v1/settings", async (request) => {
    z.object({}).strict().parse(request.query);
    return { data: { dataDir } };
  });
  app.post("/api/v1/exports/preview", async (request) => ({
    data: await exportPreview(store, choice.parse(request.body)),
  }));
  app.post("/api/v1/exports", async (request) => {
    const input = choice
      .extend({
        directory: z.string().min(1).max(32768),
        expectedDigest: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .strict()
      .parse(request.body);
    if (!isAbsolute(input.directory))
      throw new DomainError(
        "INVALID_INPUT",
        "Choose an absolute export directory.",
      );
    const preview = await exportPreview(store, {
      kind: input.kind,
      id: input.id,
      format: input.format,
    });
    if (preview.digest !== input.expectedDigest)
      throw new DomainError(
        "REVISION_CONFLICT",
        "Export changed; preview again.",
      );
    await atomicWrite(join(input.directory, preview.fileName), preview.text);
    return { data: { fileName: preview.fileName, digest: preview.digest } };
  });
}
