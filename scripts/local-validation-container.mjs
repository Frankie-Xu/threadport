import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const source = '/source';
const work = '/tmp/threadport-validation';
await mkdir(work, { recursive: true });
await cp(source, work, { recursive: true, filter: (path) => !path.includes('/node_modules/') && !path.includes('/output/') && !path.includes('/dist/') });
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npm, ['ci', '--ignore-scripts'], { cwd: work, stdio: 'inherit' });
const code = await new Promise(resolve => child.once('close', value => resolve(value ?? 1)));
if (code !== 0) process.exit(code);
const check = spawn(npm, ['run', 'check'], { cwd: work, stdio: 'inherit' });
check.once('close', value => { process.exitCode = value ?? 1; });
