import assert from 'node:assert/strict';
import {mountSheetGrid,openSheetDialog,adjacentSheetCell} from '../static/sheet-ui.js';
import {openTagSelector} from '../static/tag-selector.js';
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.value='';this.classes=new Set();this.classList={toggle:(name,enabled)=>{if(enabled)this.classes.add(name);else this.classes.delete(name);},contains:name=>this.classes.has(name)};}
 append(child){child.parent=this;this.children.push(child);}
 querySelector(selector){return descendants(this).find(node=>selector.startsWith('.')?node.className===selector.slice(1):node.tagName===selector);}
 querySelectorAll(tag){return this.children.filter(child=>child.tagName===tag);}
 setAttribute(key,value){this[key]=value;}
 replaceChildren(){this.children=[];}
 showModal(){} close(){} focus(){document.activeElement=this;} blur(){if(document.activeElement===this)document.activeElement=null;}
 remove(){this.parent.children=this.parent.children.filter(child=>child!==this);}
}
const descendants=root=>root.children.flatMap(child=>[child,...descendants(child)]);
globalThis.document={body:new Element('body'),createElement:tag=>new Element(tag)};
const source={id:'sheet',name:'Sheet1',kind:'sheet',settings:{live:.5}};
const interests=[],timers=[];let selected,requests=0;
const realSetTimeout=globalThis.setTimeout,realClearTimeout=globalThis.clearTimeout;
globalThis.setTimeout=(fn,delay)=>{timers.push({fn,delay});return timers.length;};globalThis.clearTimeout=()=>{};
const getSheet=async()=>{requests++;return {cells:{A1:{raw:'=1+1'}},values:{A1:{value:2,quality:'good'}},filename:'Test.sheet.json',live:.5,functions:['SUM','IF','AVERAGE']};};
const parent=new Element('div');
const grid=mountSheetGrid(parent,{source,getSheet,onInterest:(...args)=>interests.push(args),onSelect:address=>selected=address});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(descendants(parent).filter(node=>node.tagName==='input').length,0);
assert(descendants(parent).find(node=>node.className==='sheet-toolbar').hidden);
assert(descendants(parent).find(node=>node.role==='status').hidden);
assert.equal(descendants(parent).filter(node=>node.tagName==='button').length,60);
assert.equal(timers[0].delay,500);
const a1=descendants(parent).find(node=>node['aria-label']==='A1');
assert.equal(a1.textContent,'2');a1.onclick();assert.equal(selected,'A1');
let arrowPrevented=false;await a1.onkeydown({key:'ArrowRight',preventDefault(){arrowPrevented=true;}});
assert(arrowPrevented);assert.equal(selected,'B1');assert.equal(document.activeElement['aria-label'],'B1');
assert.equal(adjacentSheetCell('A1','ArrowLeft'),'A1');assert.equal(adjacentSheetCell('A1','ArrowUp'),'A1');
assert.equal(adjacentSheetCell('D15','ArrowRight'),'D15');assert.equal(adjacentSheetCell('D15','ArrowDown'),'D15');
assert.equal(adjacentSheetCell('C5','ArrowLeft'),'B5');assert.equal(adjacentSheetCell('C5','ArrowUp'),'C4');
grid.setData({cells:{A1:{raw:'=TAG("Source\\Tag")'},B1:{raw:'=TAG("Missing")'},C1:{raw:'plain text'}},values:{A1:{quality:'good',value:1},B1:{quality:'bad',error:'Offline'},C1:{quality:'good',value:'plain text'}}});
assert(a1.classList.contains('sheet-cell-tag'));assert(a1.classList.contains('sheet-cell-live'));assert(!a1.classList.contains('sheet-cell-error'));
const badTag=descendants(parent).find(node=>node['aria-label']==='B1');assert(badTag.classList.contains('sheet-cell-tag'));assert(badTag.classList.contains('sheet-cell-error'));assert(!badTag.classList.contains('sheet-cell-live'));
assert(!descendants(parent).find(node=>node['aria-label']==='C1').classList.contains('sheet-cell-tag'));
grid.close();
assert.deepEqual(interests,[['sheet',true],['sheet',false]]);
await timers[0].fn();assert.equal(requests,1);
let imports=0;
const pickerInterests=[];
const picker=openTagSelector({getSources:()=>[source,{...source,id:'sheet2',name:'Sheet2'},{id:'memory',kind:'memory'}],getTags:()=>[],getValues:async()=>({}),getSheet,onSheetInterest:(...args)=>pickerInterests.push(args),ensureSheetTag:async()=>{imports++;return 'cell-id';}});
let modal=document.body.children[0],nodes=descendants(modal);
const sourceList=nodes.find(node=>node.className==='tag-source-list');
assert.equal(sourceList.children[0].tagName,'details');
assert.equal(sourceList.children[0].children[0].textContent,'Sheets');
assert(!nodes.some(node=>node.className==='tag-selector-sheets'));
const choose=name=>descendants(modal).find(node=>node.tagName==='button' && node.textContent===name).onclick();
sourceList.children[0].open=true;
choose('Sheet1');
await new Promise(resolve=>setImmediate(resolve));
choose('Sheet2');
await new Promise(resolve=>setImmediate(resolve));
assert.deepEqual(pickerInterests.slice(0,3),[['sheet',true],['sheet',false],['sheet2',true]]);
choose('memory');
assert.equal(descendants(modal).find(node=>node.className==='sheet-picker-panel').hidden,true);
choose('Sheet1');await new Promise(resolve=>setImmediate(resolve));
nodes=descendants(modal);nodes.find(node=>node['aria-label']==='A1').onclick();
assert.equal(imports,0);
await nodes.find(node=>node.textContent==='Confirm').onclick();
assert.equal(await picker,'cell-id');assert.equal(imports,1);
// Page parameters appear ahead of Sheets and return symbolic IDs through the shared picker.
const parameterPicker=openTagSelector({getSources:()=>[{id:'@parameters',kind:'parameters',name:'Parameters'},source],getTags:()=>[{id:'parameter:pv',source:'@parameters',source_name:'Parameters',name:'PV'}],getValues:async()=>({}),getSheet});
modal=document.body.children[0];
const parameterSources=descendants(modal).find(node=>node.className==='tag-source-list');
assert.equal(parameterSources.children[0].textContent,'Parameters');assert.equal(parameterSources.children[1].tagName,'details');
parameterSources.children[0].onclick();
const parameterList=descendants(modal).find(node=>node.tagName==='select' && node.className==='listbox');
assert.equal(parameterList.children[0].textContent,'PV');parameterList.value='parameter:pv';parameterList.onchange();
await descendants(modal).find(node=>node.textContent==='Confirm').onclick();assert.equal(await parameterPicker,'parameter:pv');
// Picker state survives reopening, even after Cancel, without assigning the caller's field.
const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)};
const rememberedProviders={getSources:()=>[{id:'m',name:'Memory',kind:'memory'}],getTags:()=>[{id:'one',source:'m',name:'One'},{id:'two',source:'m',name:'Two'}],getValues:async()=>({})};
let remembering=openTagSelector(rememberedProviders);modal=document.body.children[0];
descendants(modal).find(n=>n.textContent==='Memory' && n.tagName==='button').onclick();
let rememberedFilter=descendants(modal).find(n=>n.type==='search');rememberedFilter.value='One';rememberedFilter.oninput();
let rememberedList=descendants(modal).find(n=>n.tagName==='select' && n.className==='listbox');rememberedList.value='one';rememberedList.onchange();rememberedList.scrollTop=20;
descendants(modal).find(n=>n.textContent==='Cancel').onclick();assert.equal(await remembering,null);
remembering=openTagSelector(rememberedProviders);modal=document.body.children[0];
assert.equal(descendants(modal).find(n=>n.type==='search').value,'One');assert.equal(descendants(modal).find(n=>n.tagName==='select' && n.className==='listbox').value,'one');
assert.equal(descendants(modal).find(n=>n.tagName==='select' && n.className==='listbox').scrollTop,20);
descendants(modal).find(n=>n.textContent==='Cancel').onclick();await remembering;
remembering=openTagSelector({...rememberedProviders,value:'two'});modal=document.body.children[0];assert.equal(descendants(modal).find(n=>n.type==='search').value,'');
descendants(modal).find(n=>n.textContent==='Cancel').onclick();await remembering;delete globalThis.localStorage;
let saves=0,approve=true,prompts=0;
globalThis.window={addEventListener(){},removeEventListener(){},confirm(){prompts++;return approve;},alert(){}};
const editing=openSheetDialog({source,getSheet,confirmSave:async()=>{prompts++;return approve;},onTag:async()=>null,saveSheet:async()=>{saves++;return getSheet();}});
await new Promise(resolve=>setImmediate(resolve));
modal=document.body.children[0];nodes=descendants(modal);
assert(!nodes.some(node=>node.textContent==='Save Sheet'));
const close=nodes.find(node=>node.textContent==='Close');
const input=nodes.find(node=>node.tagName==='input');
input.value='=999';input.oninput();input.focus();approve='revert';await close.onclick();assert.equal(input.value,'');assert.equal(saves,0);assert.equal(document.activeElement,null);assert(input.disabled);assert.equal(nodes.find(node=>node.tagName==='strong').textContent,'');await nodes.find(node=>node['aria-label']==='A1').onclick();assert.equal(input.value,'=1+1');assert.equal(input.disabled,false);approve=true;
// Escape reverts the selected cell without prompting/saving or closing the dialog.
input.value='=123';input.oninput();input.focus();
const promptsBeforeEscape=prompts;
let escapePrevented=false,escapeStopped=false;
input.onkeydown({key:'Escape',preventDefault(){escapePrevented=true;},stopPropagation(){escapeStopped=true;}});
assert.equal(input.value,'');assert.equal(saves,0);assert.equal(prompts,promptsBeforeEscape);
assert(escapePrevented && escapeStopped);assert.notEqual(document.activeElement,input);
assert.equal(document.activeElement,null);assert(input.disabled);assert.equal(nodes.find(node=>node.tagName==='strong').textContent,'');assert(document.body.children.includes(modal));await nodes.find(node=>node['aria-label']==='A1').onclick();
const functions=nodes.find(node=>node['aria-label']==='Insert function');
input.value='';functions.value='SUM';functions.onchange();assert.equal(input.value,'=SUM(');
input.value='=A1+';input.selectionStart=4;input.selectionEnd=4;functions.value='IF';functions.onchange();assert.equal(input.value,'=A1+IF(');
input.value='=1+1';input.oninput();input.onkeydown({key:'Enter',preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));saves=0;
const selectedCell=nodes.find(node=>node['aria-label']==='B5');await selectedCell.onclick();
let typingPrevented=false;await selectedCell.onkeydown({key:'=',preventDefault(){typingPrevented=true;}});
assert.equal(input.value,'=');assert(typingPrevented);
assert.equal(descendants(modal).find(node=>node.tagName==='strong').textContent,'B5');
// Pointer-down sees the focused formula before the cell button can steal focus.
input.value='=SUM(';input.selectionStart=input.selectionEnd=5;document.activeElement=input;
let referencePrevented=false;
const b1=nodes.find(node=>node['aria-label']==='B1');
b1.onpointerdown({button:0,preventDefault(){referencePrevented=true;}});await b1.onclick();
assert.equal(input.value,'=SUM(B1');assert(referencePrevented);assert.equal(saves,0);
assert.equal(descendants(modal).find(node=>node.tagName==='strong').textContent,'B5');
input.value='=A1+0';input.selectionStart=4;input.selectionEnd=5;
b1.onpointerdown({button:0,preventDefault(){}});await b1.onclick();assert.equal(input.value,'=A1+B1');
// A plain text input does not enable reference insertion.
input.value='text';let textPrevented=false;
b1.onpointerdown({button:0,preventDefault(){textPrevented=true;}});assert.equal(textPrevented,false);
input.value='=2+2';input.oninput();document.activeElement=null;
approve='revert';await close.onclick();assert.equal(input.value,'');assert.equal(saves,0);assert(document.body.children.includes(modal));assert(input.disabled);assert.equal(document.activeElement,null);await selectedCell.onclick();
input.value='=2+2';input.oninput();
approve=false;
await nodes.find(node=>node['aria-label']==='C5').onclick();
assert.equal(descendants(modal).find(node=>node.tagName==='strong').textContent,'B5');assert.equal(saves,0);
await close.onclick();assert(document.body.children.includes(modal));
approve=true;
let prevented=false;input.value='=2+2';input.oninput();input.onkeydown({key:'Enter',preventDefault(){prevented=true;}});
await new Promise(resolve=>setImmediate(resolve));assert.equal(saves,1);assert(prevented);
input.value='changed';input.oninput();
await nodes.find(node=>node['aria-label']==='C5').onclick();assert.equal(saves,2);
assert.equal(descendants(modal).find(node=>node.tagName==='strong').textContent,'C5');
input.value='more';input.oninput();await close.onclick();await editing;assert.equal(saves,3);assert(prompts>=4);
// Cell editing commands save raw formulas; Copy leaves the source unchanged.
const commandParent=new Element('div');let commandSaves=0,lastCells;
const commandGrid=mountSheetGrid(commandParent,{source,getSheet,editable:true,onSave:async()=>{
  commandSaves++;lastCells=structuredClone(commandGrid.getCells());commandGrid.setData({cells:lastCells,values:{}});return true;
}});
await new Promise(resolve=>setImmediate(resolve));
await commandGrid.cellCommand('copy','A1');assert.equal(commandSaves,0);
await commandGrid.cellCommand('paste','B1');assert.equal(commandSaves,1);assert.equal(lastCells.B1.raw,'=1+1');assert.equal(lastCells.A1.raw,'=1+1');
await commandGrid.cellCommand('cut','A1');assert.equal(commandSaves,2);assert.equal(lastCells.A1.raw,'');assert.equal(lastCells.B1.raw,'=1+1');
await commandGrid.cellCommand('paste','C1');assert.equal(commandSaves,3);assert.equal(lastCells.C1.raw,'=1+1');
let deletePrevented=false;
await descendants(commandParent).find(n=>n['aria-label']==='C1').onkeydown({key:'Delete',preventDefault(){deletePrevented=true;}});
assert(deletePrevented);assert.equal(commandSaves,4);assert.equal(lastCells.C1.raw,'');
commandGrid.close();
// Landing previews fetch exactly once and never lease Live polling.
const snapshotParent=new Element('div'),snapshotInterests=[];
const beforeRequests=requests,beforeTimers=timers.length;
const snapshot=mountSheetGrid(snapshotParent,{source,getSheet,autoRefresh:false,onInterest:(...args)=>snapshotInterests.push(args)});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(requests,beforeRequests+1);assert.equal(timers.length,beforeTimers);assert.deepEqual(snapshotInterests,[]);
await descendants(snapshotParent).find(n=>n['aria-label']==='B1').onclick();assert.equal(requests,beforeRequests+1);
snapshot.close();assert.deepEqual(snapshotInterests,[]);
globalThis.setTimeout=realSetTimeout;globalThis.clearTimeout=realClearTimeout;
console.log('Read-only 60-cell picker, Live cadence, cleanup, and import-on-confirm passed.');

