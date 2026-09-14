import type { Claim,Task,NormalizedEvent,CommandRun } from '../domain/models.js';
import { publicText } from '../privacy.js';
const claim=(value:Claim)=>({text:publicText(value.text),origin:value.origin,evidence:value.evidence.map(e=>({sessionId:e.sessionId,eventId:e.eventId})),updatedAt:value.updatedAt});
export const taskDto=(value:Task)=>({id:value.id,projectId:value.projectId,revision:value.revision,title:publicText(value.title),objective:claim(value.objective),constraints:value.constraints.map(claim),nextAction:claim(value.nextAction),lifecycle:value.lifecycle,archived:value.archived,createdAt:value.createdAt,updatedAt:value.updatedAt});
const run=(value:CommandRun)=>({id:value.id,sessionId:value.sessionId,ordinal:value.ordinal,command:publicText(value.command),cwd:value.cwd===null?null:publicText(value.cwd),exitCode:value.exitCode,startedAt:value.startedAt,completedAt:value.completedAt,eventId:value.eventId,snapshotId:value.snapshotId});
export const eventDto=(event:NormalizedEvent)=>({id:event.id,sessionId:event.sessionId,ordinal:event.ordinal,occurredAt:event.occurredAt,kind:event.kind,text:publicText(event.text),commandRun:event.commandRun?run(event.commandRun):null,relativePaths:event.relativePaths.map(publicText),omitted:event.omitted});
export {claim as claimDto,run as runDto};
