import assert from 'node:assert/strict';
import {mountSite} from '../static/site-settings.js';
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.value='';}
 append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
 setAttribute(key,value){this[key]=value;}removeAttribute(key){delete this[key];}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(el=>el!==this);}
 showModal(){this.open=true;}close(){this.open=false;this.onclose?.();}focus(){}
}
const node=(tag,text,parent,props={})=>{const el=Object.assign(new Element(tag),{textContent:text},props);parent?.append(el);return el;};
const button=(text,parent,onclick)=>node('button',text,parent,{onclick});
const all=el=>[el,...el.children.flatMap(all)],settle=()=>new Promise(resolve=>setImmediate(resolve));
globalThis.document={body:new Element('body'),activeElement:null,createElement:tag=>new Element(tag)};
globalThis.location={href:'http://localhost:8080/#administration',reload(){throw Error('Unexpected reload during combined restart');}};
const root=new Element('div');let calls=[];
const close=mountSite(root,{node,button,api:async(path,data)=>{calls.push({path,data});if(data)return {logo_name:'',restarting:true,port:data.port,sign_in_changed:true};return path==='admin/site'?{logo_name:'Logo',default_logo:true}:path==='admin/sign-in'?{required:true,has_administrator:true}:{port:8080,can_restart:true};}});
await settle();const elements=all(root),port=elements.find(el=>el.type==='number'),mode=elements.find(el=>el.tagName==='select'),save=elements.find(el=>el.textContent==='Save'),revert=elements.find(el=>el.textContent==='Revert');
assert(save.disabled);assert(!elements.some(el=>el.textContent==='Apply & Restart'||el.textContent==='Apply Sign-In Setting'));
port.value='8090';port.oninput();mode.value='automatic';mode.onchange();assert(!save.disabled);assert(close.isDirty());
let pending=save.onclick();let dialog=document.body.children.at(-1);assert(all(dialog).some(el=>String(el.textContent).includes('restart')));all(dialog).find(el=>el.textContent==='Cancel').onclick();assert.equal(await pending,false);assert(calls.every(call=>!call.data));assert(close.isDirty());
revert.onclick();assert.equal(port.value,8080);assert.equal(mode.value,'required');assert(!close.isDirty());assert(save.disabled);
port.value='8091';port.oninput();mode.value='automatic';mode.onchange();elements.find(el=>el.textContent==='Use Default Logo').onclick();
pending=save.onclick();dialog=document.body.children.at(-1);all(dialog).find(el=>el.textContent==='Continue').onclick();assert.equal(await pending,true);
const writes=calls.filter(call=>call.data);assert.equal(writes.length,1);assert.equal(writes[0].path,'admin/site-configuration');assert.equal(writes[0].data.port,8091);assert.equal(writes[0].data.sign_in.required,false);assert.equal(writes[0].data.logo,null);assert(!close.isDirty());assert(port.disabled);assert(save.disabled);close();
console.log('Unified Site Save confirms changes, Cancel preserves drafts, Revert resets all, and Save sends one combined request.');
