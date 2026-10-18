import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('static/app.js','utf8');
let release,groups;
const interest=new Promise(resolve=>{release=resolve;});
const context=vm.createContext({
 csrf:true,syncPageLifecycles:()=>{},sendInterest:()=>interest,
 document:{visibilityState:'visible',querySelectorAll:()=>[{dataset:{pageId:'main'}}]},
 activeViewIds:['main'],controlStates:{},liveOwners:()=>[{id:'main'}],pageTagIds:()=>['value'],
 tags:[{id:'value',source:'memory'}],sources:[{id:'memory',settings:{live:.5}}],
 refreshPolicy:{defaultLive:500},subscriptions:{update:value=>{groups=value;}}
});
vm.runInContext(source.slice(source.indexOf('async function syncLiveViews()'),source.indexOf('async function managementRefresh()')),context);
const pending=vm.runInContext('syncLiveViews()',context);
assert.equal(groups.length,1,'Batch loops must start before interest registration completes');
assert.equal(groups[0].source,'memory');assert.equal(groups[0].interval,500);
release();await pending;
console.log('Live batch loops start without waiting for the interest response.');
