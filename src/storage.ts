import { link, lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

function code(error: unknown): string | undefined { return (error as NodeJS.ErrnoException)?.code; }
export async function assertDestination(path: string, force: boolean): Promise<void> {
  try {
    const info = await lstat(path);
    if (!info.isFile()) throw new Error(`Destination must be a regular file: ${path}`);
  } catch (error) {
    if (code(error) === 'ENOENT') return;
    throw error;
  }
  if (!force) throw new Error(`Refusing to overwrite ${path} without --force.`);
}

/** Complete-file publication, atomic no-clobber by default. No shell commands. */
export async function writeArtifact(path: string, content: string, force: boolean): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await assertDestination(path, force);
  const temporary = join(dirname(path), `.threadport-${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
    if (force) {
      await assertDestination(path, true);
      await rename(temporary, path);
    } else {
      try { await link(temporary, path); }
      catch (error) {
        if (code(error) === 'EEXIST') throw new Error(`Refusing to overwrite ${path} without --force.`);
        throw error;
      }
    }
  } finally {
    await unlink(temporary).catch(error => { if (code(error) !== 'ENOENT') throw error; });
  }
}
