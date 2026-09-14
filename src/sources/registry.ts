import { createCodexSource } from './codex-source.js';
import { createClaudeSource } from './claude-source.js';
import { DomainError } from '../domain/errors.js';
import type { SourceAdapter, SourceDiagnostic } from './contracts.js';
export function createSourceRegistry(configs:readonly {agent:string;sourceId:string;roots:readonly string[]}[],onDiagnostic?:(value:SourceDiagnostic)=>void):ReadonlyMap<string,SourceAdapter>{
 const registry=new Map<string,SourceAdapter>();
 for(const config of configs){
  if(!['claude','codex'].includes(config.agent)||registry.has(config.sourceId))throw new DomainError('INVALID_INPUT','Unsupported or duplicate source configuration.');
  registry.set(config.sourceId,(config.agent==='claude'?createClaudeSource:createCodexSource)({...config,onDiagnostic}));
 }
 return registry;
}
export { createClaudeSource, createCodexSource };
export type { SourceAdapter, SourceCandidate, SourceReadResult, ReadCursor, SourceDiagnostic } from './contracts.js';
