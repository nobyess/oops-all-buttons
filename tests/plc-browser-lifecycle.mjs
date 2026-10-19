import assert from 'node:assert/strict';
import {plcTagBrowser} from '../static/plc-tag-browser.js';
class Element {
 constructor(){this.children=[];this.dataset={};this.style={};this.isConnected=true;this.scrollTop=0;this.classList={add(){}};this.listeners={};}
 append(child){child.parentElement=this;this.children.push(child);}
 insertBefore(child){this.append(child);}
 replaceChildren(){this.children=[];}
 closest(){return modal;}
 setAttribute(){} focus(){}
 querySelectorAll(){return [];}
 getBoundingClientRect(){return {top:0,bottom:100};}
 addEventListener(name,fn){this.listeners[name]=fn;}
}
const walk=el=>el.children.flatMap(child=>[child,...walk(child)]);
const node=(tag,text,parent,attrs={})=>{const el=Object.assign(new Element(),attrs);el.textContent=text;parent?.append(el);return el;};
const button=(text,parent,onclick)=>node('button',text,parent,{onclick});
const field=(text,parent)=>node('input',text,parent,{value:''});
const oldSet=globalThis.setTimeout,oldClear=globalThis.clearTimeout,timers=new Map();let identity=0,modal;
globalThis.setTimeout=fn=>{const id=++identity;timers.set(id,fn);return id;};globalThis.clearTimeout=id=>timers.delete(id);
let reads=0;
try{
 for(let index=0;index<20;index++){
  modal=new Element();let body,resolveRead;
  plcTagBrowser({source:{id:'plc',name:'PLC'},node,button,field,dialog:(title,render)=>{body=new Element();const footer=new Element(),submit=new Element();footer.append(submit);render(body,submit);},api:()=>{reads++;return new Promise(resolve=>{resolveRead=resolve;});}});
  const search=walk(body).find(el=>el.className==='plc-tag-search');search.value='Motor';search.oninput();assert.equal(timers.size,1);
  modal.listeners.close();assert.equal(timers.size,0);
  const before=reads;resolveRead({items:[],total:0,timestamp:0});await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,before);
  search.oninput();const callback=[...timers.values()][0];timers.clear();await callback();assert.equal(reads,before,'A queued search cannot restart a closed browser');
 }
 console.log('PLC browser clears search debounces and ignores late responses after repeated close cycles.');
}finally{globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;}
