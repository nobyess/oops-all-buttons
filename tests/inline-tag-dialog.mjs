import assert from 'node:assert/strict';
import {openInlineTagDialog} from '../static/inline-tag-dialog.js';
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.textContent='';this.isConnected=true;}
 append(child){child.parent=this;this.children.push(child);}
 setAttribute(key,value){this[key]=value;}
 showModal(){}close(){}focus(){}reportValidity(){return true;}
 remove(){this.isConnected=false;this.parent.children=this.parent.children.filter(child=>child!==this);}
}
const all=el=>el.children.flatMap(child=>[child,...all(child)]);
globalThis.document={body:new Element('body'),createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
const providers={getTags:()=>[{id:'tag',name:'Temperature',source:'Simulation',folder:'AirHandler'}]};
const initial={tag:'tag',format:{digits:2,minimumIntegerDigits:3,trailingZeros:true}};
const result=openInlineTagDialog(providers,{initial,getSample:async()=>({value:7.2,quality:'good'})});
await new Promise(resolve=>setImmediate(resolve));
let modal=document.body.children[0],nodes=all(modal);
const preview=nodes.find(el=>el.role==='status');assert.equal(preview.textContent,'007.20');
const zeros=nodes.find(el=>el.type==='checkbox');zeros.checked=false;zeros.onchange();assert.equal(preview.textContent,'007.2');
const digits=nodes.find(el=>el.tagName==='select');digits.value='0';digits.onchange();assert.equal(preview.textContent,'007');
const insert=nodes.find(el=>el.textContent==='Insert Tag' && el.tagName==='button');assert.equal(insert.dataset.dialogDefault,'true');
nodes.find(el=>el.tagName==='form').onsubmit({preventDefault(){}});
assert.equal((await result).token,String.raw`@{Simulation\AirHandler\Temperature|dp=0;min=3;zeros=0}`);
let resolveSample;
const cancelled=openInlineTagDialog(providers,{initial,getSample:()=>new Promise(resolve=>{resolveSample=resolve;})});
modal=document.body.children[0];nodes=all(modal);const output=nodes.find(el=>el.role==='status');
modal.onclose();assert.equal(await cancelled,null);resolveSample({value:99,quality:'good'});await new Promise(resolve=>setImmediate(resolve));assert.equal(output.textContent,'—');
const empty=openInlineTagDialog(providers);modal=document.body.children[0];nodes=all(modal);
assert(nodes.find(el=>el.textContent==='Insert Tag' && el.tagName==='button').disabled);
assert.equal(nodes.find(el=>el.tagName==='select').value,'raw');assert.equal(nodes.find(el=>el.type==='number').value,1);
modal.oncancel({preventDefault(){}});assert.equal(await empty,null);
console.log('Compact inserted-tag dialog previews formatting, confirms options, defaults safely, and ignores late responses after close.');

const validation=openInlineTagDialog(providers,{initial,getSample:async()=>({value:7.2,quality:'good'})});
await new Promise(resolve=>setImmediate(resolve));
modal=document.body.children[0];nodes=all(modal);
const minimum=nodes.find(el=>el.type==='number'),form=nodes.find(el=>el.tagName==='form');
assert.equal(minimum.min,1);assert.equal(minimum.max,15);assert.equal(minimum.step,1);assert(minimum.required);
for(const bad of ['', '-1','999999999999999999999','1e300','1.5','oops']){
 minimum.value=bad;assert.doesNotThrow(()=>minimum.oninput());
 assert(nodes.find(el=>el.role==='status').textContent.length<350);
 form.reportValidity=()=>false;form.onsubmit({preventDefault(){}});assert(modal.isConnected);
}
minimum.value='4';minimum.oninput();form.reportValidity=()=>true;form.onsubmit({preventDefault(){}});
assert.equal((await validation).token,String.raw`@{Simulation\AirHandler\Temperature|dp=2;min=4;zeros=1}`);
console.log('Invalid numeric edits leave the dialog open; corrected settings save successfully.');
