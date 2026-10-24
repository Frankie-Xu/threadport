import { expect, it } from 'vitest';
import { marked } from 'marked';
import { exportTask } from '../../src/tasks/export.js';
import { fixture } from '../handoff/helpers.js';

it('exports many backtick runs without overflowing function arguments or closing its fence',async()=>{
 const f=await fixture();
 try{
  const detail=await f.tasks.detail(f.taskId);
  const command='`x '.repeat(150000)+'````';
  detail.derived.latestRuns=[{id:'run',sessionId:f.input.sourceSessionId,ordinal:0,command,cwd:null,exitCode:0,startedAt:null,completedAt:null,eventId:'event',snapshotId:null}];
  const markdown=exportTask(detail);
  const blocks=marked.lexer(markdown).filter(token=>token.type==='code');
  expect(blocks.some(block=>block.text===command)).toBe(true);
  const headings=marked.lexer(markdown).filter(token=>token.type==='heading').map(token=>token.text);
  expect(headings).toContain('Next action');expect(headings).toContain('Observed commands');
  expect(markdown).toContain('Observed exit: 0');
 }finally{f.store.close();}
},30000);
