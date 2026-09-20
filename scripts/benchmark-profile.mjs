import Database from 'better-sqlite3';
import {SqliteStore} from '../dist/src/storage/sqlite-store.js';
/** Measurement only, in the isolated benchmark worker. No production API or query changes. */
export function profileSearch(send){
 let queryMs=0,projectionMs=0,searchId=0;
 const prepare=Database.prototype.prepare;
 Database.prototype.prepare=function(sql){
  const statement=prepare.call(this,sql);
  const stage=sql.startsWith('WITH documents AS')?'query':sql.startsWith('SELECT id,search_text AS text FROM events')?'projection':sql.startsWith('SELECT 1 FROM session_search')||sql.startsWith('SELECT 1 FROM events WHERE session_id')?'filter':sql.startsWith('SELECT rowid FROM session_search_fts')?'candidates':null;
  if(stage){const method=stage==='query'||stage==='candidates'?'all':'get',original=statement[method];statement[method]=function(...args){const began=performance.now();try{return original.apply(this,args);}finally{const elapsed=performance.now()-began;if(stage==='projection')projectionMs+=elapsed;else queryMs+=elapsed;}};}
  if(stage==='query'){
   const iterate=statement.iterate;
   statement.iterate=function(...args){const iterator=iterate.apply(this,args);return {next(){const began=performance.now();try{return iterator.next();}finally{queryMs+=performance.now()-began;}},return(){return iterator.return?.()??{done:true};},[Symbol.iterator](){return this;}};};
  }
  return statement;
 };
 const search=SqliteStore.prototype.searchHistory;
 SqliteStore.prototype.searchHistory=function(input){
  queryMs=0;projectionMs=0;const id=++searchId;const began=performance.now();try{return search.call(this,input);}finally{const storageMs=performance.now()-began;send({searchTiming:{id,queryMs,projectionMs,assemblyMs:Math.max(0,storageMs-queryMs-projectionMs),storageMs}});}
 };
}
