import assert from 'node:assert/strict';
import {openContentPicker} from '../static/content-picker.js';
import {filterAssets} from '../static/asset-ui.js';
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.style={};this.value='';this.textContent='';this.isConnected=true;this.classList={toggle(){},add(){}};}
 getBoundingClientRect(){return {left:100,top:100,width:500,height:400};}
 append(child){child.parent=this;this.children.push(child);}
 replaceChildren(...children){this.children=children;}
 setAttribute(k,v){this.attributes[k]=v;}
 showModal(){}close(){}focus(){}
 remove(){this.isConnected=false;this.parent.children=this.parent.children.filter(child=>child!==this);}
}
const all=el=>el.children.flatMap(child=>[child,...all(child)]);
globalThis.document={body:new Element('body'),createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
globalThis.window={innerWidth:1000,innerHeight:800,addEventListener(){},removeEventListener(){}};
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
let imports=0;
const mixed=openContentPicker({api:async(path)=>{if(path!=='assets')imports++;return items;},kind:'icon',kinds:['icon','image','symbol'],value:'play'});
await new Promise(resolve=>setImmediate(resolve));modal=document.body.children[0];nodes=all(modal);
let type=nodes.find(el=>el.attributes['aria-label']==='Content type');assert.deepEqual(type.children.map(el=>el.textContent),['Icons','Images','Symbols']);
assert(nodes.filter(el=>el.attributes.role==='option').length>=100);
assert.equal(nodes.find(el=>el.textContent==='Choose File').hidden,true);
let search=nodes.find(el=>el.type==='search');search.value='pump';search.oninput();options=all(modal).filter(el=>el.attributes.role==='option');assert.equal(options.length,1);
options[0].onclick();await all(modal).find(el=>el.textContent==='Use Icon').onclick();assert.equal((await mixed).id,'pump');assert.equal(imports,0);
const mixedImages=openContentPicker({api,kind:'icon',kinds:['icon','image','symbol']});await new Promise(resolve=>setImmediate(resolve));modal=document.body.children[0];
type=all(modal).find(el=>el.attributes['aria-label']==='Content type');type.value='image';type.onchange();
options=all(modal).filter(el=>el.attributes.role==='option');assert.equal(options.length,2);
options[0].onclick();await all(modal).find(el=>el.textContent==='Use Asset').onclick();assert.equal((await mixedImages).kind,'image');
console.log('Typed content picker filters by control type and category, confirms selection, and cancels safely.');
