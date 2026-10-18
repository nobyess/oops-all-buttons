import {refreshPolicy} from '../static/refresh-policy.js';
assert.equal(refreshPolicy.defaultLive,500);
assert.equal(refreshPolicy.management,1000);
// Dependency-free component behavior checks. This is not a browser layout test.
import assert from 'node:assert/strict';
import {plcTagName} from '../static/plc-tag-browser.js';
assert.equal(plcTagName('Program:MainProgram.TestBit'),'MainProgram.TestBit');
assert.equal(plcTagName('Motor.Flags[2]'),'Motor.Flags[2]');
import {openTagSelector, tagPicker, tagPath} from '../static/tag-selector.js';
assert.equal(tagPath({source:'Plant',address:'device/123/analogInput/2/presentValue'}),String.raw`Plant\device/123/analogInput/2/presentValue`);
assert.equal(tagPath({source:'Plant',address:'1',path:'bacnet://device/123/object/2'}),String.raw`Plant\1`);
assert.equal(tagPath({source:'stable-id',source_name:'Renamed Plant',address:'1'}),String.raw`Renamed Plant\1`);
import {controls} from '../static/controls.js';
import {installLauncher} from '../static/launcher.js';
import {createNotifier} from '../static/toast.js';
import {clampPosition} from '../static/page-window.js';
import {pagePoint} from '../static/editor-view.js';
import {colorOpacity, withOpacity} from '../static/color-picker.js';
import {alignmentPicker} from '../static/alignment-picker.js';
import {cloneControl, orderControl, stepControl} from '../static/control-edit.js';
import {EditHistory} from '../static/edit-history.js';
import {actionLabel,eventLabel} from '../static/rule-labels.js';
assert.equal(actionLabel({trigger:'click',action:'set',tag:'SimuTag',value:1.05}),'Click → Set SimuTag To 1.05');
assert.equal(actionLabel({trigger:'mouse_down',action:'increment',tag:'SimuTag',value:10}),'Mouse Down → Increment SimuTag By 10');
assert.equal(eventLabel({tag:'Temp',operator:'within_range',operand:{value:10},end_operand:{kind:'tag',tag:'Limit'},action:'hide'}),'Temp Is Within 10 To Limit → Hide');
assert.equal(eventLabel({tag:'Temp',operator:'>',operand:{value:25},action:'hide'}),'Temp > 25 → Hide');
const historyTest=new EditHistory(3),historyPage={id:'history',name:'Start',controls:[]};
historyTest.ensure(historyPage);
historyPage.name='A';historyTest.record(historyPage,'name',100);
historyPage.name='AB';historyTest.record(historyPage,'name',200);
assert.equal(historyTest.move(historyPage,-1).name,'Start');
assert.equal(historyTest.move(historyPage,1).name,'AB');
historyTest.move(historyPage,-1);
historyPage.name='New branch';historyTest.record(historyPage);
assert.equal(historyTest.canRedo(historyPage),false);
for(let n=0;n<10;n++){historyPage.name=String(n);historyTest.record(historyPage);}
assert.equal(historyTest.ensure(historyPage).items.length,4);
const otherPage={id:'other',name:'Other',controls:[]};
assert.equal(historyTest.canUndo(otherPage),false);
assert.equal(historyTest.move(historyPage,-1).name,'8');
const editPage={width:200,height:100,controls:[{id:'back'},{id:'front'}]};
orderControl(editPage,'back',true);
assert.deepEqual(editPage.controls.map(c=>c.id),['front','back']);
orderControl(editPage,'back',false);
assert.deepEqual(editPage.controls.map(c=>c.id),['back','front']);
stepControl(editPage,'back',true);
assert.deepEqual(editPage.controls.map(c=>c.id),['front','back']);
stepControl(editPage,'back',true);
assert.deepEqual(editPage.controls.map(c=>c.id),['front','back']);
stepControl(editPage,'back',false);
assert.deepEqual(editPage.controls.map(c=>c.id),['back','front']);
const original={id:'image1',type:'image',width:50,height:40,image:'/api/images/example',actions:[{id:'a',tag:'counter'}],events:[{id:'e',operand:{value:3}}]};
let nextId=0;
const duplicate=cloneControl(original,editPage,{x:999,y:-10},20,()=>String(++nextId));
assert.equal(duplicate.left,150);assert.equal(duplicate.top,0);
assert.notEqual(duplicate.id,original.id);assert.notEqual(duplicate.actions[0].id,original.actions[0].id);
duplicate.events[0].operand.value=9;
assert.equal(original.events[0].operand.value,3);
assert.equal(duplicate.image,original.image);
assert.equal(withOpacity('#123456',50),'#12345680');
assert.equal(colorOpacity('#12345680'),50);
assert.equal(withOpacity('#123456',0),'#12345600');
assert.equal(withOpacity('#12345680',100),'#123456');
assert.deepEqual(pagePoint(210, 120, {left:10, top:20}, 2), {x:100, y:50});
assert.deepEqual(pagePoint(60, 45, {left:10, top:20}, 0.5), {x:100, y:50});

