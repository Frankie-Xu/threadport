import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentId } from "./types.js";

const execFileAsync = promisify(execFile);
const commands: Record<Exclude<AgentId, "unknown">, string> = {
  claude: "claude",
  codex: "codex",
  cursor: "cursor",
  gemini: "gemini"
};

export interface TargetAvailability { agent: Exclude<AgentId, "unknown">; command: string; available: boolean; }

export async function detectTargets(): Promise<TargetAvailability[]> {
  return Promise.all((Object.entries(commands) as [TargetAvailability["agent"], string][]).map(async ([agent, command]) => {
    try { await execFileAsync("which", [command]); return { agent, command, available: true }; }
    catch { return { agent, command, available: false }; }
  }));
}

export function suggestedLaunch(agent: Exclude<AgentId, "unknown">, handoffFile: string): string {
  return `${commands[agent]} --prompt-file "${handoffFile}"`;
}
