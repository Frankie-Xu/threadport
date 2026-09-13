import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { TargetAgent } from './handoff.js';

const commands: Record<TargetAgent, string> = { claude: 'claude', codex: 'codex', cursor: 'cursor', gemini: 'gemini' };
export interface TargetAvailability {
  agent: TargetAgent;
  command: string;
  available: boolean;
  executable?: string;
  launch_supported: false;
  reason: 'found_unverified' | 'not_found' | 'not_accessible';
}
export interface TargetDetectionOptions { path?: string; platform?: NodeJS.Platform; pathExt?: string; }

/** PATH discovery only: never runs a shell, lookup utility, or agent. Existence is not a vendor identity check. */
export async function detectTargets(options: TargetDetectionOptions = {}): Promise<TargetAvailability[]> {
  const windows = (options.platform ?? process.platform) === 'win32';
  const path = options.path ?? process.env.PATH ?? '';
  // Empty/relative PATH entries are deliberately ignored rather than executing project-local files.
  const directories = path.split(windows ? ';' : ':').map(p => p.replace(/^"|"$/g, '')).filter(p => p && isAbsolute(p));
  const extensions = windows ? (options.pathExt ?? process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(e => /^\.[A-Za-z0-9]+$/.test(e)) : [''];
  return Promise.all((Object.entries(commands) as [TargetAgent, string][]).map(async ([agent, command]) => {
    let reason: TargetAvailability['reason'] = 'not_found';
    for (const directory of directories) for (const extension of extensions) {
      // Both casings also allow Windows-rule tests on a case-sensitive host.
      for (const suffix of [...new Set([extension.toLowerCase(), extension.toUpperCase()])]) {
        const executable = join(directory, `${command}${suffix}`);
        try {
          if (!(await stat(executable)).isFile()) continue;
          await access(executable, windows ? constants.F_OK : constants.X_OK);
          return { agent, command, available: true, executable, launch_supported: false as const, reason: 'found_unverified' as const };
        } catch (error) {
          if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) reason = 'not_accessible';
        }
      }
    }
    return { agent, command, available: false, launch_supported: false as const, reason };
  }));
}

/** @deprecated Automatic launch is not supported; import the handoff manually. No guessed shell strings. */
export function suggestedLaunch(_agent: TargetAgent, _handoffFile: string): never {
  throw new Error('Automatic launch is not supported. Review and import the handoff file manually.');
}
