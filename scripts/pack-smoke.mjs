import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
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
  execFileSync(process.execPath, ['--input-type=module', '-e', 'const {openStore}=await import("threadport/storage"); const {TaskService}=await import("threadport/tasks"); const s=await openStore({dataDir:"./data"}); const tasks=new TaskService(s); const t=await tasks.create({projectId:"smoke",title:"SDK task"}); const saved=await tasks.update(t.id,1,{objective:"Manual objective"}); if(saved.revision!==2)throw new Error("Task smoke failed"); s.close();'], { cwd: installRoot, timeout: 15000 });
  execFileSync(process.execPath, ['--input-type=module', '-e', 'const {openStore}=await import("threadport/storage"); const {SearchService}=await import("threadport/search"); const s=await openStore({dataDir:"./data"}); const page=await new SearchService(s).search({q:"Manual objective"}); if(page.items.length!==1)throw new Error("Search smoke failed"); s.close();'], { cwd: installRoot, timeout: 15000 });
  execFileSync(process.execPath, ['--input-type=module', '-e', 'const {openStore}=await import("threadport/storage"); const {SnapshotService,verifyWorkspace}=await import("threadport/workspace"); const {resolve}=await import("node:path"); const s=await openStore({dataDir:"./data"}); s.createWorkspace("snapshot-smoke","smoke",resolve("./data")); const snapshot=await new SnapshotService(s).capture("snapshot-smoke"); if(snapshot.digest!==null||!snapshot.incompleteReasons.includes("NO_GIT")||!s.getSnapshot(snapshot.id))throw new Error("Snapshot smoke failed"); const report=await verifyWorkspace(snapshot,s.getWorkspace("snapshot-smoke")); if(report.status!=="unverifiable"||report.reasons[0].code!=="NO_GIT")throw new Error("Verify smoke failed");s.close();'], { cwd: installRoot, timeout: 15000 });
  // Exercise the installed CLI, not source imports, with all Cursor input paths.
  const project = join(temporary, 'synthetic-project'); await mkdir(project);
  const git = args => execFileSync('git', ['-C', project, ...args], { timeout: 10000 });
  git(['init', '-b', 'main']); await writeFile(join(project, 'README.md'), 'Synthetic package acceptance.\n');
  git(['add', 'README.md']); git(['-c', 'user.name=Package Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'fixture']);
  const time = '2026-09-14T00:00:00.000Z';
  const samples = {
    markdown: '# Synthetic\n## User\nReview only.\n## Assistant\nAll passed.\n',
    sparse: JSON.stringify([{ role: 'user', content: 'Review only.' }, { role: 'assistant', content: [{ type: 'tool_use', name: 'Shell', input: { command: 'node --test' } }] }]),
    native: JSON.stringify({ format: 'threadport.cursor-native.v1', sessionId: '11111111-1111-4111-8111-111111111111', createdAt: Date.parse(time), bubbles: [
      { bubbleId: 'u', type: 1, createdAt: time, text: 'Review only.' },
      { bubbleId: 't', type: 2, createdAt: time, completedAtMs: Date.parse(time) + 1, tool: { name: 'run_terminal_command_v2', toolCallId: 't', status: 'completed', params: { command: 'node --test; echo "EXIT_CODE=$?"' }, result: { output: 'EXIT_CODE=0\n', notInterrupted: true } } }
    ] })
  };
  const cli = args => {
    const run = spawnSync(process.execPath, [entry, ...args], { cwd: installRoot, encoding: 'utf8', timeout: 15000 });
    assert.equal(run.status, 0, run.stderr || String(run.error)); return run;
  };
  for (const [name, sample] of Object.entries(samples)) {
    const source = join(temporary, `${name}.txt`); const out = join(temporary, `${name}-capsule.json`);
    await writeFile(source, sample);
    const run = cli(['extract', '--from', 'cursor', '--session', source, '--project', project, '--out', out]);
    assert.equal(run.stdout.trim().split('\n').length, 2); assert.match(run.stderr, /Warning:/);
    const capsule = JSON.parse(await readFile(out, 'utf8'));
    assert.equal(capsule.status, 'paused'); assert.deepEqual(capsule.completed, []);
    assert(capsule.commands.every(command => command.exit_code === undefined));
    cli(['validate', out]);
    const handoff = join(temporary, `${name}-handoff.md`);
    cli(['handoff', '--to', 'cursor', out, '--out', handoff]);
    assert.match(await readFile(handoff, 'utf8'), /transcript-only|incomplete tool evidence/);
  }
  assert.equal(await readFile(join(project, 'README.md'), 'utf8'), 'Synthetic package acceptance.\n');
  assert.equal(git(['status', '--porcelain']).toString(), '');
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import {execFileSync,spawnSync} from 'node:child_process';
    import {mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
    import {resolve} from 'node:path';
    import {openStore} from 'threadport/storage';
    import {SnapshotService} from 'threadport/workspace';
    await mkdir('verify-project');const root=await realpath('verify-project');
    const git=(...args)=>execFileSync('git',['-C',root,...args],{stdio:'pipe'});
    git('init','-b','main');git('config','user.name','Synthetic');git('config','user.email','test@example.invalid');
    await writeFile(root+'/file.txt','initial');git('add','.');git('commit','-m','initial');
    const store=await openStore({dataDir:'./data'});store.createWorkspace('cli-smoke','smoke',root);
    const snapshot=await new SnapshotService(store).capture('cli-smoke');store.close();
    const capsule=JSON.parse(await readFile('node_modules/threadport/examples/capsule-v1.json','utf8'));
    capsule.evidence.push({kind:'other',title:'Snapshot',locator:'threadport:workspace-snapshot:'+snapshot.id});
    await writeFile('verify.json',JSON.stringify(capsule));
    const entry=resolve('node_modules/threadport/dist/src/cli.js');
    const run=(file)=>spawnSync(process.execPath,[entry,'verify',file,'--project',root,'--data-dir','./data','--json'],{encoding:'utf8',timeout:15000});
    let result=run('verify.json');assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).status,'matched');
    await writeFile(root+'/file.txt','changed');result=run('verify.json');assert.equal(result.status,4);assert.equal(JSON.parse(result.stdout).status,'drifted');
    result=run('node_modules/threadport/examples/capsule-v1.json');assert.equal(result.status,6);assert.equal(JSON.parse(result.stdout).scope,null);
    await writeFile('bad.json','{');assert.equal(run('bad.json').status,2);assert.equal(run('missing.json').status,5);
  `], {cwd:installRoot,timeout:90000});
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import {startLocalServer} from 'threadport/server';
    const server=await startLocalServer({dataDir:'./data'});
    try {
      assert.match(server.origin,/^http:\\/\\/127\\.0\\.0\\.1:/);
      assert.equal((await fetch(server.origin+'/api/v1/status')).status,401);
      const response=await fetch(server.origin+'/api/v1/status',{headers:{authorization:'Bearer '+server.token}});
      assert.equal(response.status,200);assert.equal((await response.json()).data.counts.tasks,1);
      const tasks=await fetch(server.origin+'/api/v1/tasks',{headers:{authorization:'Bearer '+server.token}});assert.equal(tasks.status,200);assert.equal((await tasks.json()).data.length,1);
    } finally {await server.close();await server.close();}
  `], {cwd:installRoot,timeout:30000});
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import {spawn} from 'node:child_process';
    import {once} from 'node:events';
    import {resolve} from 'node:path';
    const child=spawn(process.execPath,[resolve('node_modules/threadport/dist/src/cli.js'),'ui','--no-open','--data-dir',resolve('data')],{stdio:['ignore','pipe','pipe']});
    try {
      const url=await new Promise((done,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('UI startup timeout')),15000);child.once('error',reject);child.once('exit',()=>reject(new Error('UI exited early')));child.stdout.on('data',chunk=>{text+=chunk;if(text.includes('\\n')){clearTimeout(timer);done(text.trim().split('\\n')[0]);}});});
      const parsed=new URL(url);assert.equal(parsed.search,'');assert.match(parsed.hash,/^#token=[a-f0-9]{64}$/);
      assert.equal((await fetch(parsed.origin)).status,200);assert.equal((await fetch(parsed.origin+'/api/v1/status')).status,401);
      const exited=once(child,'exit');child.kill('SIGTERM');await exited;
    } finally {child.kill('SIGKILL');}
  `], {cwd:installRoot,timeout:30000});
  console.log(`Package smoke passed: ${packed.files.length} files; public exports, UI CLI, workspace verification, local server and 3 Cursor roundtrips pass from an isolated install.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
