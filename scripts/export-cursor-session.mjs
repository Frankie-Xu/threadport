#!/usr/bin/env node
// Developer-only, explicit single-session evidence export. No automatic discovery.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
try {
  if (args.length !== 3) throw new Error('Usage: node scripts/export-cursor-session.mjs <database> <session-uuid> <new-output.json>');
  const [database, session, output] = args;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session)) throw new Error('A single UUID session ID is required.');
  // Session is strictly validated above; all other arguments are execFile argv,
  // never shell text. No query enumerates other composer keys or returns raw rows.
  const query = `BEGIN;
WITH composer AS (
 SELECT value FROM cursorDiskKV WHERE key='composerData:${session}'
), selected AS (
 SELECT h.key AS ordinal, json_extract(h.value,'$.bubbleId') AS id, d.value AS bubble
 FROM composer, json_each(composer.value,'$.fullConversationHeadersOnly') AS h
 LEFT JOIN cursorDiskKV AS d ON d.key='bubbleId:${session}:' || json_extract(h.value,'$.bubbleId')
 ORDER BY CAST(h.key AS INTEGER)
)
SELECT json_object('format','threadport.cursor-native.v1','sessionId','${session}',
 'createdAt',json_extract((SELECT value FROM composer),'$.createdAt'),
 'missing', (SELECT count(*) FROM selected WHERE bubble IS NULL),
 'bubbles', json_group_array(json_object(
 'bubbleId',id, 'type',json_extract(bubble,'$.type'), 'createdAt',json_extract(bubble,'$.createdAt'),
 'startedAtMs',json_extract(bubble,'$.startedAtMs'), 'completedAtMs',json_extract(bubble,'$.completedAtMs'),
 'omitted',json(CASE WHEN json_type(bubble,'$.thinking') IS NOT NULL OR json_extract(bubble,'$.capabilityType')=30 OR coalesce(json_array_length(bubble,'$.allThinkingBlocks'),0)>0 THEN 'true' ELSE 'false' END),
 'text',CASE WHEN json_type(bubble,'$.thinking') IS NULL AND coalesce(json_extract(bubble,'$.capabilityType'),0)<>30 AND coalesce(json_array_length(bubble,'$.allThinkingBlocks'),0)=0 THEN json_extract(bubble,'$.text') ELSE NULL END,
 'tool',CASE WHEN json_type(bubble,'$.thinking') IS NULL AND coalesce(json_extract(bubble,'$.capabilityType'),0)<>30 AND coalesce(json_array_length(bubble,'$.allThinkingBlocks'),0)=0 AND json_type(bubble,'$.toolFormerData')='object' THEN json_object(
 'name',json_extract(bubble,'$.toolFormerData.name'),'toolCallId',json_extract(bubble,'$.toolFormerData.toolCallId'),'status',json_extract(bubble,'$.toolFormerData.status'),
 'params',json_object('command',json_extract(json_extract(bubble,'$.toolFormerData.params'),'$.command'),'cwd',json_extract(json_extract(bubble,'$.toolFormerData.params'),'$.cwd'),'relativeWorkspacePath',json_extract(json_extract(bubble,'$.toolFormerData.params'),'$.relativeWorkspacePath')),
 'result',CASE WHEN json_type(json_extract(bubble,'$.toolFormerData.result'))='object' THEN json_object(
 'output',json_extract(json_extract(bubble,'$.toolFormerData.result'),'$.output'),
 'rejected',json(CASE json_extract(json_extract(bubble,'$.toolFormerData.result'),'$.rejected') WHEN 1 THEN 'true' WHEN 0 THEN 'false' ELSE 'null' END),
 'notInterrupted',json(CASE json_extract(json_extract(bubble,'$.toolFormerData.result'),'$.notInterrupted') WHEN 1 THEN 'true' WHEN 0 THEN 'false' ELSE 'null' END),
 'beforeContentId',json_extract(json_extract(bubble,'$.toolFormerData.result'),'$.beforeContentId'),'afterContentId',json_extract(json_extract(bubble,'$.toolFormerData.result'),'$.afterContentId')) ELSE NULL END,
 'error',json_extract(json_extract(bubble,'$.toolFormerData.error'),'$.clientVisibleErrorMessage')) ELSE NULL END
 ))) AS evidence FROM selected;
COMMIT;`;
  const { stdout } = await promisify(execFile)('sqlite3', ['-readonly', resolve(database), query], { maxBuffer: 16 * 1024 * 1024, timeout: 30000 });
  const evidence = JSON.parse(stdout);
  if (!Number.isSafeInteger(evidence.createdAt) || !Array.isArray(evidence.bubbles) || !evidence.bubbles.length || evidence.missing !== 0) throw new Error('Selected Cursor session is missing or incomplete; no export written.');
  delete evidence.missing;
  await writeFile(output, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(output);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
