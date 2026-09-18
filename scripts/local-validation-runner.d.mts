export type Requirement = 'chrome' | 'docker';
export type ValidationStep = {
  id: string;
  title: string;
  executable: string;
  args: string[];
  requires?: Requirement;
  env?: Record<string, string>;
  timeoutMs?: number;
};
export type CommandResult = {
  status: 'passed' | 'failed';
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errorCode?: string;
};
export type ValidationReport = {
  schema: string;
  collectedAt: string;
  candidateSha: string | null;
  workingTree: { state: 'clean' | 'dirty' | 'unknown'; dirty: boolean | null; statusDigest: string | null };
  runtime: { node: string; npm: string | null; platform: string; arch: string; kernel?: string };
  probes: { chrome: boolean; docker: boolean };
  steps: Array<{
    id: string;
    title: string;
    command: { executable: string; args: string[] };
    status: 'passed' | 'failed' | 'skipped';
    exitCode: number | null;
    startedAt: string;
    finishedAt: string;
    stdoutDigest: string;
    stderrDigest: string;
    skipReason?: string;
    errorCode?: string;
  }>;
  summary: { passed: number; failed: number; skipped: number; status: 'passed' | 'failed' };
};
export const defaultSteps: (options?: { cwd?: string; packageOutput?: string }) => ValidationStep[];
export function executeArgv(step: ValidationStep, options?: { cwd?: string; timeoutMs?: number }): Promise<CommandResult>;
export function runValidation(options?: {
  cwd?: string;
  steps?: ValidationStep[];
  execute?: (step: ValidationStep) => Promise<CommandResult>;
  probes?: { chrome: boolean; docker: boolean };
  candidateSha?: string | null;
  workingTree?: ValidationReport['workingTree'];
  runtime?: ValidationReport['runtime'];
  now?: () => string;
  reportPath?: string;
  writeReport?: (path: string, report: ValidationReport) => Promise<void>;
}): Promise<{ report: ValidationReport; reportPath: string; exitCode: number }>;
export function writeValidationReport(path: string, report: ValidationReport): Promise<void>;
export function main(argv?: string[]): Promise<number>;
