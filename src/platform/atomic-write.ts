import { open, link, unlink, lstat, realpath } from "node:fs/promises";
import { dirname, join, basename, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { DomainError } from "../domain/errors.js";
/** Publish a complete private file without replacing an existing destination, including concurrent writers. */
export async function atomicWrite(path: string, text: string): Promise<void> {
  if (
    !isAbsolute(path) ||
    !basename(path) ||
    basename(path) === "." ||
    basename(path) === ".."
  )
    throw new DomainError("INVALID_INPUT", "Choose an absolute output file.");
  let temporary: string | undefined;
  try {
    const parent = dirname(path),
      info = await lstat(parent);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new DomainError(
        "INVALID_INPUT",
        "Choose an existing physical export directory.",
      );
    const canonical = await realpath(parent),
      destination = join(canonical, basename(path));
    temporary = join(canonical, ".threadport-export-" + randomUUID() + ".tmp");
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(text, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await link(temporary, destination);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError(
      (error as NodeJS.ErrnoException).code === "EEXIST"
        ? "REVISION_CONFLICT"
        : "IO_FAILED",
      (error as NodeJS.ErrnoException).code === "EEXIST"
        ? "The destination already exists; choose another directory."
        : "Export failed; existing files were retained.",
    );
  } finally {
    if (temporary)
      await unlink(temporary).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT")
          throw new DomainError(
            "IO_FAILED",
            "Export cleanup failed; inspect the selected directory.",
          );
      });
  }
}
