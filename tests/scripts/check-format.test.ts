import { mkdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { checkFormat } from '../../scripts/check-format.mjs';
import { temporary } from '../helpers.js';

describe('format gate', () => {
  it('reports trailing whitespace and carriage returns with file locations', async () => {
    const root = await temporary();
    await mkdir(`${root}/src`, { recursive: true });
    await writeFile(`${root}/src/bad.ts`, 'const value = 1;  \nconst other = 2;\r\n');

    await expect(checkFormat(root, ['src'])).resolves.toEqual([
      `${root}/src/bad.ts:1: trailing whitespace`,
      `${root}/src/bad.ts:2: carriage return`,
    ]);
  });

  it('accepts clean files and ignores missing roots', async () => {
    const root = await temporary();
    await mkdir(`${root}/src`, { recursive: true });
    await writeFile(`${root}/src/clean.ts`, 'const value = 1;\n');

    await expect(checkFormat(root, ['src', 'missing'])).resolves.toEqual([]);
  });
});
