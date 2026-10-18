import assert from 'node:assert/strict';
import {confirmPageLeave} from '../static/page-leave-dialog.js';
import {connectParameters} from '../static/parameter-dialog.js';
class Element{
 constructor(tag){this.tagName=tag;this.children=[];}
 append(...children){for(const c of children){c.parent=this;this.children.push(c);}}
 showModal(){} close(){} remove(){this.parent.children=this.parent.children.filter(c=>c!==this);}
}
globalThis.document={body:new Element('body'),createElement:tag=>new Element(tag)};
const all=root=>root.children.flatMap(c=>[c,...all(c)]);
for(const [label,value] of [['Cancel','cancel'],['Discard','discard'],['Save & Continue','save']]){
 const pending=confirmPageLeave('Main'),modal=document.body.children[0];
 all(modal).find(c=>c.textContent===label).onclick();assert.equal(await pending,value);assert.equal(document.body.children.length,0);
}
const escaped=confirmPageLeave('Main');let prevented=false;document.body.children[0].oncancel({preventDefault(){prevented=true;}});assert.equal(await escaped,'cancel');assert(prevented);
const destination={name:'Faceplate',parameters:[{id:'parameter:a',name:'PV',description:'Current value'},{id:'parameter:b',name:'Command',description:'Pushbutton'}]},connections={'parameter:a':'original'};
let updates=[];
const pending=connectParameters(destination,connections,(parent,name,value,onChange)=>{updates.push(onChange);assert.equal(parent.className,'parameter-picker');});
let modal=document.body.children[0];assert.equal(modal.className,'designer-dialog parameter-dialog parameter-connect-dialog');
const rows=all(modal).filter(c=>c.className==='parameter-connection');assert.equal(rows.length,2);assert.equal(rows[0].children[0].className,'parameter-info');assert.equal(rows[0].children[1].className,'parameter-picker');
updates[0]('changed');all(modal).find(c=>c.textContent==='Cancel').onclick();assert.equal(await pending,null);assert.equal(connections['parameter:a'],'original');
updates=[];const saved=connectParameters(destination,connections,(parent,name,value,onChange)=>updates.push(onChange));modal=document.body.children[0];updates[1]('second');all(modal).find(c=>c.textContent==='Save').onclick();assert.deepEqual(await saved,{'parameter:a':'original','parameter:b':'second'});
console.log('Cancel/Discard/Save & Continue, Escape cancellation, compact connection rows, and isolated dialog drafts passed.');

