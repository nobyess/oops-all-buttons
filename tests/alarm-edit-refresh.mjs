import assert from 'node:assert/strict';
import {mountAlarms} from '../static/alarms-manager.js';
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.classList={toggle(){}};this.style={};}
 append(child){child.parentElement=this;this.children.push(child);}
 replaceChildren(){this.children=[];}
 setAttribute(key,value){this[key]=value;}
 querySelector(selector){return descendants(this).find(el=>el.tagName===selector);}
 focus(){}
}
const descendants=root=>root.children.flatMap(child=>[child,...descendants(child)]);
const node=(tag,text,parent,attrs={})=>{const el=Object.assign(new Element(tag),attrs);if(text!==null)el.textContent=text;parent?.append(el);return el;};
const button=(text,parent,onclick)=>node('button',text,parent,{onclick});
globalThis.document={visibilityState:'visible'};
globalThis.window={addEventListener(){},removeEventListener(){}};
const originalInterval=globalThis.setInterval,originalClear=globalThis.clearInterval,timers=[];
globalThis.setInterval=(fn,ms)=>{timers.push({fn,ms});return timers.length;};globalThis.clearInterval=()=>{};
let items=[{id:'a',name:'Alarm',message:'Message',enabled:true,event:{tag:'level',operator:'>',operand:{kind:'value',value:80}},state:{active:false}}],saved;
const api=async(path,data)=>{if(path==='alarms')return structuredClone(items);if(path==='admin/alarms/save'){saved=structuredClone(data);items=[structuredClone(data)];return structuredClone(data);}throw new Error(path);};
const parent=new Element('main');
let close;
try{
 close=mountAlarms(parent,{node,button,api,canManage:true,getTags:()=>[],tagSelect:(label,parent,value,onChange)=>{const box=node('input',null,node('label',label,parent),{value});box.oninput=()=>onChange(box.value);},initialId:'a'});
 const settle=()=>new Promise(resolve=>setImmediate(resolve));await settle();
 const all=()=>descendants(parent),field=label=>all().find(el=>el.tagName==='label' && el.textContent===label)?.children[0];
 const message=field('Alarm Message');assert.equal(message.tagName,'input');assert.equal(message.type,'text');
 const value=field('Compare To');assert.equal(value.value,80);
 // The poll replaces the draft while retaining the existing input DOM node.
 timers.find(t=>t.ms===1000).fn();await settle();assert.equal(field('Compare To'),value);
 value.value='91.5';value.oninput();
 await all().find(el=>el.tagName==='button' && el.textContent==='Save Alarm').onclick();
 assert.equal(saved.event.operand.value,91.5);
 await settle();all().find(el=>el.tagName==='button' && el.textContent==='Revert').onclick();
 assert.equal(field('Compare To').value,91.5);
 // Mode and tag edits must also target the current draft after a poll.
 timers.find(t=>t.ms===1000).fn();await settle();const mode=field('Compare To type');mode.value='tag';mode.onchange();
 const tag=field('Compare To');tag.value='limit';tag.oninput();
 await all().find(el=>el.tagName==='button' && el.textContent==='Save Alarm').onclick();
 assert.equal(saved.event.operand.kind,'tag');assert.equal(saved.event.operand.tag,'limit');
 console.log('Alarm numeric/type/tag edits survive refresh and save; message is a single-line text input.');
}finally{close?.();globalThis.setInterval=originalInterval;globalThis.clearInterval=originalClear;}
