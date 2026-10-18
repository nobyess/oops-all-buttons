import assert from 'node:assert/strict';
import {TrendBuffer,trendPath} from '../static/live-trend.js';
import {controls} from '../static/controls.js';
const sample=(timestamp,value,quality='good')=>({timestamp,value,quality});
const buffer=new TrendBuffer();buffer.add(sample(100,5),100,60);buffer.add(sample(100,5),101,60);assert.equal(buffer.points.length,1);
buffer.add(sample(99,20),101,60);assert.equal(buffer.points[0].value,5);
buffer.add(sample(101,8),101,60);buffer.add(sample(102,9,'bad'),102,60);buffer.add(sample(103,10),103,60);
const geometry={now:110,span:10,minimum:0,maximum:10,left:0,top:0,width:100,height:100};
const path=trendPath(buffer.points,geometry);assert.equal((path.match(/M/g)||[]).length,2);assert(!path.includes('NaN'));
assert.equal(trendPath([{time:105,value:20},{time:106,value:-5}],geometry),'M50.00 0.00 L60.00 100.00');
buffer.add(sample(103,10),200,10);assert.equal(buffer.points.length,1); // only one predecessor retained
buffer.add(sample(500,10),200,10);assert.equal(buffer.points.length,1); // no future samples
const bounded=new TrendBuffer();for(let i=1;i<=10050;i++)bounded.add(sample(i,i),i,86400);assert.equal(bounded.points.length,10000);
assert(controls.trend.bindable);assert.equal(controls.trend.defaults.timespan,60);
class Element {constructor(tag){this.tag=tag;this.children=[];this.attributes={};}append(child){this.children.push(child);}setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k];}}
globalThis.document={createElementNS:(ns,tag)=>new Element(tag)};
const originalNow=Date.now;let viewTime=Math.floor(originalNow()/1000);Date.now=()=>viewTime*1000;
const el=new Element('div'),c={...controls.trend.defaults,id:'trend',binding:{tag:'input'}},now=Date.now()/1000;delete c.series;
controls.trend.render(el,c,{bindingValue:sample(now,25),editing:false});const svg=el.children[0],line=svg.children.at(-1).children[0];
controls.trend.update(el,c,{bindingValue:sample(now+.1,30),editing:false});assert.equal(el.children.length,1);assert.equal(svg.children.at(-1).children[0],line);assert(line.attributes.d.includes(' L'));
controls.trend.update(el,{...c,binding:{tag:'other'}},{bindingValue:sample(now,80),editing:false});assert(!line.attributes.d.includes(' L'));
console.log('Live trend sample deduplication, ordering, gaps, limits, bounded memory, stable DOM, and binding reset passed.');

const multi=new Element('div'),definition=controls.trend,config={...c,type:'trend',series:[{id:'a',tag:'one',color:'#ff0000'},{id:'b',tag:'two',color:'#00ff00'}]};
definition.render(multi,config,{editing:false,values:{one:sample(now,20),two:sample(now,80)}});
const chart=multi.children[0],a=chart.children.at(-2).children[0],b=chart.children.at(-1).children[0];
assert.equal(a.attributes.stroke,'#ff0000');assert.equal(b.attributes.stroke,'#00ff00');assert.notEqual(a.attributes.d,b.attributes.d);
definition.update(multi,config,{editing:false,values:{one:sample(now+.1,25),two:sample(now+.2,75)}});
assert.equal(chart.children.at(-2).children[0],a);assert(a.attributes.d.includes(' L'));assert(b.attributes.d.includes(' L'));
console.log('Independent multitag buffers, colors, and stable series rendering passed.');

const {pageTagIds}=await import('../static/live-subscriptions.js');
const {instantiatePage}=await import('../static/page-parameters.js');
const template={id:'p',controls:[{...config,series:[{id:'a',tag:'parameter:input',color:'#ff0000'},{id:'b',tag:'two',color:'#00ff00'}]}]};
const instance=instantiatePage(template,{'parameter:input':'one'});assert.deepEqual(instance.controls[0].series.map(s=>s.tag),['one','two']);
delete instance.controls[0].binding;assert.deepEqual(new Set(pageTagIds(instance)),new Set(['one','two']));assert.equal(template.controls[0].series[0].tag,'parameter:input');
console.log('All trend series participate in subscriptions and parameter instances without mutating templates.');

