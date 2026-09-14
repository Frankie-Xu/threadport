/** A cancellable two-slot queue shared by all source jobs in one service. */
export class ReadSlots {
 private active=0;
 private readonly queue:(()=>void)[]=[];
 async acquire(signal:AbortSignal):Promise<()=>void>{
  signal.throwIfAborted();
  if(this.active>=2)await new Promise<void>((resolve,reject)=>{
   const ready=()=>{signal.removeEventListener('abort',abort);resolve();};
   const abort=()=>{const index=this.queue.indexOf(ready);if(index>=0)this.queue.splice(index,1);reject(signal.reason);};
   this.queue.push(ready);signal.addEventListener('abort',abort,{once:true});
  });
  // A released slot is reserved for the next waiter before it resumes.
  else this.active++;
  if(signal.aborted){this.release();signal.throwIfAborted();}
  let released=false;return()=>{if(!released){released=true;this.release();}};
 }
 private release(){const next=this.queue.shift();if(next)next();else this.active--;}
}
export function scheduleRefresh(refresh:()=>Promise<unknown>):()=>void{
 const timer=setInterval(()=>{void refresh().catch(()=>{/* Individual jobs retain their failure status. */});},15000);timer.unref();return()=>clearInterval(timer);
}
