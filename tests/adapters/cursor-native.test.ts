import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { createCursorAdapter } from '../../src/adapters/cursor.js';
import { cursorNativeRecords } from '../../src/adapters/cursor-native.js';

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const sessionId = '11111111-1111-4111-8111-111111111111';
const epoch = Date.parse('2026-09-14T00:00:00Z');
const text = (bubbleId: string, type: 1 | 2, content: string, offset: number) => ({ bubbleId, type, text: content, createdAt: new Date(epoch + offset).toISOString() });
const shell = (id: string, start: number, end: number, exit: number) => ({
  ...text(id, 2, '', start), startedAtMs: epoch + start, completedAtMs: epoch + end,
  tool: { name: 'run_terminal_command_v2', toolCallId: id, status: 'completed', params: { command: 'node --test; echo "EXIT_CODE=$?"' }, result: { output: `synthetic test output\nEXIT_CODE=${exit}\n`, notInterrupted: true, rejected: false } }
});
const edit = (id: string, offset: number, fail = false) => ({
  ...text(id, 2, '', offset), startedAtMs: epoch + offset, completedAtMs: epoch + offset + 1,
  tool: { name: 'edit_file_v2', toolCallId: id, status: fail ? 'error' : 'completed', params: { relativeWorkspacePath: 'src/client.mjs' }, result: fail ? null : { beforeContentId: 'before', afterContentId: 'after' }, error: fail ? 'Match not found.' : null }
});
const envelope = (bubbles: unknown[]) => ({ format: 'threadport.cursor-native.v1', sessionId, createdAt: epoch, bubbles });
it('does not certify an exit from text markers and unreliable completion flags', async () => {
  const tool = shell('marker-only', 10, 20, 0);
  const capsule = await createCursorAdapter().extract({ project: await project(),
    sessionText: JSON.stringify(envelope([text('u', 1, 'Review only.', 0), tool])) });
  expect(capsule.commands[0]?.exit_code).toBeUndefined();
  expect(capsule.completed).toEqual([]);
  expect(capsule.status).toBe('paused');
});
it('never confirms a rejected native edit or an unknown tool', async () => {
  const fixtureProject = await project();
  for (const denied of [true, false]) {
    const tool = edit('denied-edit', 10);
    const native = { ...tool, tool: { ...tool.tool, name: denied ? 'edit_file_v2' : 'future_tool_v99',
      result: denied ? { rejected: true } : null, error: null } };
    const capsule = await createCursorAdapter().extract({ project: fixtureProject,
      sessionText: JSON.stringify(envelope([text('u', 1, 'Review.', 0), native])) });
    expect(capsule.completed).toEqual([]);
    if (denied) {
      expect(capsule.files[0]?.summary).not.toBe('Confirmed in session.');
      expect(capsule.failures.some(f => !f.resolution)).toBe(true);
    } else expect(capsule.constraints.join('\n')).toContain('incomplete tool evidence');
  }
});
it('retains a cancelled native edit rejection even when after-content references exist', async () => {
  // Reconstructed from the isolated 3.20.17 external-file approval rejection.
  // Both content references existed although the actual file was unchanged.
  const attempted = edit('cancelled-edit', 10);
  const denied = { ...attempted, tool: { ...attempted.tool, status: 'cancelled',
    error: 'Edit rejected: User chose to skip' } };
  const capsule = await createCursorAdapter().extract({ project: await project(),
    sessionText: JSON.stringify(envelope([text('u', 1, 'Review only.', 0), denied])) });
  expect(capsule.completed).toEqual([]);
  expect(capsule.files[0]?.summary).not.toBe('Confirmed in session.');
  expect(capsule.failures).toContainEqual({ summary: 'Edit rejected: User chose to skip' });
  expect(capsule.status).toBe('blocked');
});
async function project() {
  const root = await mkdtemp(join(tmpdir(), 'threadport-native-'));
  roots.push(root);
  await exec('git', ['init', '-b', 'main', root]);
  await writeFile(join(root, 'README.md'), 'synthetic');
  await exec('git', ['-C', root, 'add', '.']);
  await exec('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'test']);
  return { name: 'synthetic', root };
}

it('maps selected native results with failure recovery and final user instruction', async () => {
  const input = envelope([
    text('user', 1, 'Fix totals.', 0), shell('fail', 10, 20, 1), edit('fix', 30), shell('pass', 40, 50, 0),
    edit('bad-match', 60, true), edit('regression', 70), shell('fail-again', 80, 90, 1),
    text('instruction', 1, 'Do not edit. Review the README first.', 100), text('reply', 2, 'Acknowledged.', 110),
    { ...text('hidden', 2, 'HIDDEN_MARKER', 5), omitted: true, thinking: 'SECRET_THINKING' }
  ]);
  const capsule = await createCursorAdapter().extract({ sessionText: JSON.stringify(input), project: await project() });
  expect(capsule.tests).toEqual([]);
  expect(capsule.commands.map(command => command.command)).toEqual(Array(3).fill('node --test; echo "EXIT_CODE=$?"'));
  expect(capsule.commands.every(command => command.exit_code === undefined)).toBe(true);
  expect(capsule.status).toBe('paused');
  expect(capsule.files[0]?.summary).toBe('Confirmed in session.');
  expect(capsule.failures.some(failure => failure.summary.includes('Match not found') && failure.resolution)).toBe(true);
  expect(capsule.next_action).toContain('Review the README first');
  expect(capsule.created_at).toBe(new Date(epoch).toISOString());
  expect(JSON.stringify(capsule)).not.toContain('HIDDEN_MARKER');
  expect(JSON.stringify(capsule)).not.toContain('SECRET_THINKING');
});

it('orders concurrent results by completion rather than array or call order', () => {
  const records = cursorNativeRecords(envelope([text('user', 1, 'Fix.', 0), shell('slow', 10, 50, 1), shell('fast', 20, 30, 0)]));
  const results = records.flatMap(record => Array.isArray(record.content) ? record.content : []).filter(block => block.type === 'tool_result');
  expect(results.map(block => block.tool_use_id)).toEqual(['fast', 'slow']);
});

it('preserves native working directories and never recovers failures from text markers', async () => {
  const withCwd = (id: string, start: number, exit: number, cwd: string) => {
    const bubble = shell(id, start, start + 1, exit);
    return { ...bubble, tool: { ...bubble.tool, params: { ...bubble.tool.params, cwd } } };
  };
  const failed = withCwd('failed-a', 10, 1, '/synthetic/a');
  const passedElsewhere = withCwd('passed-b', 20, 0, '/synthetic/b');
  const records = cursorNativeRecords(envelope([failed]));
  const call = records.flatMap(r => Array.isArray(r.content) ? r.content : []).find(b => b.type === 'tool_use');
  expect(call?.input).toEqual({ command: 'node --test; echo "EXIT_CODE=$?"', cwd: '/synthetic/a' });
  const input = { project: await project(), sessionText: JSON.stringify(envelope([text('u', 1, 'Fix.', 0), failed, passedElsewhere])) };
  const separate = await createCursorAdapter().extract(input);
  expect(separate.constraints.join('\n')).toContain('Recorded cwd is requested context, not a verified execution location.');
  expect(separate.status).toBe('paused');
  expect(separate.commands.every(c => c.exit_code === undefined)).toBe(true);
  const recovered = await createCursorAdapter().extract({ ...input, sessionText: JSON.stringify(envelope([text('u', 1, 'Fix.', 0), failed, withCwd('passed-a', 20, 0, '/synthetic/a')])) });
  expect(recovered.failures).toEqual([]);
  expect(recovered.commands.every(c => c.exit_code === undefined)).toBe(true);
});

it('distinguishes requested native directories in exported command and test summaries', async () => {
  const p = await project();
  const tools = ['client', 'server'].map((dir, i) => {
    const tool = shell(dir, 10 + i, 30 - i, i);
    return { ...tool, tool: { ...tool.tool, params: { command: 'node --test', cwd: join(p.root, dir) }, result: { ...tool.tool.result, output: 'identical output' } } };
  });
  const capsule = await createCursorAdapter().extract({ project: p, sessionText: JSON.stringify(envelope([text('u', 1, 'Review.', 0), ...tools])) });
  expect(capsule.commands.map(c => c.command)).toEqual(['node --test', 'node --test']);
  // Completion order is server, then client; never attach labels by input array order.
  for (const [i, dir] of ['server', 'client'].entries()) {
    expect(capsule.commands[i]?.summary).toContain(`Requested cwd (execution unverified): "${dir}"`);
    expect(capsule.tests[i]?.summary).toContain(`Requested cwd (execution unverified): "${dir}"`);
  }
  expect(capsule.commands.every(c => c.exit_code === undefined)).toBe(true);
  expect(JSON.stringify(capsule)).not.toContain(p.root);
});

it('preserves unknown exits for pending and misleading completed native commands', async () => {
  const partial = shell('partial', 10, 20, 0);
  partial.tool.params.command = 'node -e "setTimeout(() => {}, 45000)"';
  partial.tool.result.output = 'SYNTHETIC_STARTED\n';
  const pending = { ...partial, bubbleId: 'pending', startedAtMs: null, completedAtMs: null,
    tool: { ...partial.tool, toolCallId: 'pending', status: 'loading', result: null } };
  const capsule = await createCursorAdapter().extract({ project: await project(), sessionText: JSON.stringify(envelope([text('u', 1, 'Review only.', 0), pending, partial])) });
  expect(capsule.commands).toHaveLength(2);
  expect(capsule.commands.every(c => c.exit_code === undefined)).toBe(true);
  expect(capsule.completed).toEqual([]);
  expect(capsule.status).toBe('paused');
});

it('never treats completed, rejected, interrupted or missing output as exit zero', async () => {
  // Each extraction only reads Git. Reuse the fixture, not the tool records,
  // so all five safety cases fit the same default deadline on Windows.
  const fixtureProject = await project();
  for (const kind of ['missing', 'rejected', 'interrupted', 'arbitrary-output', 'unrecognized-wrapper']) {
    const tool = shell('test', 10, 20, 0);
    if (kind === 'missing') tool.tool.result.output = '';
    if (kind === 'rejected') tool.tool.result.rejected = true;
    if (kind === 'interrupted') tool.tool.result.notInterrupted = false;
    if (kind === 'arbitrary-output') tool.tool.result.output = 'passed with exit code: 0';
    if (kind === 'unrecognized-wrapper') tool.tool.params.command = 'node --test; echo "EXIT_CODE=0"';
    const capsule = await createCursorAdapter().extract({ sessionText: JSON.stringify(envelope([text('u', 1, 'Fix.', 0), tool])), project: fixtureProject });
    expect(capsule.status).toBe('paused');
    expect(capsule.commands[0]?.exit_code).toBeUndefined();
    expect(capsule.completed).toEqual([]);
  }
});

it('rejects duplicate call/bubble IDs and reversed timestamps', () => {
  const tool = shell('test', 10, 20, 0);
  expect(() => cursorNativeRecords(envelope([tool, tool]))).toThrow(/Duplicate/);
  expect(() => cursorNativeRecords(envelope([tool, { ...tool, bubbleId: 'other' }]))).toThrow(/duplicate/);
  expect(() => cursorNativeRecords(envelope([shell('bad-time', 20, 10, 0)]))).toThrow(/precedes/);
});

it('exports only selected visible SQLite fields and refuses overwrite or unknown session', async () => {
  const root = await mkdtemp(join(tmpdir(), 'threadport-export-db-'));
  roots.push(root);
  const database = join(root, 'state.vscdb');
  const output = join(root, 'selected.json');
  const script = resolve('scripts/export-cursor-session.mjs');
  let available = true;
  try { await exec('sqlite3', ['-version']); } catch { available = false; }
  if (!available) {
    // No skip: on machines without optional SQLite CLI, verify fail-closed behavior.
    await expect(exec(process.execPath, [script, database, sessionId, output])).rejects.toThrow();
    await expect(readFile(output)).rejects.toThrow();
    return;
  }
  const user = text('visible', 1, 'Selected visible task.', 0);
  const hidden = { ...text('hidden', 2, 'HIDDEN_TEXT', 1), thinking: { text: 'HIDDEN_REASONING' } };
  const hiddenBlocks = { ...text('hidden-blocks', 2, 'HIDDEN_BLOCK_TEXT', 2), allThinkingBlocks: [{ text: 'BLOCK_REASONING' }] };
  const tool = shell('shell', 10, 20, 1);
  const nativeTool = { ...tool, tool: undefined, toolFormerData: { ...tool.tool, params: JSON.stringify(tool.tool.params), result: JSON.stringify(tool.tool.result) } };
  const header = { createdAt: epoch, fullConversationHeadersOnly: [{ bubbleId: 'visible' }, { bubbleId: 'hidden' }, { bubbleId: 'hidden-blocks' }, { bubbleId: 'shell' }], blobEncryptionKey: 'DO_NOT_EXPORT' };
  const quote = (value: unknown) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'";
  await exec('sqlite3', [database, `CREATE TABLE cursorDiskKV(key TEXT PRIMARY KEY,value TEXT);
    INSERT INTO cursorDiskKV VALUES('composerData:${sessionId}',${quote(header)});
    INSERT INTO cursorDiskKV VALUES('bubbleId:${sessionId}:visible',${quote(user)});
    INSERT INTO cursorDiskKV VALUES('bubbleId:${sessionId}:hidden',${quote(hidden)});
    INSERT INTO cursorDiskKV VALUES('bubbleId:${sessionId}:hidden-blocks',${quote(hiddenBlocks)});
    INSERT INTO cursorDiskKV VALUES('bubbleId:${sessionId}:shell',${quote(nativeTool)});
    INSERT INTO cursorDiskKV VALUES('composerData:other','{"secret":"OTHER_SESSION"}');`]);
  const before = await readFile(database);
  await exec(process.execPath, [script, database, sessionId, output]);
  const exported = await readFile(output, 'utf8');
  expect(exported).toContain('Selected visible task');
  for (const marker of ['HIDDEN_TEXT', 'HIDDEN_REASONING', 'HIDDEN_BLOCK_TEXT', 'BLOCK_REASONING', 'DO_NOT_EXPORT', 'OTHER_SESSION']) expect(exported).not.toContain(marker);
  expect(await readFile(database)).toEqual(before);
  expect(cursorNativeRecords(JSON.parse(exported)).some(record => record.content === 'Selected visible task.')).toBe(true);
  const converted = cursorNativeRecords(JSON.parse(exported));
  expect(JSON.stringify(converted)).toContain('"exit_code":null');
  expect(JSON.stringify(converted)).not.toContain('"exit_code":1');
  await expect(exec(process.execPath, [script, database, sessionId, output])).rejects.toThrow();
  expect(await readFile(output, 'utf8')).toBe(exported);
  await expect(exec(process.execPath, [script, database, '22222222-2222-4222-8222-222222222222', join(root, 'absent.json')])).rejects.toThrow();
  await expect(readFile(join(root, 'absent.json'))).rejects.toThrow();
});
