import {afterEach,expect,it,vi} from 'vitest';
const fault=vi.hoisted(()=>({suffix:''}));
vi.mock('node:fs',async original=>{const real=await original<typeof import('node:fs')>();return{...real,unlinkSync:(path:Parameters<typeof real.unlinkSync>[0])=>{if(fault.suffix&&String(path).endsWith(fault.suffix))throw Object.assign(new Error('synthetic permission failure'),{code:'EACCES'});return real.unlinkSync(path);}};});
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {temporary} from '../helpers.js';
import {openStore,type SqliteStore} from '../../src/storage/sqlite-store.js';
import {TaskService} from '../../src/tasks/service.js';
const stores:SqliteStore[]=[];
afterEach(()=>{fault.suffix='';for(const store of stores.splice(0))store.close();});
it.each(['backup.sqlite','threadport.sqlite'])('does not claim success when deletion of %s fails',async suffix=>{
 const dataDir=await temporary(),store=await openStore({dataDir});stores.push(store);store.createProject('project','Private');await new TaskService(store).create({projectId:'project',title:'Retained current database'});fault.suffix=suffix;expect(()=>store.deleteAll(dataDir)).toThrow(expect.objectContaining({code:'IO_FAILED'}));expect(existsSync(join(dataDir,'threadport.sqlite'))).toBe(true);fault.suffix='';if(store.isOpen())expect(store.statusCounts().tasks).toBe(1);else{const reopened=await openStore({dataDir});stores.push(reopened);expect(reopened.statusCounts().tasks).toBe(1);expect(reopened.deleteAll(dataDir)).toEqual({deleted:true});}
});
