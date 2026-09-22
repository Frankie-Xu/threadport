import type { ControlEvent } from './contracts.js';
import type { ControlPlaneStore } from '../storage/control-plane-store.js';
import { rebuildControlState, type ControlState } from './reducer.js';
export class ControlPlaneService {
  constructor(private readonly store:ControlPlaneStore){}
  append(events:readonly ControlEvent[]):{inserted:string[];duplicate:string[]}{return this.store.appendEvents(events);}
  events(afterSequence=0,limit=1000):ControlEvent[]{return this.store.readEvents(afterSequence,limit);}
  state(taskId?:string):ControlState { const events=this.store.readAllEvents().filter(event=>taskId===undefined||event.taskId===taskId); const state=rebuildControlState(events); for(const manifest of this.store.listManifests(taskId))state.manifests[manifest.handoffId]=manifest; if(taskId!==undefined)for(const receipt of this.store.listReceiptsForTask(taskId))state.receipts[receipt.receiptId]=receipt; else for(const manifest of this.store.listManifests())for(const receipt of this.store.listReceipts(manifest.handoffId))state.receipts[receipt.receiptId]=receipt; return state; }
  manifest(handoffId:string){return this.store.getManifest(handoffId);}
  receipt(input:Parameters<ControlPlaneStore['saveReceipt']>[0]){return this.store.saveReceipt(input);}
}
