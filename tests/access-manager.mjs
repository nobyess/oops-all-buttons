import assert from 'node:assert/strict';
import {mountAccessManager} from '../static/access-ui.js';
class Element{
 constructor(tag,text='',attrs={}){this.tag=tag;this.textContent=text;this.children=[];this.isConnected=true;Object.assign(this,attrs);}
 append(el){this.children.push(el);}
 replaceChildren(){this.children=[];}
 setAttribute(key,value){this[key]=value;}
}
const node=(tag,text,parent,attrs={})=>{const el=new Element(tag,text,attrs);parent?.append(el);return el;};
const button=(label,parent,run)=>{const el=node('button',label,parent);el.onclick=run;return el;};
const walk=el=>[el,...el.children.flatMap(walk)];
const users=[{id:'admin',username:'Administrator',administrator:true,roles:[],theme:'system'},{id:'operator',username:'Operator',administrator:false,roles:['operate'],starting_page:'main',kiosk:true}];
const roles=[{id:'operate',name:'Operators'},{id:'service',name:'Maintenance'}];
const responses={'admin/users':users,'access/roles':roles,pages:[{id:'main',name:'Main'}]};
const parent=new Element('main');
const close=mountAccessManager(parent,{node,button,api:async path=>responses[path]});
await new Promise(resolve=>setTimeout(resolve,0));
const userList=walk(parent).find(el=>el['aria-label']==='Users');
const roleList=walk(parent).find(el=>el['aria-label']==='Access Roles');
assert.deepEqual(userList.children.map(el=>el.textContent),['Administrator','Operator']);
assert.equal(walk(parent).filter(el=>el.tag==='button' && el.textContent==='Edit').length,2);
userList.value='operator';userList.onchange();
assert.ok(walk(parent).some(el=>el.textContent==='Enabled'));
walk(parent).find(el=>el.tag==='button' && el.textContent==='Operators').onclick();assert.equal(roleList.value,'operate');
roleList.value='service';roleList.onchange();assert.ok(walk(parent).some(el=>el.textContent==='No users assigned.'));
roleList.value='operate';roleList.onchange();walk(parent).find(el=>el.tag==='button' && el.textContent==='Operator').onclick();assert.equal(userList.value,'operator');
close();
console.log('Access list boxes: selection, details, Edit commands, and cross-links work.');
