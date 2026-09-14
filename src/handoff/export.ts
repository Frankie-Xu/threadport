import { DomainError } from '../domain/errors.js';
import { publicText } from '../privacy.js';
import { sha256,taskHandoffSchema,type TaskHandoff } from './contracts.js';
/** Reject altered portable text; never silently transform an already-reviewed prompt. */
export function validateExport(input:TaskHandoff):TaskHandoff{
 const parsed=taskHandoffSchema.safeParse(input);if(!parsed.success)throw new DomainError('INVALID_INPUT','Invalid task handoff.');
 const handoff=parsed.data;if(sha256(handoff.prompt)!==handoff.promptDigest)throw new DomainError('REVISION_CONFLICT','Preview changed; prepare again.');
 const inspect=(value:unknown):void=>{if(typeof value==='string'){if(publicText(value)!==value)throw new DomainError('REDACTION_REQUIRED','Review portable redaction before export.');}else if(Array.isArray(value))value.forEach(inspect);else if(value&&typeof value==='object')Object.values(value).forEach(inspect);};
 inspect(handoff);return handoff;
}
export function exportHandoff(input:TaskHandoff,format:'json'|'markdown'):string{
 const handoff=validateExport(input);if(format==='markdown')return handoff.prompt;
 if(format==='json')return JSON.stringify(handoff,null,2)+'\n';throw new DomainError('INVALID_INPUT','Unsupported export format.');
}
