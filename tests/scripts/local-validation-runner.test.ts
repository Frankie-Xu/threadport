import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { runValidation, type CommandResult, type ValidationStep } from '../../scripts/local-validation-runner.mjs';

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const baseStep = (id: string): ValidationStep => ({
  id,
  title: id,
  executable: 'node',
  args: ['--version'],
});

describe('local validation runner', () => {
  it('records argv commands, digests, timings, and a passing report', async () => {
    const calls: ValidationStep[] = [];
    const result = await runValidation({
      candidateSha: 'a'.repeat(40),
      workingTree: { state: 'clean', dirty: false, statusDigest: digest('') },
      runtime: { node: 'v24.18.1', npm: '11.6.0', platform: 'darwin', arch: 'arm64' },
      steps: [baseStep('pass')],
      probes: { chrome: true, docker: true },
      execute: async (step) => {
        calls.push(step);
        return { status: 'passed', exitCode: 0, stdout: 'ok\n', stderr: '' } satisfies CommandResult;
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.report.summary).toEqual({ passed: 1, failed: 0, skipped: 0, status: 'passed' });
    expect(result.report.candidateSha).toBe('a'.repeat(40));
    expect(result.report.workingTree.state).toBe('clean');
    expect(result.report.runtime.node).toBe('v24.18.1');
    expect(result.report.steps[0]).toMatchObject({
      id: 'pass',
      status: 'passed',
      exitCode: 0,
      stdoutDigest: digest('ok\n'),
      stderrDigest: digest(''),
    });
    expect(result.report.steps[0].startedAt).toMatch(/T/);
    expect(calls[0]).toMatchObject({ executable: 'node', args: ['--version'] });
    expect((calls[0] as ValidationStep & { shell?: boolean }).shell).not.toBe(true);
  });

  it('keeps a failure report, continues later steps, and returns a non-zero result', async () => {
    const written: string[] = [];
    const result = await runValidation({
      candidateSha: 'b'.repeat(40),
      workingTree: { state: 'dirty', dirty: true, statusDigest: digest(' M src/file.ts\n') },
      runtime: { node: 'v24.18.1', npm: '11.6.0', platform: 'darwin', arch: 'arm64' },
      steps: [baseStep('fail'), baseStep('after')],
      probes: { chrome: true, docker: true },
      execute: async (step) => step.id === 'fail'
        ? { status: 'failed', exitCode: 7, stdout: 'partial', stderr: 'boom' }
        : { status: 'passed', exitCode: 0, stdout: 'later', stderr: '' },
      writeReport: async (_path, report) => { written.push(JSON.stringify(report)); },
      reportPath: '/tmp/local-validation-test.json',
    });

    expect(result.exitCode).toBe(1);
    expect(result.report.summary).toMatchObject({ passed: 1, failed: 1, skipped: 0, status: 'failed' });
    expect(result.report.steps.map(step => step.id)).toEqual(['fail', 'after']);
    expect(result.report.steps[0]).toMatchObject({ status: 'failed', exitCode: 7, stderrDigest: digest('boom') });
    expect(written).toHaveLength(1);
    expect(JSON.parse(written[0]).steps[0].status).toBe('failed');
    await expect(readFile('/tmp/does-not-exist-threadport-validation-report')).rejects.toThrow();
  });

  it('skips browser and Docker steps with explicit reasons when tools are unavailable', async () => {
    const calls: string[] = [];
    const result = await runValidation({
      candidateSha: 'c'.repeat(40),
      workingTree: { state: 'unknown', dirty: null, statusDigest: null },
      runtime: { node: 'v24.18.1', npm: null, platform: 'linux', arch: 'x64' },
      steps: [
        { ...baseStep('browser'), requires: 'chrome' },
        { ...baseStep('docker'), requires: 'docker' },
      ],
      probes: { chrome: false, docker: false },
      execute: async (step) => {
        calls.push(step.id);
        return { status: 'passed', exitCode: 0, stdout: '', stderr: '' };
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.report.summary).toEqual({ passed: 0, failed: 0, skipped: 2, status: 'passed' });
    expect(result.report.steps).toEqual([
      expect.objectContaining({ id: 'browser', status: 'skipped', exitCode: null, skipReason: 'chrome unavailable' }),
      expect.objectContaining({ id: 'docker', status: 'skipped', exitCode: null, skipReason: 'docker unavailable' }),
    ]);
    expect(calls).toEqual([]);
  });
});
