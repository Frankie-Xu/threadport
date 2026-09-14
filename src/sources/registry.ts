import { createClaudeSource } from './claude-source.js';
import { DomainError } from '../domain/errors.js';
import type { SourceAdapter, SourceDiagnostic } from './contracts.js';
export function createSourceRegistry(configs:readonly {agent:string;sourceId:string;roots:readonly string[]}[],onDiagnostic?:(value:SourceDiagnostic)=>void):ReadonlyMap<string,SourceAdapter>{
 const registry=new Map<string,SourceAdapter>();
 for(const config of configs){
  if(config.agent!=='claude'||registry.has(config.sourceId))throw new DomainError('INVALID_INPUT','Unsupported or duplicate source configuration.');
  registry.set(config.sourceId,createClaudeSource({...config,onDiagnostic}));
 }
 return registry;
}
export { createClaudeSource };
export type { SourceAdapter, SourceCandidate, SourceReadResult, ReadCursor, SourceDiagnostic } from './contracts.js';
