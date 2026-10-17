import assert from 'node:assert/strict';
import {topicTree} from '../static/mqtt-tag-browser.js';
const tree=topicTree([{topic:'plant/pump/speed',value:12},{topic:'plant/pump',value:1},{topic:'plant/pump/state',value:true},{topic:'other',value:'text'}]);
const pump=tree.children.get('plant').children.get('pump');
assert.equal(pump.item.value,1);assert.equal(pump.children.get('speed').path,'plant/pump/speed');assert.equal(pump.children.get('state').item.value,true);assert.equal(tree.children.get('other').item.value,'text');
assert.equal(topicTree([{topic:'/a'}]).children.get('').children.get('a').path,'/a');
console.log('MQTT topics form an expandable tree, including topics that are both values and branches.');
