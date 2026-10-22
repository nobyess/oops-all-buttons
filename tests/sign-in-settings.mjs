import assert from 'node:assert/strict';
import {mountSignInSettings} from '../static/sign-in-settings.js';
class Element{constructor(){this.children=[];this.value='';}append(child){this.children.push(child);}}
const node=(tag,text,parent,props={})=>{const el=Object.assign(new Element(),{tagName:tag,textContent:text},props);parent?.append(el);return el;};
const all=el=>[el,...el.children.flatMap(all)],settle=()=>new Promise(resolve=>setImmediate(resolve));
let calls=[];const root=new Element();const close=mountSignInSettings(root,{node,api:async(path)=>{calls.push(path);return {required:false,has_administrator:false};}});
await settle();const elements=all(root),mode=elements.find(el=>el.tagName==='select'),inputs=elements.filter(el=>el.tagName==='input');
assert(!close.isDirty());mode.value='required';mode.onchange();assert(close.isDirty());assert.throws(()=>close.data(),/administrator/);
inputs[0].value='Admin';inputs[1].value=inputs[2].value='password-123';assert.deepEqual(close.data(),{required:true,username:'Admin',password:'password-123'});assert.equal(calls.length,1);
close.revert();assert(!close.isDirty());assert(inputs.every(el=>el.value===''));assert.equal(mode.value,'automatic');
console.log('Sign-in settings stages credentials, validates and reverts without writing.');
