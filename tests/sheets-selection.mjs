import assert from 'node:assert/strict';
import {mountSheets} from '../static/sheets-manager.js';
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.value='';this.classList={toggle(){}};}
 append(child){child.parentElement=this;this.children.push(child);}
 replaceChildren(){this.children=[];}
 setAttribute(key,value){this[key]=value;}
 querySelectorAll(tag){return this.children.filter(child=>child.tagName===tag);}
 focus(){}
}
const walk=el=>el.children.flatMap(child=>[child,...walk(child)]);
const node=(tag,text,parent,attrs={})=>{const el=Object.assign(new Element(tag),attrs);if(text!==null)el.textContent=text;parent?.append(el);return el;};
const button=(text,parent,onclick)=>node('button',text,parent,{onclick});
globalThis.document={visibilityState:'visible',createElement:tag=>new Element(tag)};
globalThis.window={addEventListener(){},removeEventListener(){}};
const timeout=globalThis.setTimeout,clear=globalThis.clearTimeout;
globalThis.setTimeout=()=>1;globalThis.clearTimeout=()=>{};
let requests=0,close;
try{
 const root=new Element('main'),items=['one','two'].map(id=>({id,name:id,settings:{filename:id+'.sheet.json',live:.5}}));
 close=mountSheets(root,{items,node,button,getSheet:async()=>{requests++;return {cells:{A1:{raw:'1'}},values:{A1:{quality:'good',value:1}},live:.5};},saveSheet:async()=>{throw new Error('Unexpected save');}});
 await new Promise(resolve=>setImmediate(resolve));
 const list=walk(root).find(el=>el.role==='listbox'),first=list.children[0],second=list.children[1];list.scrollTop=90;
 const grid=walk(root).find(el=>el.className==='sheet-grid');
 await first.onclick();await walk(root).find(el=>el.textContent==='Sheet').onclick();
 assert.equal(requests,1);assert.equal(walk(root).find(el=>el.className==='sheet-grid'),grid);
 await second.onclick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests,2);assert.equal(list.children[0],first);assert.equal(list.children[1],second);assert.equal(list.scrollTop,90);
 assert.equal(second['aria-selected'],'true');assert.equal(first['aria-selected'],'false');
 console.log('Sheet selection preserves list nodes/scroll; reselecting the current sheet/tab retains the grid and avoids reloads.');
}finally{close?.();globalThis.setTimeout=timeout;globalThis.clearTimeout=clear;}
