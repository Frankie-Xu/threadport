import type { TaskHandoff } from '../handoff/contracts.js';
export type TargetAgent='claude'|'codex';
export interface TargetCapability {agent:TargetAgent;installed:boolean;version:string|null;auth:'unknown';nativeResume:boolean;newSessionWithContext:boolean;reason:string|null}
export interface LaunchSpec {executable:string;args:string[];cwd:string;input:{kind:'argv';value:string}|{kind:'stdin';value:string}|{kind:'file';path:string;digest:string}|{kind:'native-session';vendorSessionId:string}}
export interface RunnerInput {handoff:TaskHandoff;workspaceRoot:string;vendorSessionId:string|null}
export interface TargetRunner {readonly agent:TargetAgent;detect():Promise<TargetCapability>;prepare(input:RunnerInput):Promise<LaunchSpec>}
