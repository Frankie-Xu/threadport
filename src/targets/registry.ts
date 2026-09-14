import { ClaudeRunner } from './claude.js';
import { CodexRunner } from './codex.js';
import type { ProbeOptions } from './detect.js';
import type { TargetAgent,TargetRunner } from './contracts.js';
export function targetRunners(options:ProbeOptions={}):Record<TargetAgent,TargetRunner>{return {claude:new ClaudeRunner(options),codex:new CodexRunner(options)};}
export async function detectTargetCapabilities(options:ProbeOptions={}){return Promise.all(Object.values(targetRunners(options)).map(runner=>runner.detect()));}
