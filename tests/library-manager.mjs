import assert from 'node:assert/strict';
import {mountLibrary} from '../static/library-manager.js';
class Element{constructor(tag){this.tagName=tag;this.children=[];this.attrs={};}append(child){this.children.push(child);}replaceChildren(){this.children=[];}setAttribute(key,value){this.attrs[key]=value;}focus(){this.focused=true;}}
const all=el=>el.children.flatMap(child=>[child,...all(child)]);
const node=(tag,text,parent,props={})=>{const el=new Element(tag);el.textContent=text;Object.assign(el,props);parent?.append(el);return el;};
const button=(text,parent,onclick)=>node('button',text,parent,{onclick});
const root=new Element('main'),calls=[];let closed=0;
const items=[{id:'a',name:'Main',usage:[]},{id:'b',name:'Popup',usage:[1]}];
const close=mountLibrary(root,{kind:'pages',items,node,button,describe:()=> '1000 × 640',onAdd:()=>calls.push('add'),onImport:()=>calls.push('import'),onSettings:item=>calls.push(item.id),onRemove(){},onOpen:item=>calls.push('open:'+item.id),onView(){},onExport:item=>calls.push('export:'+item.id),canRemove:item=>!item.usage.length,mountPreview:(parent,item)=>{node('span',item.name+' preview',parent);return ()=>closed++;},showDetails:(parent,item)=>node('strong',item.name,parent)});
const find=text=>all(root).find(el=>el.textContent===text);
const preview=all(root).find(el=>el.className==='library-preview');preview.onclick();assert(calls.includes('open:a'));let prevented=false;preview.onkeydown({key:'Enter',preventDefault(){prevented=true;}});assert(prevented);
assert(find('Main preview'));find('Export').onclick();assert(calls.includes('export:a'));find('Import').onclick();assert(calls.includes('import'));
const popup=all(root).find(el=>el.attrs.role==='option' && el.children[0].textContent==='Popup');const entries=all(root).filter(el=>el.attrs.role==='option');popup.onclick();assert.equal(closed,1);assert.deepEqual(all(root).filter(el=>el.attrs.role==='option'),entries);popup.onclick();assert.equal(closed,1,'Selecting the same page must retain its preview');assert(find('Popup preview'));assert(find('Remove').disabled);find('Edit Page').onclick();assert(calls.includes('open:b'));
const filter=all(root).find(el=>el.type==='search');filter.value='nomatch';filter.oninput();assert(find('No matching pages.'));close();assert.equal(closed,2);
console.log('Library selection, preview cleanup, filtering, import/export actions, and reference deletion guards passed.');
