import assert from 'node:assert/strict';
import {mountServerSettings} from '../static/server-settings.js';
class Element{constructor(){this.children=[];this.value='';}append(child){this.children.push(child);}}
const node=(tag,text,parent,props={})=>{const el=Object.assign(new Element(),{tagName:tag,textContent:text},props);parent?.append(el);return el;};
const all=el=>[el,...el.children.flatMap(all)],settle=()=>new Promise(resolve=>setImmediate(resolve));
const root=new Element();let calls=[];
const close=mountServerSettings(root,{node,api:async(path,data)=>{calls.push({path,data});return path==='admin/sign-in'?{required:true,has_administrator:true}:{port:8080,can_restart:true};}});
await settle();const input=all(root).find(el=>el.type==='number');assert(!input.disabled);assert(!close.isDirty());
input.value='65536';input.oninput();assert(close.isDirty());assert.throws(()=>close.data(),/port/);
input.value='8090';assert.deepEqual(close.data(),{port:8090});assert(calls.every(call=>!call.data));close.revert();assert.equal(input.value,8080);assert(!close.isDirty());
close();console.log('Server settings stages port edits, validates and reverts without sending writes.');
