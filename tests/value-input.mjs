import assert from 'node:assert/strict';
import {inputValue,openValueInput} from '../static/value-input.js';
assert.equal(inputValue('0',{minimum:0,maximum:10}),0);
assert.equal(inputValue('-1.25',{minimum:-2,maximum:2,allowDecimal:true}),-1.25);
for(const text of ['1e2','abc','1.5','','11'])assert.throws(()=>inputValue(text,{minimum:0,maximum:10}));
class Element{constructor(tag){this.tagName=tag;this.children=[];}append(e){e.parent=this;this.children.push(e);}setAttribute(k,v){this[k]=v;}showModal(){}close(){}focus(){}remove(){this.parent.children=this.parent.children.filter(e=>e!==this);}}
const all=e=>e.children.flatMap(c=>[c,...all(c)]);
globalThis.document={body:new Element('body'),createElement:t=>new Element(t)};
let result=openValueInput({minimum:0,maximum:10,allowDecimal:false});
let nodes=all(document.body),input=nodes.find(e=>e.tagName==='input'),form=nodes.find(e=>e.tagName==='form');
input.value='5';input.oninput();input.value='abc';input.oninput();assert.equal(input.value,'5');
input.value='11';form.onsubmit({preventDefault(){}});assert(document.body.children.length);assert(nodes.find(e=>e.role==='alert').textContent);
input.value='0';form.onsubmit({preventDefault(){}});assert.equal(await result,0);
result=openValueInput({minimum:-10,maximum:10,allowDecimal:true});nodes=all(document.body);nodes.find(e=>e.textContent==='Cancel').onclick();assert.equal(await result,null);
console.log('Numeric input syntax, range, decimals, invalid paste, zero submission, and cancellation passed.');

result=openValueInput({minimum:-5,maximum:20,prompt:'Enter speed'},{name:String.raw`Memory\Speed`});
nodes=all(document.body);assert(nodes.some(e=>e.tagName==='h2' && e.textContent==='Enter speed'));
assert(nodes.some(e=>e.textContent==='Minimum: -5 · Maximum: 20'));
assert(!nodes.some(e=>e.textContent===String.raw`Memory\Speed`));
nodes.find(e=>e.textContent==='Cancel').onclick();await result;
result=openValueInput({minimum:0,maximum:10,prompt:'  '},{name:String.raw`Memory\Speed`});
nodes=all(document.body);assert(nodes.some(e=>e.tagName==='h2' && e.textContent==='Value Input'));
nodes.find(e=>e.textContent==='Cancel').onclick();await result;
console.log('Custom dialog title, default Value Input title, and minimum/maximum hint passed.');