class Element {
  constructor(tag) {this.tagName = tag; this.children = []; this.dataset = {}; this.style = {}; this.value = '';}
  append(...children) {for (const child of children) {child.parent = this; this.children.push(child);}}
  replaceChildren() {this.children = [];}
  setAttribute(key, value) {this[key] = value;}
  get options() {return this.children;}
  focus() {}
  showModal() {this.open = true;}
  close() {this.open = false; this.onclose?.();}
  remove() {this.parent.children = this.parent.children.filter(child => child !== this);}
  querySelector(tag) {return this.children.find(child => tag.startsWith('.') ? child.className === tag.slice(1) : child.tagName === tag);}
}
globalThis.document = {body: new Element('body'), createElement: tag => new Element(tag),
  createElementNS: (namespace, tag) => new Element(tag)};
globalThis.window = {location: {hash: ''}};
const alignParent=new Element('div');let alignment='center';
alignmentPicker('Horizontal Alignment',alignParent,'horizontal',alignment,value=>alignment=value);
const alignButtons=alignParent.children[0].children[1].children;
assert.equal(alignButtons.length,3);
assert.equal(alignButtons[1]['aria-pressed'],'true');
alignButtons[2].onclick();
assert.equal(alignment,'right');
assert.equal(alignButtons[1]['aria-pressed'],'false');
assert.equal(alignButtons[2]['aria-pressed'],'true');
const descendants = root => root.children.flatMap(child => [child, ...descendants(child)]);
const providers = {
  getSources: () => [{id: 'Plant'}, {id: 'Meters'}],
  getTags: () => [{id: 'Temperature', name:'Temperature', source: 'Plant', address: '1'}, {id: 'Power', name:'Power', source: 'Meters', address: '2'}],
  getValues: async () => ({Temperature: {value: 24, quality: 'good'}, Power: {value: null, quality: 'bad'}})
};
const interests=[];

const selection = openTagSelector({value: 'Temperature', ...providers, onInterest:value=>interests.push(value)});
let modal = document.body.children[0];
let nodes = descendants(modal);
let tags = nodes.find(node => node.tagName === 'select');
assert(nodes.some(node=>node.textContent==='All Sources'));
assert.equal(tags.options.length, 1);
assert.equal(tags.options[0].textContent,'Temperature');
assert(nodes.find(node=>node.textContent==='All Sources').className.includes('tag-source-all'));
assert(!nodes.some(node=>node.className==='tag-selector-path'));
assert(nodes.some(node=>node.textContent===String.raw`Plant\Temperature`));
nodes.find(node=>node.textContent==='Meters' && node.tagName==='button').onclick();
assert.equal(tags.options.length, 1);
assert.equal(tags.options[0].value, 'Power');
const search = nodes.find(node => node.type === 'search');
search.value = 'does not exist'; search.oninput();
assert.equal(tags.options.length, 0);
search.value = ''; search.oninput();
tags.value = 'Power'; tags.onchange();
assert(nodes.some(node=>node.textContent===String.raw`Meters\Power`));
await new Promise(resolve => setImmediate(resolve));
assert(nodes.some(node => node.textContent === 'Current value: unavailable'));
nodes.find(node => node.textContent === 'Confirm').onclick();
assert.equal(await selection, 'Power');
assert.deepEqual(interests,['Temperature','','Power','']);
assert.equal(document.body.children.length, 0);

const browseAll=openTagSelector({...providers,getTags:()=>[...providers.getTags(),{id:'bac',source:'Plant',source_name:'Plant',name:'Room Sensor',bacnet_path:'144/2:200/presentValue'}]});
modal=document.body.children[0];
let allNodes=descendants(modal);
allNodes.find(node=>node.textContent==='All Sources' && node.tagName==='button').onclick();
let allTags=allNodes.find(node=>node.tagName==='select');
assert.deepEqual(allTags.options.map(option=>option.textContent),[String.raw`Plant\Temperature`,String.raw`Meters\Power`,String.raw`Plant\Room Sensor`]);
allTags.value='bac';allTags.onchange();
assert(allNodes.some(node=>node.tagName==='strong' && node.textContent===String.raw`Plant\Room Sensor`));
allNodes.find(node=>node.textContent==='Plant' && node.tagName==='button').onclick();
assert.deepEqual(allTags.options.map(option=>option.textContent),['Temperature','Room Sensor']);
allNodes.find(node=>node.textContent==='Cancel').onclick();await browseAll;

