import assert from 'node:assert/strict';
import {explorerLabel,togglePinned,cloneControl} from '../static/control-edit.js';
const control={id:'label_1',type:'label',text:'Background',left:0,top:0,width:100,height:100};
assert.equal(explorerLabel(control),'label_1');
togglePinned(control);assert.equal(control.pinned,true);assert.equal(explorerLabel(control),'📌 label_1');
const copy=cloneControl(control,{width:1000,height:1000},{x:20,y:20},20,()=> 'copy');
assert.equal(copy.pinned,true);togglePinned(copy);assert.equal(control.pinned,true);assert.equal(copy.pinned,false);
const saved=JSON.parse(JSON.stringify(control));assert.equal(saved.pinned,true);
togglePinned(control);assert.equal(explorerLabel(control),'label_1');
console.log('Pin state, Explorer labels, persistence, and independent copies passed.');

control.name='Tank Background';assert.equal(explorerLabel(control),'Tank Background');
const namedCopy=cloneControl(control,{width:1000,height:1000},{x:20,y:20},20,()=> 'named-copy');
assert.equal(namedCopy.name,namedCopy.id);assert.equal(control.name,'Tank Background');
