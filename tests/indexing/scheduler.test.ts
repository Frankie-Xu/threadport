import { afterEach, expect, it, vi } from 'vitest';
import { scheduleRefresh, ReadSlots } from '../../src/indexing/scheduler.js';
afterEach(()=>vi.useRealTimers());
it('refreshes every 15 seconds only while started',async()=>{
 vi.useFakeTimers();const refresh=vi.fn(async()=>{});const stop=scheduleRefresh(refresh);
 await vi.advanceTimersByTimeAsync(14999);expect(refresh).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(refresh).toHaveBeenCalledTimes(1);stop();await vi.advanceTimersByTimeAsync(30000);expect(refresh).toHaveBeenCalledTimes(1);
});
it('skips overlapping ticks and resumes after rejected or synchronously failed refreshes',async()=>{
 vi.useFakeTimers();let finish!:()=>void;const pending=new Promise<void>(resolve=>{finish=resolve;});
 const refresh=vi.fn<()=>Promise<unknown>>().mockImplementationOnce(()=>pending).mockRejectedValueOnce(new Error('synthetic async failure')).mockImplementationOnce(()=>{throw new Error('synthetic sync failure');}).mockResolvedValue(undefined);
 const stop=scheduleRefresh(refresh);
 try{
  await vi.advanceTimersByTimeAsync(60000);expect(refresh).toHaveBeenCalledTimes(1);
  finish();await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(15000);expect(refresh).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(15000);expect(refresh).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(15000);expect(refresh).toHaveBeenCalledTimes(4);
 }finally{finish();stop();}
 await vi.advanceTimersByTimeAsync(30000);expect(refresh).toHaveBeenCalledTimes(4);
});
it('removes cancelled waiters without consuming a read slot',async()=>{
 const slots=new ReadSlots();const signal=new AbortController().signal;const a=await slots.acquire(signal);const b=await slots.acquire(signal);const controller=new AbortController();const waiting=slots.acquire(controller.signal);const rejected=expect(waiting).rejects.toMatchObject({name:'AbortError'});controller.abort();await rejected;a();b();const release=await slots.acquire(signal);release();
});
