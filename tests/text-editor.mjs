import assert from 'node:assert/strict';
import {openTextEditor} from '../static/text-editor.js';
import {controls} from '../static/controls.js';
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.style={};}
 append(child){child.parent=this;this.children.push(child);}
 setAttribute(key,value){this[key]=value;}
 showModal(){}close(){}focus(){}reportValidity(){return true;}
 remove(){this.parent.children=this.parent.children.filter(child=>child!==this);}
}
const all=root=>root.children.flatMap(child=>[child,...all(child)]);
globalThis.document={body:new Element('body'),createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
const original={text:'Original',fontSize:16,bold:false,foreColor:'#243247'};
const cancel=openTextEditor(original);let modal=document.body.children[0],nodes=all(modal);
nodes.find(node=>node.tagName==='textarea').value='Changed';nodes.find(node=>node.textContent==='Cancel').onclick();
assert.equal(await cancel,null);assert.equal(original.text,'Original');
const save=openTextEditor(original);modal=document.body.children[0];nodes=all(modal);
nodes.find(node=>node.tagName==='textarea').value='Line one\nLine two';
const bold=nodes.find(node=>node.tagName==='label' && node.textContent==='Bold').children[0];bold.checked=true;bold.onchange();
const size=nodes.find(node=>node.tagName==='label' && node.textContent==='Size').children[0];size.value=24;size.oninput();
const horizontal=nodes.find(node=>node['aria-label']==='Horizontal Alignment');all(horizontal).find(node=>node['aria-label']==='Left').onclick();

const vertical=nodes.find(node=>node['aria-label']==='Vertical Alignment');all(vertical).find(node=>node['aria-label']==='Bottom').onclick();
const back=nodes.find(node=>node.tagName==='label' && node.textContent==='Back').children[0];
back.value='#ff0000';const opacity=back.parent.parent.children[1].children[0];opacity.value=50;opacity.onchange();
const blink=nodes.find(node=>node.tagName==='label' && node.textContent==='Blink').children[0];blink.checked=true;blink.onchange();
assert.equal(nodes.find(node=>node.className==='text-editor-preview').style.backgroundColor,'#ffffff');
assert.equal(nodes.find(node=>node.tagName==='textarea').style.backgroundColor,'#ff000080');
nodes.find(node=>node.tagName==='form').onsubmit({preventDefault(){}});
const changes=await save;assert.equal(changes.blink,true);assert.equal(changes.text,'Line one\nLine two');assert.equal(changes.fontSize,24);assert.equal(changes.bold,true);
assert.equal(changes.backColor,'#ff000080');assert.equal(changes.textHorizontalAlignment,'left');assert.equal(changes.textVerticalAlignment,'bottom');assert.equal(original.text,'Original');
assert(controls.label.props.roundedCorners);assert.equal(controls.label.defaults.roundedCorners,false);assert.equal(controls.indicator.hidden,true);
console.log('Text Editor cancel/save, multiline text, formatting, alignment, and control options passed.');

let focused=false,caret;
const inserting=openTextEditor({text:'Before selected after'},{onInsertTag:async()=>String.raw`Memory\Test`});
modal=document.body.children[0];nodes=all(modal);
const input=nodes.find(node=>node.tagName==='textarea');input.selectionStart=7;input.selectionEnd=15;
input.focus=()=>{focused=true;};input.setSelectionRange=(start,end)=>{caret=[start,end];};
await nodes.find(node=>node.textContent==='Insert Tag').onclick();
assert.equal(input.value,String.raw`Before @{Memory\Test} after`);
assert.deepEqual(caret,[21,21]);assert(focused);
nodes.find(node=>node.tagName==='form').onsubmit({preventDefault(){}});
assert.equal((await inserting).text,input.value);
const cancelling=openTextEditor({text:'Keep'},{onInsertTag:async()=>null});
modal=document.body.children[0];nodes=all(modal);
await nodes.find(node=>node.textContent==='Insert Tag').onclick();
assert.equal(nodes.find(node=>node.tagName==='textarea').value,'Keep');
nodes.find(node=>node.textContent==='Cancel').onclick();await cancelling;
console.log('Insert Tag selection, focus/caret, and cancellation passed.');

const {seedContentEvent}=await import('../static/text-editor.js');
const base={text:'Running',fontSize:22,bold:true,backColor:'#ff0000',foreColor:'#ffffff',textRefs:{'Source\\Tag':'id'}};
const seeded={};seedContentEvent(seeded,base);assert.equal(seeded.content,'Running');assert.equal(seeded.contentStyle.fontSize,22);assert.equal(seeded.contentStyle.backColor,'#ff0000');
base.textRefs['Source\\Tag']='changed';assert.equal(seeded.contentRefs['Source\\Tag'],'id');
seeded.content='Custom';seedContentEvent(seeded,{text:'Other'});assert.equal(seeded.content,'Custom');
console.log('Set Content snapshots the current text/formatting and preserves existing event edits.');

const originalToken=String.raw`@{Memory\Test|dp=2;min=3;zeros=1}`;
const editingToken=openTextEditor({text:originalToken,textRefs:{[originalToken.slice(2,-1)]:'id'}},{onInsertTag:async initial=>{assert.equal(initial.tag,'id');assert.equal(initial.format.digits,2);return {path:initial.path,format:{digits:1,minimumIntegerDigits:1,trailingZeros:true}};}});
modal=document.body.children[0];nodes=all(modal);const tokenInput=nodes.find(el=>el.tagName==='textarea');tokenInput.selectionStart=4;tokenInput.selectionEnd=4;tokenInput.setSelectionRange=()=>{};
await nodes.find(el=>el.textContent==='Insert Tag').onclick();assert.equal(tokenInput.value,String.raw`@{Memory\Test|dp=1;min=1;zeros=1}`);
nodes.find(el=>el.tagName==='form').onsubmit({preventDefault(){}});await editingToken;
console.log('Insert Tag reopens and replaces the occurrence under the caret, retaining its saved tag reference.');