const cancelled = openTagSelector({value: 'Temperature', ...providers});
modal = document.body.children[0];
descendants(modal).find(node => node.textContent === 'Cancel').onclick();
assert.equal(await cancelled, null);

const parent = new Element('div'); let picked = 'Temperature';
tagPicker(parent, {label: 'Source Tag', value: picked, onChange: value => {picked = value;}, ...providers});
descendants(parent).find(node => node.title === 'Clear tag selection').onclick();
assert.equal(picked, '');

const content = new Element('div');
const context = {editing: false};
controls.button.render(content, {text: 'Press'}, context);
const originalButton = content.querySelector('button');
controls.button.update(content, {text: 'Updated'}, context);
assert.equal(content.querySelector('button'), originalButton);
const originalText=originalButton.querySelector('.button-text');
assert.equal(originalText.textContent, 'Updated');
assert.equal(originalButton.disabled,false);
assert(!('tag' in controls.button.props));

const launcherButton = new Element('button');
installLauncher(launcherButton);
launcherButton.onclick();
modal = document.body.children[0];
assert.equal(launcherButton['aria-expanded'], 'true');
assert(!descendants(modal).some(node=>node.tagName==='button'));
const links = descendants(modal).filter(node => node.tagName === 'a');
assert.deepEqual(links.map(link => link.href), ['#sources', '#sheets', '#pages', '#administration', '#alarms']);
assert.deepEqual(links.map(link => link.children[1].textContent), ['Data Sources & Tags', 'Sheets', 'Pages', 'Administration', 'Alarms']);
links[2].onclick({preventDefault() {}});
assert.equal(window.location.hash, '#pages');
assert.equal(document.body.children.length, 0);
assert.equal(launcherButton['aria-expanded'], 'false');
console.log('Tag Selector, stable button updates, and application launcher behavior passed.');
assert.deepEqual(clampPosition({x:900,y:700},{width:300,height:200},{width:1000,height:800}),{x:700,y:600});
assert.deepEqual(clampPosition({x:-100,y:-50},{width:300,height:200},{width:1000,height:800}),{x:0,y:0});

// Advance notification timers without real waits, including overlapping saves.
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
const pendingTimers = new Map(); let timerId = 0;
globalThis.setTimeout = callback => {pendingTimers.set(++timerId, callback); return timerId;};
globalThis.clearTimeout = id => pendingTimers.delete(id);
try {
  const classes = new Set();
  const toast = {textContent: '', classList: {add: name => classes.add(name), remove: name => classes.delete(name)}};
  const notify = createNotifier(toast);
  const advance = () => {const [id, callback] = pendingTimers.entries().next().value; pendingTimers.delete(id); callback();};
  notify('Page saved.');
  assert(classes.has('is-visible'));
  advance(); // Fade starts.
  assert(!classes.has('is-visible'));
  notify('Saved again.'); // Cancel the old message's pending clear.
  assert.equal(pendingTimers.size, 1);
  assert.equal(toast.textContent, 'Saved again.');
  advance(); advance();
  assert.equal(toast.textContent, '');
  assert.equal(pendingTimers.size, 0);
  console.log('Toast auto-dismiss and overlapping notification timers passed.');
} finally {
  globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout;
}

controls.button.update(content,{text:'Base',contentOverride:'<b>Literal</b>\nNext'},context);
assert.equal(content.querySelector('button'),originalButton);
assert.equal(originalButton.querySelector('.button-text'),originalText);
assert.equal(originalText.textContent,'<b>Literal</b>\nNext');
const numericContent=new Element('div');
controls.numeric.render(numericContent,{text:'Value',contentOverride:'Stopped'},{bindingValue:{quality:'good',value:42}});
assert.equal(numericContent.textContent,'42.00');
controls.numeric.render(numericContent,{text:'Value'},{bindingValue:{quality:'good',value:42}});
assert.equal(numericContent.textContent,'42.00');

assert.equal(tagPath({source:'uuid',source_name:'WWTP',name:'MainProgram.TestTag',address:'Program:MainProgram.TestTag',path:'192.168.1.10/0 / Program:MainProgram.TestTag'}),String.raw`WWTP\MainProgram.TestTag`);
assert.equal(tagPath({source:'uuid',source_name:'Lonnie Sheet',name:'D1',address:'D1'}),String.raw`Lonnie Sheet\D1`);
assert.equal(tagPath({source:'uuid',source_name:'Memory',name:'TestTag',address:'internal-id'}),String.raw`Memory\TestTag`);
const pathField=new Element('div');
const pathBox=tagPicker(pathField,{label:'Source Tag',value:'Temperature',...providers});
assert.equal(pathBox.textContent,String.raw`Plant\Temperature`);
console.log('Canonical Source Name\\Tag Name paths, PLC program names, sheets, and picker fields passed.');
