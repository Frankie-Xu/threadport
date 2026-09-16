import { expect,it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { protectCapsule } from '../src/privacy.js';
import type { Capsule } from '../src/types.js';
it('preserves the redacted-command failure boundary and labels altered actions as non-executable review text',async()=>{
 const capsule=JSON.parse(await readFile(new URL('../examples/capsule-v1.json',import.meta.url),'utf8')) as Capsule;
 capsule.commands=[{command:'/private/toolchain/node --test tests/unit.test.js',exit_code:127,summary:'First attempt failed'}];capsule.next_action='/private/toolchain/node --test tests/unit.test.js';
 const result=protectCapsule(capsule,'portable',['/project']);
 expect(result.commands[0].command).toContain('external/');expect(result.commands[0].exit_code).toBe(127);
 expect(result.commands[0].summary).toContain('not directly executable');expect(result.next_action).toContain('Confirm a portable replacement');
 expect(protectCapsule(result,'portable',['/project']).next_action).toBe(result.next_action);
});
