import assert from 'node:assert/strict';
import {openContentPicker} from '../static/content-picker.js';
import {filterAssets} from '../static/asset-ui.js';
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.value='';this.textContent='';this.isConnected=true;this.classList={toggle(){},add(){}};}
 append(child){child.parent=this;this.children.push(child);}
 replaceChildren(...children){this.children=children;}
 setAttribute(k,v){this.attributes[k]=v;}
 showModal(){}close(){}focus(){}
 remove(){this.isConnected=false;this.parent.children=this.parent.children.filter(child=>child!==this);}
}
const all=el=>el.children.flatMap(child=>[child,...all(child)]);
globalThis.document={body:new Element('body'),createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
const items=[{id:'image1',kind:'image',name:'Building',filename:'building.png',category:'Site',size:100,url:'/api/images/image1'},
 {id:'image2',kind:'image',name:'Pump photo',filename:'pump.png',category:'Equipment',size:100,url:'/api/images/image2'},
 {id:'symbol',kind:'symbol',name:'Pump symbol',filename:'pump.svg',category:'Equipment',size:100,url:'/api/images/symbol'}];
assert.deepEqual(filterAssets(items,'pump','Equipment','image'),[items[1]]);
const api=async()=>items;
const result=openContentPicker({api,kind:'image'});await new Promise(resolve=>setImmediate(resolve));
let modal=document.body.children[0],nodes=all(modal);
assert.equal(nodes.filter(el=>el.tagName==='select').length,2,'Category filter plus the hidden upload category chooser; no type dropdown');
const category=nodes.find(el=>el.tagName==='select');assert.equal(category.attributes['aria-label'],'Category');
let options=nodes.filter(el=>el.attributes.role==='option');assert.equal(options.length,2);assert(!options.some(el=>all(el).some(child=>child.textContent==='Pump symbol')));
category.value='Equipment';category.onchange();options=all(modal).filter(el=>el.attributes.role==='option');assert.equal(options.length,1);
options[0].onclick();nodes=all(modal);const use=nodes.find(el=>el.textContent==='Use Asset');assert.equal(use.disabled,false);await use.onclick();assert.equal((await result).id,'image2');
const cancelled=openContentPicker({api,kind:'image'});modal=document.body.children[0];modal.oncancel({preventDefault(){}});assert.equal(await cancelled,null);
await assert.rejects(openContentPicker({api,kind:'unknown'}));
console.log('Typed content picker filters by control type and category, confirms selection, and cancels safely.');