const {trendColor,trendSeries}=await import('../static/live-trend.js');
assert.equal(trendColor('#2563eb00'),'#2563eb');assert.equal(trendColor('#dc262680'),'#dc2626');
assert.equal(trendSeries({series:[{id:'a',tag:'one',color:'#2563eb00'}]})[0].color,'#2563eb');
assert.equal(trendSeries({binding:{tag:'old'},foreColor:'#dc262622'})[0].color,'#dc2626');
console.log('Trend line colors ignore per-series alpha, including legacy bindings.');

const inherited=trendSeries({minimum:-10,maximum:200,series:[{id:'a',tag:'one',color:'#ff0000'}]})[0];assert.equal(inherited.minimum,-10);assert.equal(inherited.maximum,200);
const scaled=new Element('div');const independent={...config,series:[{id:'a',tag:'one',color:'#ff0000',minimum:0,maximum:100},{id:'b',tag:'two',color:'#00ff00',minimum:0,maximum:1000}]};
definition.render(scaled,independent,{editing:false,values:{one:sample(now,20),two:sample(now,200)}});
const scaledSvg=scaled.children[0];assert.equal(scaledSvg.children.at(-2).children[0].attributes.d,scaledSvg.children.at(-1).children[0].attributes.d);
assert(scaledSvg.children.some(e=>e.textContent==='100%'));
console.log('Independent trend ranges normalize equal fractions consistently and preserve legacy limits.');


// Cached samples from before this view opened must never seed the new trace.
const freshView=new Element('div');
definition.render(freshView,config,{editing:false,values:{one:sample(viewTime-10,90),two:sample(viewTime-1,50)}});
const freshSvg=freshView.children[0],freshLine=freshSvg.children.at(-2).children[0];
assert.equal(freshLine.attributes.d,'');
definition.update(freshView,config,{editing:false,values:{one:sample(viewTime+.1,25),two:sample(viewTime+.2,75)}});
assert(freshLine.attributes.d.startsWith('M'));assert(!freshLine.attributes.d.includes(' L'));
definition.update(freshView,config,{editing:false,values:{one:sample(viewTime+.3,30)}});
assert(freshLine.attributes.d.includes(' L'));
viewTime+=10;
const reopened=new Element('div');
definition.render(reopened,config,{editing:false,values:{one:sample(viewTime-1,30)}});
assert.equal(reopened.children[0].children.at(-2).children[0].attributes.d,'');
const freshBuffer=new TrendBuffer(100);freshBuffer.add(sample(99,5),100,60);assert.equal(freshBuffer.points.length,0);
freshBuffer.add(sample(100,6),100,60);assert.equal(freshBuffer.points.length,1);
Date.now=originalNow;
console.log('New and reopened views ignore cached samples until fresh device timestamps arrive.');


const {trendSampleAt}=await import('../static/live-trend.js');
const recorded=[{time:10,value:2},{time:12,value:null},{time:14,value:8}];
assert.equal(trendSampleAt(recorded,9),null);assert.equal(trendSampleAt(recorded,15),null);
assert.equal(trendSampleAt(recorded,10.5).value,2);assert.equal(trendSampleAt(recorded,12).value,null);
assert.equal(trendSampleAt(recorded,13.5).value,8);
Element.prototype.append=function(child){child.parent=this;this.children.push(child);};
Element.prototype.remove=function(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);};
Element.prototype.getBoundingClientRect=()=>({left:0,top:0,width:360,height:200});
let cursorTime=1000;Date.now=()=>cursorTime*1000;
const held=new Element('div'),longName='A considerably longer tag name than twenty four characters';
definition.render(held,config,{editing:false,values:{one:sample(1000,20),two:sample(1000,30)},tagLabel:()=>longName});
const heldSvg=held.children[0];assert(heldSvg.children.at(-2).children[2].textContent.length>24);
cursorTime=1002;definition.update(held,config,{editing:false,values:{one:sample(1002,25),two:sample(1002,35)}});
const pointer={button:0,pointerId:1,clientX:348,clientY:100,preventDefault(){},stopPropagation(){}};
heldSvg.onpointerdown(pointer);const overlay=heldSvg.children.at(-1);
assert.equal(overlay.children[0].tag,'line');assert(overlay.children.some(e=>e.textContent?.includes(': 25')));assert(overlay.children.some(e=>e.textContent?.includes(': 35')));
heldSvg.onpointerup(pointer);assert(!heldSvg.children.includes(overlay));
heldSvg.onpointerdown(pointer);heldSvg.onpointercancel(pointer);assert.equal(heldSvg.children.length,9);
Date.now=originalNow;
console.log('Hold cursor shows recorded per-series values, respects missing data, and clears on release/cancel; legends use available width.');
