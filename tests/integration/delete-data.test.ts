import { afterEach, expect, it } from "vitest";
import { writeFile, readFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { openStore, type SqliteStore } from "../../src/storage/sqlite-store.js";
import { startLocalServer } from "../../src/server/app.js";
import { TaskService } from "../../src/tasks/service.js";
import { temporary } from "../helpers.js";
const stores: SqliteStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});
it("refuses other registered connections and deletes only owned data after they close", async () => {
  const dataDir = await temporary(),
    store = await openStore({ dataDir });
  stores.push(store);
  store.createProject("project", "Private project");
  await new TaskService(store).create({
    projectId: "project",
    title: "Private task",
  });
  const source = join(dataDir, "source.jsonl");
  await writeFile(source, '{"private":"original source"}\n');
  const other = await openStore({ dataDir });
  stores.push(other);
  expect(() => store.deleteAll(dataDir)).toThrow(
    expect.objectContaining({ code: "STORAGE_BUSY" }),
  );
  expect(store.statusCounts().tasks).toBe(1);
  other.close();
  expect(store.deleteAll(dataDir)).toEqual({ deleted: true });
  expect(store.isOpen()).toBe(false);
  expect(await readFile(source, "utf8")).toBe(
    '{"private":"original source"}\n',
  );
  expect(existsSync(join(dataDir, "threadport.sqlite"))).toBe(false);
  expect(existsSync(join(dataDir, "backups"))).toBe(false);
  const fresh = await openStore({ dataDir });
  stores.push(fresh);
  expect(fresh.statusCounts().tasks).toBe(0);
}, 30000);
it("rejects unknown backup contents before deleting manual data or backup files", async () => {
  const dataDir = await temporary(),
    store = await openStore({ dataDir });
  stores.push(store);
  store.createProject("project", "Project");
  await new TaskService(store).create({
    projectId: "project",
    title: "Retain me",
  });
  const backupRoot = join(dataDir, "backups"),
    entry = (await readdir(backupRoot))[0],
    path = join(backupRoot, entry, "personal.txt");
  await writeFile(path, "leave alone");
  expect(() => store.deleteAll(dataDir)).toThrow(
    expect.objectContaining({ code: "IO_FAILED" }),
  );
  expect(store.isOpen()).toBe(true);
  expect(store.statusCounts().tasks).toBe(1);
  expect(await readFile(path, "utf8")).toBe("leave alone");
  expect(existsSync(join(backupRoot, entry, "backup.sqlite"))).toBe(true);
});
it("requires the exact phrase, then responds and closes the local server", async () => {
  const dataDir = await temporary(),
    server = await startLocalServer({ dataDir });
  try {
    const send = (confirmation: string) =>
      fetch(server.origin + "/api/v1/data/delete-all", {
        method: "POST",
        headers: {
          authorization: "Bearer " + server.token,
          "content-type": "application/json",
        },
        body: JSON.stringify({ confirmation }),
      });
    expect((await send("delete local data")).status).toBe(400);
    expect(existsSync(join(dataDir, "threadport.sqlite"))).toBe(true);
    const response = await send("DELETE LOCAL DATA");
    expect(response.status).toBe(200);
    expect((await response.json()).data.deleted).toBe(true);
    await server.closed;
    expect(existsSync(join(dataDir, "threadport.sqlite"))).toBe(false);
    await expect(fetch(server.origin + "/api/v1/status")).rejects.toThrow();
  } finally {
    await server.close();
  }
}, 30000);

it("blocks a separate live process and releases access after that process exits", async () => {
  const { spawn } = await import("node:child_process");
  const { default: EventEmitter } = await import("node:events");const once=EventEmitter.once;
  const dataDir = await temporary(),
    store = await openStore({ dataDir });
  stores.push(store);
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {openStore} from ${JSON.stringify(new URL("../../dist/src/storage/sqlite-store.js", import.meta.url).href)};const store=await openStore({dataDir:process.argv[1]});process.send({ready:true});process.on('message',()=>{store.close();process.disconnect();});`,
      dataDir,
    ],
    { stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  try {
    await Promise.race([
      once(child, "message"),
      once(child, "exit").then(() => {
        throw new Error("Child exited before registration");
      }),
    ]);
    expect(() => store.deleteAll(dataDir)).toThrow(
      expect.objectContaining({ code: "STORAGE_BUSY" }),
    );
    const exited = once(child, "exit");
    child.send("close");
    await exited;
    expect(store.deleteAll(dataDir)).toEqual({ deleted: true });
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}, 30000);

it('exits the installed-style UI CLI successfully after confirmed deletion',async()=>{
 const {spawn}=await import('node:child_process'),{default:EventEmitter}=await import('node:events');const dataDir=await temporary();const child=spawn(process.execPath,[(await import('node:url')).fileURLToPath(new URL('../../dist/src/cli.js',import.meta.url)),'ui','--no-open','--data-dir',dataDir],{stdio:['ignore','pipe','pipe']});const exited=EventEmitter.once(child,'exit');
 try{const url=await new Promise<string>((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('UI startup timed out')),20000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',()=>{clearTimeout(timer);reject(new Error('UI stopped before startup'));});child.stdout.on('data',chunk=>{text+=chunk;if(text.includes('\n')){clearTimeout(timer);resolve(text.trim().split('\n')[0]);}});});const parsed=new URL(url);const response=await fetch(parsed.origin+'/api/v1/data/delete-all',{method:'POST',headers:{authorization:'Bearer '+new URLSearchParams(parsed.hash.slice(1)).get('token'),'content-type':'application/json'},body:JSON.stringify({confirmation:'DELETE LOCAL DATA'})});expect(response.status).toBe(200);expect((await exited)[0]).toBe(0);expect(existsSync(join(dataDir,'threadport.sqlite'))).toBe(false);}finally{if(child.exitCode===null&&child.signalCode===null){child.kill();await exited;}}
},30000);
