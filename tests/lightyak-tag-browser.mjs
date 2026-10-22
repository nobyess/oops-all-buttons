import assert from 'node:assert/strict';
import {lightyakTagBrowser} from '../static/lightyak-tag-browser.js';
class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.style={};this.listeners={};this.attributes={};this.value='';this.scrollTop=0;this.classList={add(){}};this.isConnected=true;}
 append(child){child.parentElement=this;this.children.push(child);}
 prepend(child){if(child.parentElement){const old=child.parentElement.children;const index=old.indexOf(child);if(index>=0)old.splice(index,1);}this.children.unshift(child);child.parentElement=this;}
 replaceChildren(){this.children=[];}
 closest(){return modal;}
 addEventListener(name,fn){this.listeners[name]=fn;}
 setAttribute(name,value){this.attributes[name]=value;}
 focus(){this.focused=true;}
 scrollIntoView(){}
}
const node=(tag,text,parent,attrs={})=>{const el=Object.assign(new Element(tag),attrs);el.textContent=text;parent?.append(el);return el;};
const field=(label,parent,type,value='')=>node('input',label,parent,{type,value});
const button=(label,parent,onclick)=>node('button',label,parent,{onclick});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const items=[{address:'0:1@1:1:heartbeat',reference:0,property:1,name:'Heartbeat',type:'BOOL',writable:false,added:false},
 {address:'0:3@1:8:revision',reference:0,property:3,name:'Catalog Revision',type:'UINT32',writable:false,added:true},
 {address:'1:0@1:1:motor',reference:1,property:0,name:'Motor Enabled',type:'BOOL',writable:true,added:false},
 {address:'2:0@1:9:temperature',reference:2,property:0,name:'Temperature',type:'FLOAT32',writable:true,added:false}];
let modal,body,submit,save,requests,resolvePreview,tree,name,search,footer;
function open(tag){
 modal=new Element();requests=[];
 lightyakTagBrowser({source:{id:'yak',name:'Source alias'},tag,node,field,button,
  dialog:(title,render)=>{body=new Element();footer=new Element();submit=new Element('button');footer.append(submit);save=render(body,submit);},
  api:(path,data)=>{requests.push({path,data});if(path==='sources/browse')return Promise.resolve({items,device_name:'Actual Device'});if(path==='sources/preview-tag')return new Promise(resolve=>{resolvePreview=resolve;});return Promise.resolve({});},
  reload:async()=>{},onDone(){}});
 tree=body.children.find(el=>el.role==='tree');name=footer.children.find(el=>el.className==='lightyak-tag-summary').children.find(el=>el.className==='plc-selected-tag');search=body.children.find(el=>el.type==='search');
}
const label=row=>row.children.find(el=>el.className==='plc-tag-name')?.textContent;
const row=text=>tree.children.find(el=>label(el)?.startsWith(text));
const click=text=>{assert(row(text),'Missing row '+text);row(text).onclick();};
function key(key){const event={key,preventDefault(){this.defaultPrevented=true;}};tree.onkeydown(event);return event;}
open();await settle();
assert.equal(search.attributes['aria-label'],'Filter LightYak tags');assert.equal(tree.attributes['aria-label'],'LightYak tags');
assert.equal(tree.children.length,3);assert(!row('Heartbeat'));assert.equal(row('Actual Device').attributes['aria-expanded'],'false');
assert.equal(label(row('Motor Enabled')),'Motor Enabled · Read/Write');
assert.equal(row('Temperature').children.find(el=>el.className==='plc-tag-type').textContent,'FLOAT32');
click('Actual Device');assert.equal(row('Actual Device').attributes['aria-expanded'],'true');assert.equal(row('Heartbeat').attributes['aria-level'],'2');
assert.equal(row('Catalog Revision').attributes['aria-disabled'],'true');assert(submit.disabled);
click('Heartbeat');assert.equal(name.textContent,'Source alias\\Heartbeat');assert(!submit.disabled);
assert(name.title.includes('Heartbeat · Target 0:1'));
assert(!body.children.some(el=>el.tag==='input' && el.type==='text'));
assert.equal(footer.children[0].className,'lightyak-tag-summary');
resolvePreview({quality:'good',value:true});await settle();assert(footer.children[0].children.some(el=>el.textContent==='Current value: 1'));
key('ArrowLeft');assert(submit.disabled);key('ArrowLeft');assert(!row('Heartbeat'));
key('ArrowRight');assert(row('Heartbeat'));key('ArrowRight');assert.equal(name.textContent,'Source alias\\Heartbeat');
key('End');assert.equal(name.textContent,'Source alias\\Temperature');
click('Motor Enabled');await save();assert.equal(requests.at(-1).data.name,'Motor Enabled');assert.equal(requests.at(-1).data.address,items[2].address);
click('Temperature');await save();assert.equal(requests.at(-1).data.address,items[3].address);assert.equal(requests.at(-1).data.name,'Temperature');
click('Motor Enabled');await save();assert.equal(requests.at(-1).data.name,'Motor Enabled');
click('Motor Enabled');const pending=resolvePreview;search.value='nothing';search.oninput();assert(submit.disabled);assert(!row('Motor Enabled'));
pending({quality:'good',value:999});await settle();assert(!footer.children[0].children.some(el=>el.textContent==='Current value: 999'));
search.value='Heartbeat';search.oninput();assert(row('Actual Device'));assert(row('Heartbeat'),'Filtering reveals collapsed system tags');
open({id:'saved',name:'Keep alias',address:items[0].address});await settle();
assert(row('Heartbeat'));assert(!submit.disabled);assert.equal(name.textContent,'Source alias\\Heartbeat');await save();
assert.equal(requests.at(-1).path,'tags/edit');assert.equal(requests.at(-1).data.id,'saved');
open({id:'saved',address:items[1].address.replace('0:3@1:', '0:99@0:')});await settle();
assert(row('Catalog Revision'));assert(!submit.disabled);await save();
assert.equal(requests.at(-1).data.address,items[1].address);
const before=footer.children[0].children.map(el=>el.textContent);modal.listeners.close();resolvePreview({quality:'good',value:999});await settle();
assert.deepEqual(footer.children[0].children.map(el=>el.textContent),before);
console.log('LightYak tree groups system tags by device identity, aligns types, supports keys/filtering and preserves save/preview safety.');
