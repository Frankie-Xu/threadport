import type { Claim,Task,NormalizedEvent,CommandRun } from '../domain/models.js';
import { publicText } from '../privacy.js';
import type { InnerAgentEvidence } from '../evidence/observations.js';
import { innerObservationSchema } from '../evidence/observations.js';
const claim=(value:Claim)=>({text:publicText(value.text),origin:value.origin,evidence:value.evidence.map(e=>({sessionId:e.sessionId,eventId:e.eventId})),updatedAt:value.updatedAt});
export const taskDto=(value:Task)=>({id:value.id,projectId:value.projectId,revision:value.revision,title:publicText(value.title),objective:claim(value.objective),constraints:value.constraints.map(claim),nextAction:claim(value.nextAction),lifecycle:value.lifecycle,archived:value.archived,createdAt:value.createdAt,updatedAt:value.updatedAt});
const run=(value:CommandRun)=>({id:value.id,sessionId:value.sessionId,ordinal:value.ordinal,command:publicText(value.command),cwd:value.cwd===null?null:publicText(value.cwd),exitCode:value.exitCode,startedAt:value.startedAt,completedAt:value.completedAt,eventId:value.eventId,snapshotId:value.snapshotId});
export const eventDto=(event:NormalizedEvent)=>({id:event.id,sessionId:event.sessionId,ordinal:event.ordinal,occurredAt:event.occurredAt,kind:event.kind,text:publicText(event.text),commandRun:event.commandRun?run(event.commandRun):null,relativePaths:event.relativePaths.map(publicText),omitted:event.omitted});
export {claim as claimDto,run as runDto};
/** Redacted evidence detail for the read-only API; observation payloads are never returned. */
export const innerEvidenceDto=(value:InnerAgentEvidence)=>({
 protocol:value.protocol,eventId:value.eventId,kind:value.kind,sourceProtocol:value.sourceProtocol,
 resultStatus:value.resultStatus,exitCode:value.exitCode,applicability:value.applicability,
 workspace:value.workspace,environment:{scope:value.environment.scope,complete:value.environment.complete},reasons:value.reasons,
});
const innerObservationDto=(value:unknown)=>{
 const parsed=innerObservationSchema.safeParse(value);
 if(!parsed.success)return {status:'unverified' as const};
 return {
   status:parsed.data.status,
   eventId:parsed.data.eventId,
   kind:parsed.data.kind,
   source:{protocol:parsed.data.source.protocol,agent:parsed.data.source.agent,version:parsed.data.source.version,origin:parsed.data.source.origin},
   workspace:{beforeSnapshotId:parsed.data.workspace.beforeSnapshotId,afterSnapshotId:parsed.data.workspace.afterSnapshotId,scope:parsed.data.workspace.scope},
   environment:{scope:parsed.data.environment.scope,complete:parsed.data.environment.complete},
 };
};
export const eventDtoWithInnerEvidence=(event:NormalizedEvent)=>({
 ...eventDto(event),
 ...(event.kind==='command'
   ? {innerObservation:innerObservationDto(event.innerObservation)}
   : event.innerObservation===undefined ? {} : {innerObservation:innerObservationDto(event.innerObservation)}),
});
