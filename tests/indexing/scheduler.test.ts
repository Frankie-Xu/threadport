import { afterEach, expect, it, vi } from 'vitest';
import { scheduleRefresh, ReadSlots } from '../../src/indexing/scheduler.js';
afterEach(()=>vi.useRealTimers());
it('refreshes every 15 seconds only while started',async()=>{
 vi.useFakeTimers();const refresh=vi.fn(async()=>{});const stop=scheduleRefresh(refresh);
 await vi.advanceTimersByTimeAsync(14999);expect(refresh).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(refresh).toHaveBeenCalledTimes(1);stop();await vi.advanceTimersByTimeAsync(30000);expect(refresh).toHaveBeenCalledTimes(1);
});
it('removes cancelled waiters without consuming a read slot',async()=>{
 const slots=new ReadSlots();const signal=new AbortController().signal;const a=await slots.acquire(signal);const b=await slots.acquire(signal);const controller=new AbortController();const waiting=slots.acquire(controller.signal);const rejected=expect(waiting).rejects.toMatchObject({name:'AbortError'});controller.abort();await rejected;a();b();const release=await slots.acquire(signal);release();
});
