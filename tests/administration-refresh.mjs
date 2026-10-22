import assert from 'node:assert/strict';
import {mountAdministration} from '../static/administration.js';
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.textContent='';this.value='';this.scrollTop=0;this.classList={toggle(){}};}
 append(child){child.parentElement=this;this.children.push(child);}
 replaceChildren(){this.children=[];}
 remove(){this.parentElement.children=this.parentElement.children.filter(child=>child!==this);}
 setAttribute(key,value){this[key]=value;}
}
const walk=el=>el.children.flatMap(child=>[child,...walk(child)]);
const node=(tag,text,parent,attrs={})=>{const el=Object.assign(new Element(tag),attrs);if(text!==null)el.textContent=text;parent?.append(el);return el;};
const button=(text,parent,onclick)=>node('button',text,parent,{onclick});
globalThis.document={visibilityState:'visible'};
const timers=[],set=globalThis.setInterval,clear=globalThis.clearInterval;
globalThis.setInterval=fn=>{timers.push(fn);return timers.length;};globalThis.clearInterval=()=>{};
const source={id:'plc',name:'PLC',kind:'bacnet',settings:{},tags:[],status:{quality:'good',message:'Connected',cov:{active:1,polling:2,notifications:3,last_error:'Previous failure'}}};
let data={uptime:1,cpu_seconds:0,database_bytes:0,threads:4,requests:{total:1},polling:{clients:0,sources:{}},sources:[source],tags:0,pages:1,python:'3',platform:'test',error_log:[]};
const root=new Element('main');let close;
try{
 close=mountAdministration(root,{node,button,api:async path=>path==='admin/status'?structuredClone(data):path==='admin/sign-in'?{required:true,has_administrator:true}:path==='admin/server-settings'?{port:8080,can_restart:true}:path==='admin/site'?{logo_name:'',default_logo:true}:[]});
 await new Promise(resolve=>setImmediate(resolve));
 const tab=walk(root).find(el=>el.textContent==='Server Status');await tab.onclick();await new Promise(resolve=>setImmediate(resolve));
 const summary=walk(root).find(el=>el.className==='admin-stat-grid'),drivers=walk(root).find(el=>el.className==='admin-drivers');
 const group=summary.children[0],card=drivers.children[0],metric=walk(card).find(el=>el.textContent==='Configured tags').parentElement;
 drivers.scrollTop=88;data.uptime=2;data.cpu_seconds=.1;source.tags.push({id:'one'});delete source.status.cov.last_error;
 await timers.at(-1)();
 assert.equal(summary.children[0],group);assert.equal(drivers.children[0],card);assert.equal(drivers.scrollTop,88);
 assert.equal(walk(card).find(el=>el.textContent==='Configured tags').parentElement,metric);assert.equal(metric.children[1].textContent,'1');
 assert(!walk(card).some(el=>el.textContent==='Last COV subscription error'));
 await tab.onclick();assert.equal(drivers.children[0],card,'Active tab must not remount');
 data.sources=[];await timers.at(-1)();assert.equal(drivers.children.length,0);
 data.sources=[source];await timers.at(-1)();assert.equal(drivers.children.length,1);
 console.log('Server Status retains cards and metric nodes, updates values, removes stale fields/sources, and preserves scrolling.');
}finally{close?.();globalThis.setInterval=set;globalThis.clearInterval=clear;}
