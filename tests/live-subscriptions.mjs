import assert from 'node:assert/strict';
import {LiveSubscriptions,pageTagIds} from '../static/live-subscriptions.js';
assert.deepEqual(pageTagIds({controls:[{binding:{tag:'a'},actions:[{action:'set',tag:'b'},{action:'navigate',tag:'ignored'}],events:[{tag:'a',operand:{kind:'tag',tag:'c'},end_operand:{kind:'tag',tag:'d'}}]}]}).sort(),['a','b','c','d']);
const timers=new Map(),calls=[],received=[];let next=0;
const manager=new LiveSubscriptions({
  now:()=>0,
  fetchBatch:async job=>{calls.push({source:job.source,tags:[...job.tags]});return {values:{},live:job.source==='fast'?0.5:3.1};},
  onData:(data,job)=>received.push(job.source),onError:error=>{throw error;},
  setTimer:(fn,delay)=>{timers.set(++next,{fn,delay});return next;},clearTimer:id=>timers.delete(id)
});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const groups=[{source:'fast',tags:['a','b'],pages:['main'],interval:500},{source:'slow',tags:['c'],pages:['main'],interval:3100}];
manager.update(groups);await settle();
assert.equal(calls.length,2);assert.deepEqual([...timers.values()].map(timer=>timer.delay).sort((a,b)=>a-b),[500,3100]);
manager.update(groups);await settle();assert.equal(calls.length,2);
manager.update([{...groups[0],tags:['a','b','popup'],pages:['main','popup']},groups[1]]);await settle();
assert.equal(calls.length,3);assert.deepEqual(calls.at(-1).tags,['a','b','popup']);
manager.update(groups);await settle();assert.deepEqual(calls.at(-1).tags,['a','b']);
manager.close();assert.equal(timers.size,0);
let release;let active=0,maxActive=0,applied=0;
const blocked=new LiveSubscriptions({fetchBatch:()=>{active++;maxActive=Math.max(maxActive,active);return new Promise(resolve=>{release=()=>{active--;resolve({values:{}});};});},onData:()=>applied++,setTimer:()=>1,clearTimer:()=>{}});
blocked.update([groups[0]]);const pending=blocked.refreshAll();assert.equal(maxActive,1);
blocked.close();release();await pending;assert.equal(applied,0);
console.log('Per-source batching, intervals, popup updates, no overlap, and late-result cleanup passed.');

let clock=0,nextTimer,releaseTimed,starts=[],running=0,maximum=0;
const paced=new LiveSubscriptions({now:()=>clock,
 fetchBatch:()=>{starts.push(clock);running++;maximum=Math.max(maximum,running);return new Promise(resolve=>{releaseTimed=()=>{running--;resolve({values:{},live:.5});};});},
 onData:()=>{clock+=30;},setTimer:(fn,delay)=>{nextTimer={fn,delay};return 1;},clearTimer:()=>{}});
paced.update([groups[0]]);clock=120;releaseTimed();await settle();
assert.equal(nextTimer.delay,350);
clock+=nextTimer.delay;nextTimer.fn();assert.deepEqual(starts,[0,500]);
clock+=800;releaseTimed();await settle();assert.equal(nextTimer.delay,0);
nextTimer.fn();assert.equal(maximum,1);
paced.close();releaseTimed();await settle();
let rejectTimed;clock=0;
const failing=new LiveSubscriptions({now:()=>clock,fetchBatch:()=>new Promise((_,reject)=>{rejectTimed=reject;}),onData:()=>{},onError:()=>{},setTimer:(fn,delay)=>{nextTimer={fn,delay};return 1;},clearTimer:()=>{}});
failing.update([groups[0]]);clock=2000;rejectTimed(new Error('Timed out'));await settle();assert.equal(nextTimer.delay,500);failing.close();
console.log('Fetch/paint time is included in cadence; slow requests do not overlap and errors keep retry delays.');
