import type { ControlEvent } from './contracts.js';
import type { ControlPlaneStore } from '../storage/control-plane-store.js';
import { rebuildControlState, type ControlState } from './reducer.js';
export class ControlPlaneService {
  constructor(private readonly store:ControlPlaneStore){}
  append(events:readonly ControlEvent[]):{inserted:string[];duplicate:string[]}{return this.store.appendEvents(events);}
  events(afterSequence=0,limit=1000):ControlEvent[]{return this.store.readEvents(afterSequence,limit);}
  state(taskId?:string):ControlState {
    const events=taskId===undefined?this.store.readAllEvents():this.store.readTaskEvents(taskId);
    const state=rebuildControlState(events);
    for(const manifest of this.store.listManifests(taskId))state.manifests[manifest.handoffId]=manifest;
    const receipts=taskId===undefined?this.store.listAllReceipts():this.store.listReceiptsForTask(taskId);
    for(const receipt of receipts)state.receipts[receipt.receiptId]=receipt;
    return state;
  }
  manifest(handoffId:string){return this.store.getManifest(handoffId);}
  receipt(input:Parameters<ControlPlaneStore['saveReceipt']>[0]){return this.store.saveReceipt(input);}
}
