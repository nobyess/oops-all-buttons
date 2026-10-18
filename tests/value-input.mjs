import assert from 'node:assert/strict';
import {inputValue,openValueInput} from '../static/value-input.js';
assert.equal(inputValue('0',{minimum:0,maximum:10}),0);
assert.equal(inputValue('-1.25',{minimum:-2,maximum:2,allowDecimal:true}),-1.25);
for(const text of ['1e2','abc','1.5','','11'])assert.throws(()=>inputValue(text,{minimum:0,maximum:10}));
class Element{
 constructor(tag){this.tagName=tag;this.children=[];}
 append(e){e.parent=this;this.children.push(e);}setAttribute(k,v){this[k]=v;}
 showModal(){}close(){}focus(){}requestSubmit(){return this.onsubmit({preventDefault(){}});}
 remove(){this.parent.children=this.parent.children.filter(e=>e!==this);}
}
const all=e=>e.children.flatMap(c=>[c,...all(c)]);
globalThis.document={body:new Element('body'),createElement:t=>new Element(t)};
let result,nodes,modal,display,form;
function inspect(){nodes=all(document.body);modal=nodes.find(e=>e.tagName==='dialog');display=nodes.find(e=>e.role==='textbox');form=nodes.find(e=>e.tagName==='form');}
function key(key,options={}){modal.onkeydown({key,target:display,preventDefault(){},stopPropagation(){},...options});}
function type(text){for(const char of text)key(char);}
function click(text){nodes.find(e=>e.tagName==='button' && e.textContent===text).onclick();}
const value=()=>display['aria-valuetext'];
result=openValueInput({minimum:0,maximum:10,allowDecimal:false});inspect();
assert(!nodes.some(e=>['input','textarea'].includes(e.tagName)));assert.equal(display['aria-readonly'],'true');
type('5');type('abc');assert.equal(value(),'5');key('a',{ctrlKey:true});type('11');await form.requestSubmit();assert(document.body.children.length);assert(nodes.find(e=>e.role==='alert').textContent);
key('a',{ctrlKey:true});type('0');key('Enter');assert.equal(await result,0);
result=openValueInput({minimum:-10,maximum:10,allowDecimal:true});inspect();key('Escape');assert.equal(await result,null);
result=openValueInput({minimum:-5,maximum:20,prompt:'Enter speed'},{name:String.raw`Memory\Speed`});inspect();assert(nodes.some(e=>e.tagName==='h2' && e.textContent==='Enter speed'));assert(nodes.some(e=>e.textContent==='Minimum: -5 · Maximum: 20'));assert(nodes.some(e=>e.textContent===String.raw`Memory\Speed`));click('Cancel');await result;
result=openValueInput({minimum:-100,maximum:100,allowDecimal:true,promptText:'Pump Speed Setpoint',unitText:'RPM'},{value:42.5});inspect();
assert(nodes.some(e=>e.textContent==='RPM'));assert.equal(display['aria-label'],'Pump Speed Setpoint');
click('7');click('.');click('5');assert.equal(value(),'7.5');click('±');assert.equal(value(),'-7.5');nodes.find(e=>e['aria-label']==='Backspace').onclick();assert.equal(value(),'-7.');click('2');await form.requestSubmit();assert.equal(await result,-7.2);
result=openValueInput({minimum:-100,maximum:100,allowDecimal:true},{value:42});inspect();
type('12.34');key('ArrowLeft');key('Backspace');assert.equal(value(),'12.4');key('Delete');assert.equal(value(),'12.');key('9');key('Home');key('-');assert.equal(value(),'-12.9');key('End');key('Backspace');type('5');assert.equal(value(),'-12.5');key('a',{metaKey:true});
modal.onpaste({preventDefault(){},clipboardData:{getData:()=>'-2.5'}});assert.equal(value(),'-2.5');modal.onpaste({preventDefault(){},clipboardData:{getData:()=>'<bad>'}});assert.equal(value(),'-2.5');key('Enter');assert.equal(await result,-2.5);
let rejectWrite,attempts=0;
result=openValueInput({minimum:0,maximum:10,allowDecimal:false},{value:2,onSubmit:()=>{attempts++;return attempts===1?new Promise((resolve,reject)=>rejectWrite=reject):Promise.resolve();}});inspect();
assert(nodes.find(e=>e.textContent==='.').disabled);assert(nodes.find(e=>e.textContent==='±').disabled);
let submission=form.requestSubmit();assert.equal(display['aria-disabled'],'true');key('Escape');assert(document.body.children.length);
rejectWrite(new Error('PLC rejected write'));await submission;assert.equal(display['aria-disabled'],'false');assert(nodes.find(e=>e.role==='alert').textContent.includes('PLC rejected'));assert(document.body.children.length);
await form.requestSubmit();assert.equal(await result,2);assert.equal(document.body.children.length,0);
console.log('Non-editable keypad display, touch entry, physical keys, selection/caret, paste validation, bounds, cancellation, and retryable write failures passed.');
