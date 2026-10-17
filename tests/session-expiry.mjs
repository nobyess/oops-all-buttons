import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('static/app.js','utf8');
function scenario(fetch){
 let calls=0,closed=0,auth=0;const notices=[];
 const context=vm.createContext({AbortController,setTimeout,clearTimeout,fetch:async(...args)=>{calls++;return fetch(...args);},subscriptions:{close:()=>closed++},account:{replaceChildren(){}},document:{body:{},querySelectorAll:()=>[]},node(tag,text,parent,attrs){const el={tag,text,...attrs,setAttribute(){},showModal(){this.open=true;},close(){this.open=false;this.onclose?.();},remove(){}};if(tag==='dialog')notices.push(el);return el;},button(){},auth(){auth++;}});
 vm.runInContext("let csrf='old-session',catalog={},dirty=true,page={id:'draft'},selected='c',tab='Properties',ruleId=null,pickerInterest='',lastInterest='',interestAt=0;"+source.slice(source.indexOf('let suspendedEditor='),source.indexOf('async function safe(')),context);
 return {context,notices,counts:()=>({calls,closed,auth})};
}
const expired=scenario(async()=>({status:401,ok:false,json:async()=>({error:'Please sign in'})}));
await assert.rejects(vm.runInContext("api('polling/interest',{})",expired.context));
assert.deepEqual(expired.counts(),{calls:1,closed:1,auth:1});assert.equal(expired.notices.length,1);assert(expired.notices[0].open);
assert.equal(vm.runInContext('suspendedEditor.page.id',expired.context),'draft');
for(let i=0;i<100;i++)await assert.rejects(vm.runInContext("api('polling/interest',{})",expired.context));
assert.equal(expired.counts().calls,1);assert.equal(expired.notices.length,1);
const disconnected=scenario(async()=>{throw new TypeError('Failed to fetch');});
await assert.rejects(vm.runInContext("api('values/batch',{})",disconnected.context),/Cannot reach the server/);
assert.deepEqual(disconnected.counts(),{calls:1,closed:1,auth:1});assert(disconnected.notices[0].open);
const badLogin=scenario(async()=>({status:401,ok:false,json:async()=>({error:'Invalid credentials'})}));
await assert.rejects(vm.runInContext("api('login',{})",badLogin.context),/Invalid credentials/);assert.equal(badLogin.notices.length,0);
console.log('Session and connection failures show sign-in and a persistent dialog, preserve drafts, and stop requests.');