// Repeated native/programmatic closes must release picker intervals, sheet timeouts,
// unload listeners, and live-interest leases just like the Cancel button.
const oldInterval=globalThis.setInterval,oldClearInterval=globalThis.clearInterval;
const oldTimeout=globalThis.setTimeout,oldClearTimeout=globalThis.clearTimeout;
const intervals=new Map(),timeouts=new Map(),unloads=new Set();let timerId=0;
globalThis.setInterval=fn=>{const id=++timerId;intervals.set(id,fn);return id;};globalThis.clearInterval=id=>intervals.delete(id);
globalThis.setTimeout=fn=>{const id=++timerId;timeouts.set(id,fn);return id;};globalThis.clearTimeout=id=>timeouts.delete(id);
globalThis.window={addEventListener:(name,fn)=>{if(name==='beforeunload')unloads.add(fn);},removeEventListener:(name,fn)=>unloads.delete(fn)};
try{
 for(let index=0;index<20;index++){
  const result=openTagSelector({getSources:()=>[{id:'m',kind:'memory',name:'Memory'}],getTags:()=>[],getValues:async()=>({})});
  const pickerModal=document.body.children[0];assert.equal(intervals.size,1);pickerModal.onclose();assert.equal(await result,null);assert.equal(intervals.size,0);
  const sheetResult=openSheetDialog({source,getSheet,readOnly:true,onInterest:()=>{}});await new Promise(resolve=>setImmediate(resolve));
  const sheetModal=document.body.children[0];assert.equal(unloads.size,1);sheetModal.onclose();assert.equal(await sheetResult,null);assert.equal(unloads.size,0);assert.equal(timeouts.size,0);
 }
 console.log('Twenty picker/sheet open-close cycles leave no intervals, timeouts, or unload listeners.');
}finally{globalThis.setInterval=oldInterval;globalThis.clearInterval=oldClearInterval;globalThis.setTimeout=oldTimeout;globalThis.clearTimeout=oldClearTimeout;}
