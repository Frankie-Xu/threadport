import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

// Run through `npm run check:pack` so npm's JS entry is known on Windows too.
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this check with npm run check:pack.');
const root = resolve('.');
const temporary = await mkdtemp(join(tmpdir(), 'threadport-pack-'));
const npm = (args, cwd) => execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
try {
  const packed = JSON.parse(npm(['pack', '--json', '--pack-destination', temporary], root))[0];
  assert(packed.files.some(file => file.path === 'dist/src/cli.js'));
  assert(packed.files.some(file => file.path === 'dist/src/index.js'));
  assert(!packed.files.some(file => file.path.startsWith('dist/tests/')));
  const installRoot = join(temporary, 'consumer'); await mkdir(installRoot);
  npm(['install', '--no-audit', '--no-fund', '--prefix', installRoot, join(temporary, packed.filename)], installRoot);
  const entry = join(installRoot, 'node_modules/threadport/dist/src/cli.js');
  const help = execFileSync(process.execPath, [entry, '--help'], { encoding: 'utf8', timeout: 10_000 });
  assert(help.includes('threadport handoff'));
  // Resolve the public export as an installed package, not by a source-tree import.
  execFileSync(process.execPath, ['--input-type=module', '-e', 'const m = await import("threadport"); if (typeof m.parseHandoff !== "function") process.exit(1);'], { cwd: installRoot, timeout: 10_000 });
  execFileSync(process.execPath, ['--input-type=module', '-e', 'const {openStore} = await import("threadport/storage"); const s = await openStore({dataDir:"./data"}); s.createProject("smoke", "Smoke"); s.close();'], { cwd: installRoot, timeout: 15_000 });
  execFileSync(process.execPath, ['--input-type=module', '-e', 'const {createSourceRegistry} = await import("threadport/sources"); const s = createSourceRegistry([{agent:"claude",sourceId:"smoke",roots:["./data"]}]).get("smoke"); for await (const candidate of s.discover(["./data"], new AbortController().signal)) throw new Error("Unexpected candidate");'], { cwd: installRoot, timeout: 15_000 });
  execFileSync(process.execPath, ['--input-type=module', '-e', 'const {openStore}=await import("threadport/storage"); const {IndexService}=await import("threadport/indexing"); const s=await openStore({dataDir:"./data"}); s.saveSource({id:"source",agent:"codex",roots:["./data"],enabled:true,parserVersion:"codex-jsonl-v1"}); const index=new IndexService(s); const job=await index.refresh("source"); if(job.state!=="completed")throw new Error("Index smoke failed"); await index.stop();s.close();'], { cwd: installRoot, timeout: 15000 });
  console.log(`Package smoke passed: ${packed.files.length} files; CLI and public exports load from an isolated install.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
