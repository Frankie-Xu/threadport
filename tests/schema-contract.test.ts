import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { describe, it, expect } from 'vitest';
import { capsuleSchema } from '../src/capsule.js';
import { createHandoff, handoffSchema } from '../src/handoff.js';
import example from '../examples/capsule-v1.json' with { type: 'json' };

describe('wire and TypeScript schema parity', () => {
  it('accepts and rejects the same Capsule and envelope corpus', async () => {
    const ajv = new Ajv2020({ allErrors: true });
    (addFormatsModule as unknown as (ajv: Ajv2020) => void)(ajv);
    const wire = JSON.parse(await readFile(resolve('schema/capsule-v1.schema.json'), 'utf8'));
    ajv.addSchema(wire);
    const capsuleWire = ajv.getSchema(wire.$id)!;
    const corpus = [example, { ...example, extra: true }, { ...example, id: '../bad' }, { ...example, git: { ...example.git, head: 'A'.repeat(40) } }, { ...example, git: { ...example.git, dirty_diff_hash: 'A'.repeat(64) } }, { ...example, created_at: 'not-a-date' }];
    for (const value of corpus) expect(Boolean(capsuleWire(value))).toBe(capsuleSchema.safeParse(value).success);
    const envelopeWire = ajv.compile(JSON.parse(await readFile(resolve('schema/handoff-v1.schema.json'), 'utf8')));
    const envelope = createHandoff(capsuleSchema.parse(example), 'claude');
    for (const value of [envelope, { ...envelope, protocol: 'v2' }, { ...envelope, target_agent: 'unknown' }, { ...envelope, safety: { execute_commands: true, modify_workspace: false } }, { ...envelope, extra: true }]) {
      expect(Boolean(envelopeWire(value))).toBe(handoffSchema.safeParse(value).success);
    }
  });
});
