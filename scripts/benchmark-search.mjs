import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, cpus, totalmem, platform, arch } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { openStore } from '../dist/src/storage/sqlite-store.js';
import { SearchService } from '../dist/src/search/service.js';
import { seedSearchCapacity, capacityQueries } from '../tests/fixtures/search-capacity.ts';
const dataDir=await mkdtemp(join(tmpdir(),'tp-search-bench-'));const store=await openStore({dataDir});
try{
 const db=new Database(join(dataDir,'threadport.sqlite'));let fixture;try{fixture=seedSearchCapacity(db);}finally{db.close();}
 const search=new SearchService(store);const durations=[];
 for(const q of capacityQueries){const start=performance.now();await search.search({q,projectId:'capacity'});durations.push(performance.now()-start);}
 durations.sort((a,b)=>a-b);
 console.log(JSON.stringify({node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model,cores:cpus().length,memoryGiB:Math.round(totalmem()/1024**3),...fixture,queries:100,limit:50,p50Ms:durations[49],p95Ms:durations[94],maxMs:durations[99],sdkOnly:true},null,2));
}finally{store.close();await rm(dataDir,{recursive:true,force:true});}
