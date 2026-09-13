import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { writeArtifact } from '../src/storage.js';
import { temporary } from './helpers.js';

describe('artifact publication', () => {
  it('allows only one concurrent writer without force', async () => {
    const path = join(await temporary(), 'capsule.json');
    const results = await Promise.allSettled([writeArtifact(path, 'first', false), writeArtifact(path, 'second', false)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(['first', 'second']).toContain(await readFile(path, 'utf8'));
  });
  it('does not overwrite without force and permits explicit replacement', async () => {
    const path = join(await temporary(), 'capsule.json');
    await writeArtifact(path, 'old', false);
    await expect(writeArtifact(path, 'new', false)).rejects.toThrow(/overwrite/i);
    expect(await readFile(path, 'utf8')).toBe('old');
    await writeArtifact(path, 'new', true);
    expect(await readFile(path, 'utf8')).toBe('new');
  });
  it('refuses non-file destinations even with force', async () => {
    const path = join(await temporary(), 'directory'); await mkdir(path);
    await expect(writeArtifact(path, 'data', true)).rejects.toThrow(/regular file/i);
  });
});
