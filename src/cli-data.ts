import { resolve } from "node:path";
import { openStore } from "./storage/sqlite-store.js";
import { diagnostics } from "./diagnostics/service.js";
import { IndexService } from "./indexing/service.js";
import type { CliIo } from "./cli.js";
import { DomainError } from "./domain/errors.js";
/** Strict new-data commands; errors never echo input paths or source contents. */
export async function runDataCommand(
  command: "doctor" | "index",
  args: string[],
  io: CliIo,
): Promise<number> {
  let dataDir: string | undefined,
    source: string | undefined,
    json = false;
  const seen = new Set<string>();
  try {
    for (let i = 0; i < args.length; i++) {
      const key = args[i];
      if (seen.has(key)) throw new Error();
      seen.add(key);
      if (key === "--json" && command === "doctor") {
        json = true;
        continue;
      }
      if (
        !["--data-dir", ...(command === "index" ? ["--source"] : [])].includes(
          key,
        ) ||
        !args[i + 1] ||
        args[i + 1].startsWith("--")
      )
        throw new Error();
      const value = args[++i];
      if (key === "--data-dir") dataDir = resolve(io.cwd(), value);
      else source = value;
    }
    if (command === "index" && !source) throw new Error();
  } catch {
    io.stderr.write("Invalid local data command arguments.\n");
    return 2;
  }
  const cancel = () => {
    if (source) index?.cancel(source);
  };
  let store: Awaited<ReturnType<typeof openStore>> | undefined,
    index: IndexService | undefined;
  try {
    store = await openStore({ dataDir });
    if (command === "doctor") {
      const result = diagnostics(store);
      io.stdout.write(
        json
          ? JSON.stringify(result, null, 2) + "\n"
          : `ThreadPort ${result.version} · ${result.os}/${result.arch}\nSources: ${result.counts.sources}; sessions: ${result.counts.sessions}; events: ${result.counts.events}; tasks: ${result.counts.tasks}\nNo logs, private paths or environment values are included.\n`,
      );
      return 0;
    }
    const configured=store.getSource(source!);
    if(!configured?.enabled)throw new DomainError("INVALID_INPUT","Choose an enabled configured source.");
    index = new IndexService(store);
    process.once("SIGINT", cancel);
    const result = await index.refresh(source!);
    io.stdout.write(JSON.stringify(result) + "\n");
    return result.state === "completed"
      ? 0
      : result.state === "cancelled"
        ? 130
        : result.state === "busy"
          ? 4
          : 5;
  } catch (error) {
    io.stderr.write(
      "Local data operation failed; existing data was retained.\n",
    );
    return error instanceof DomainError && error.code === "INVALID_INPUT"
      ? 2
      : 5;
  } finally {
    process.removeListener("SIGINT", cancel);
    await index?.stop();
    store?.close();
  }
}
