import {layerDrop,moveLayerTo} from '../static/layers.js';
import assert from 'node:assert/strict';
import {layerBlocks,paintOrder,addToGroup,removeFromGroups} from '../static/layers.js';
import {orderControl,stepControl} from '../static/control-edit.js';
import {ungroup} from '../static/groups.js';
const ids=page=>paintOrder(page).map(c=>c.id);
const page={groups:[{id:'group'},{id:'group2'}],controls:[
 {id:'a',groupId:'group'},{id:'outside'},{id:'b',groupId:'group'},
 {id:'c',groupId:'group2'},{id:'d',groupId:'group2'},{id:'front'}]};
assert.deepEqual(ids(page),['outside','a','b','c','d','front']);
assert.deepEqual(layerBlocks(page).map(layer=>layer.id),['outside','group','group2','front']);
orderControl(page,'a',true);assert.deepEqual(ids(page),['outside','b','a','c','d','front']);
stepControl(page,'a',true);assert.deepEqual(ids(page),['outside','b','a','c','d','front']);
stepControl(page,'a',false);assert.deepEqual(ids(page),['outside','a','b','c','d','front']);
orderControl(page,'group',true);assert.deepEqual(ids(page),['outside','c','d','front','a','b']);
stepControl(page,'group',false);assert.deepEqual(ids(page),['outside','c','d','a','b','front']);
orderControl(page,'group',false);assert.deepEqual(ids(page),['a','b','outside','c','d','front']);
// Adding a formerly frontmost page control puts it in front of its new siblings,
// without lifting its group above the other page layers.
addToGroup(page,['front'],'group');assert.deepEqual(ids(page),['a','b','front','outside','c','d']);
assert.equal(page.controls.find(c=>c.id==='front').groupId,'group');
addToGroup(page,['c'],'group');assert.deepEqual(ids(page),['a','b','front','c','outside','d']);
assert.deepEqual(layerBlocks(page).map(layer=>layer.id),['group','outside','group2']);
orderControl(page,'front',false);assert.deepEqual(ids(page),['front','a','b','c','outside','d']);
removeFromGroups(page,['a']);assert.deepEqual(ids(page),['front','b','c','a','outside','d']);
assert.equal(page.controls.find(c=>c.id==='a').groupId,undefined);
ungroup(page,'group');assert.deepEqual(ids(page),['front','b','c','a','outside','d']);
assert.ok(!page.groups.some(group=>group.id==='group'));
orderControl(page,'front',true);assert.deepEqual(ids(page),['b','c','a','outside','d','front']);
console.log('Group layer blocks, local member order, page group order, front insertion, removal, and ungrouping passed.');

// Losing the final member removes the group; moving its last member does too.
const emptying={groups:[{id:'one'},{id:'two'}],controls:[{id:'x',groupId:'one'},{id:'y',groupId:'two'}]};
addToGroup(emptying,['x'],'two');
assert.deepEqual(emptying.groups.map(group=>group.id),['two']);
removeFromGroups(emptying,['x','y']);
assert.deepEqual(emptying.groups,[]);
assert.ok(emptying.controls.every(control=>!control.groupId));

const dragPage={groups:[{id:'g'}],controls:[{id:'a'},{id:'x',groupId:'g'},{id:'y',groupId:'g'},{id:'b'}]};
assert.equal(moveLayerTo(dragPage,'a','b',true),true);
assert.deepEqual(ids(dragPage),['x','y','b','a']);
assert.equal(moveLayerTo(dragPage,'g','a',true),true);
assert.deepEqual(ids(dragPage),['b','a','x','y']);
assert.equal(moveLayerTo(dragPage,'y','x',false),true);
assert.deepEqual(ids(dragPage),['b','a','y','x']);
assert.equal(layerDrop(dragPage,'x','a'),null,'Members cannot be dragged outside their group');
assert.equal(moveLayerTo(dragPage,'x','a'),false);
assert.equal(moveLayerTo(dragPage,'a','y',true),true,'Dropping beside a group member moves the whole target group boundary');
assert.deepEqual(ids(dragPage),['b','y','x','a']);
assert.equal(moveLayerTo(dragPage,'a','x',true),false,'Unchanged order does not create an edit');
assert.equal(layerDrop(dragPage,'@page','a'),null);
assert.equal(layerDrop(dragPage,'a','@page'),null);
assert.equal(layerDrop(dragPage,'x','g'),null);
assert.equal(dragPage.controls.find(c=>c.id==='x').groupId,'g');
