import {applySourceStatuses} from '../static/source-manager.js';
import assert from 'node:assert/strict';
import {mountSourceManager} from '../static/source-manager.js';
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.value='';}
 append(child){this.children.push(child);}
 replaceChildren(){this.children=[];}
 setAttribute(key,value){this.attributes[key]=value;}
 querySelectorAll(){return all(this).filter(el=>el.dataset.sourceDot);}
}
const all=el=>el.children.flatMap(child=>[child,...all(child)]);
const node=(tag,text,parent,props={})=>{const el=new Element(tag);el.textContent=text;Object.assign(el,props);parent?.append(el);return el;};
const button=(text,parent,onclick)=>node('button',text,parent,{onclick});
const root=new Element('main'),state={source:'',tag:'',search:''},commands=[];
const sources=[{id:'mem',name:'Memory',kind:'memory',status:{quality:'good',message:'Ready'},usage:[]},{id:'bac',name:'BACnet',kind:'bacnet',status:{quality:'bad',message:'Disconnected'},usage:[]},{id:'sheet',name:'Sheet',kind:'sheet'}];
const tags=[{id:'one',name:'One',source:'mem',source_name:'Memory',usage:[{page:'p'}]},{id:'sensor',name:'Sensor',source:'bac',source_name:'BACnet',usage:[]}];
const manager=mountSourceManager(root,{node,button,state,getSources:()=>sources,getTags:()=>tags,getValues:()=>({one:{quality:'good',value:true}}),usageList:(parent,uses)=>node('a',uses.length+' references',parent),onSelectTag:tag=>commands.push(tag?.id),onAddSource(){},onEditSource(){},onRemoveSource(){},onAddTag(){},onEditTag(){},onRemoveTag(){}});
const find=text=>all(root).find(el=>el.textContent===text);
assert(find('Data Sources & Tags'));assert.equal(state.source,'mem');assert(!find('Sheet (sheet)'));
assert.equal(find('Memory (Memory)').tagName,'span');assert(find('One'));assert(!all(root).some(el=>el.tagName==='option' && el.textContent==='Memory\\One'));
const list=all(root).find(el=>el.tagName==='select');list.value='one';list.onchange();assert.equal(manager.selectedTag().id,'one');assert(find('Current value: 1'));assert(find('1 references'));
assert(all(root).find(el=>el.title==='Used by saved pages or sheets').disabled);
all(root).find(el=>el.dataset.source==='bac').onclick();assert.equal(state.tag,'');assert(find('Fault — Disconnected'));assert(find('Sensor'));
sources[1].status={quality:'good',message:'Connected'};manager.refresh();assert(find('Good — Connected'));assert.equal(all(root).find(el=>el.dataset.sourceDot==='bac').className,'good');
const search=all(root).find(el=>el.type==='search');search.value='One';search.oninput();assert(!all(root).some(el=>el.dataset.source==='bac'));assert(all(root).some(el=>el.dataset.source==='mem'));
console.log('Combined Sources & Tags selection, source info, values, references, filtering, status updates, and deletion guards passed.');

const catalogSources=[{id:'one',name:'PLC',settings:{live:.5},tags:['t'],usage:[{page:'main'}],status:{quality:'bad'}},{id:'two',status:{quality:'idle'}}];
const first=catalogSources[0],usage=first.usage,settings=first.settings;
applySourceStatuses(catalogSources,[{id:'one',status:{quality:'good',message:'Connected'}},{id:'removed',status:{quality:'bad'}}]);
assert.equal(catalogSources[0],first);assert.equal(first.usage,usage);assert.equal(first.settings,settings);
assert.equal(first.status.quality,'good');assert.equal(catalogSources[1].status.quality,'idle');assert.equal(catalogSources.length,2);
