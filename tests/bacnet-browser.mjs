import assert from 'node:assert/strict';
import {bacnetTagBrowser} from '../static/bacnet-tag-browser.js';
import {tagPath,tagDisplayName} from '../static/tag-selector.js';
import {renderInlineText} from '../static/inline-text.js';
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.style={};this.dataset={};this.isConnected=true;this.classList={add(){}};this.value='';}
 append(e){e.parent=this;e.parentElement=this;this.children.push(e);}setAttribute(k,v){this[k]=v;}replaceChildren(){this.children=[];}closest(){return modal;} focus(){} insertBefore(e,before){this.children=this.children.filter(c=>c!==e);this.children.splice(Math.max(0,this.children.indexOf(before)),0,e);} querySelectorAll(selector){return all(this).filter(e=>selector.startsWith('[role=')?e.role===selector.split('"')[1]:e.className===selector.slice(1));} getBoundingClientRect(){return {top:0,bottom:1000};}
}
const modal=new Element('dialog'),body=new Element('div'),submit=new Element('button'),footer=new Element('div');footer.append(submit);let save;
const all=e=>e.children.flatMap(c=>[c,...all(c)]);
const node=(t,text,parent,props={})=>{const e=new Element(t);if(text!==null)e.textContent=text;Object.assign(e,props);parent?.append(e);return e;};
const field=(label,parent,type='text',value='')=>node('input',null,node('label',label,parent),{type,value});
const button=(label,parent,fn)=>{const e=node('button',label,parent);e.onclick=fn;return e;};
const added=[];let refreshed=0;
const api=async(path,data)=>{
 if(path==='sources/preview-tag')return {quality:'good',value:21.5};
 if(path==='tags'){added.push(data);return {};}
 if(data.properties)return {name:'Room Temperature',items:[{address:'1443213/2:200/presentValue',property:'presentValue',label:'PV',available:true,selectable:true,value:21.5},{address:'1443213/2:200/eventState',property:'eventState',label:'Event State',available:false,error:'unknown-property'},{address:'1443213/2:200/units',property:'units',label:'Units',available:true,selectable:true,value:'degrees-celsius'},{address:'1443213/2:200/statusFlags',property:'statusFlags',label:'statusFlags',available:true,selectable:false,data_type:'COMPLEX',preview:'[0, 0, 0, 0]'}]};
 return {items:data.node?[{node:'1443213/2:200',name:'Room Temperature',type:'OBJECT_ANALOG_VALUE:200',selectable:true,children:false}]:[{node:'1443213',name:'1443213 - Controller',children:true}],total:1};
};
bacnetTagBrowser({source:{id:'source',name:'BacNet1'},dialog:(title,build)=>{save=build(body,submit);},node,field,button,api,reload:async()=>{},onDone:()=>refreshed++});
const settle=()=>new Promise(resolve=>setImmediate(resolve));await settle();
let row=all(body).find(e=>e.role==='treeitem');row.onclick();await settle();
row=all(body).find(e=>e.role==='treeitem' && all(e).some(c=>c.textContent==='Room Temperature'));row.onclick();await settle();
const propertyRows=all(body).filter(e=>e.role==='option');assert.equal(propertyRows.length,4);
assert.equal(submit.textContent,'Save');assert.equal(submit.disabled,true);
const unavailable=propertyRows.find(e=>all(e).some(c=>c.textContent==='Event State'));unavailable.onclick();assert.equal(submit.disabled,true);
const complex=propertyRows.find(e=>all(e).some(c=>c.textContent==='statusFlags (Preview Only)'));complex.onclick();assert.equal(submit.disabled,true);assert(all(body).some(e=>e.textContent==='[0, 0, 0, 0]'));
propertyRows.find(e=>all(e).some(c=>c.textContent==='PV')).onclick();await settle();assert.equal(submit.disabled,true);
await assert.rejects(save,/Tag name is required/);
const tagName=all(body).find(e=>e.placeholder==='Tag name');assert(tagName.required);tagName.value='  Room sensor  ';tagName.oninput();assert.equal(submit.disabled,false);
assert(all(body).some(e=>e.textContent===String.raw`BacNet1\1443213\OBJECT_ANALOG_VALUE:200\presentValue`));
assert(all(body).some(e=>e.textContent==='Current value: 21.5'));
await save();assert.equal(added[0].name,'Room sensor');assert.equal(added[0].address,'1443213/2:200/presentValue');assert.equal(refreshed,1);
const tag={id:'id',source_name:'BacNet1',name:'Room Temperature',bacnet_path:String.raw`1443213\OBJECT_ANALOG_VALUE:200\presentValue`};
assert.equal(tagDisplayName(tag),String.raw`BacNet1\Room Temperature`);
assert.equal(tagDisplayName({source_name:'Memory',name:'Test'}),String.raw`Memory\Test`);
assert.equal(tagPath(tag),String.raw`BacNet1\Room Temperature`);
assert.equal(renderInlineText('@{'+tagPath(tag)+'}',{},[tag],{id:{quality:'good',value:21.5}}),'21.5');
console.log('BACnet device expansion, Object Name labels, basic properties, tag creation, and canonical inline paths passed.');
