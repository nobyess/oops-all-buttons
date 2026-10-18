import assert from 'node:assert/strict';
import {levelGeometry,levelText} from '../static/level-indicator.js';
import {controls} from '../static/controls.js';
const c={width:100,height:200,strokeWidth:2,edgeDiameter:20,minimum:10,maximum:30};
const sample=value=>({value,quality:'good'});
let level=levelGeometry(c,sample(20));assert.equal(level.fraction,.5);assert.deepEqual(level.fill,{x:0,y:100,width:100,height:100});assert.equal(level.geometry.rx,10);
assert.deepEqual(levelGeometry({...c,fillDirection:'top_down'},sample(20)).fill,{x:0,y:0,width:100,height:100});
assert.deepEqual(levelGeometry({...c,fillDirection:'left_right'},sample(20)).fill,{x:0,y:0,width:50,height:200});
assert.deepEqual(levelGeometry({...c,fillDirection:'right_left'},sample(20)).fill,{x:50,y:0,width:50,height:200});
assert.equal(levelGeometry(c,sample(-10)).fraction,0);assert.equal(levelGeometry(c,sample(100)).fraction,1);
for(const s of [undefined,{value:20,quality:'bad'},sample(NaN),sample('20')])assert.equal(levelGeometry(c,s).fraction,0);
assert.equal(levelGeometry({...c,minimum:30,maximum:10},sample(20)).fraction,0);
assert.equal(levelGeometry(c,undefined,true).fraction,.5);
assert(!controls.level.props.text);assert(controls.level.bindable);
console.log('Level Indicator bounds, four fill directions, corner radius, clamping, bad data, and editor preview passed.');

assert.equal(levelText(c,sample(20)),'');
assert.equal(levelText({...c,showValue:true},sample(20)),'50%');
assert.equal(levelText({...c,showValue:true},sample(-100)),'0%');
assert.equal(levelText({...c,showValue:true},sample(100)),'100%');
assert.equal(levelText({...c,showValue:true},undefined),'—');
assert.equal(levelText({...c,showValue:true},undefined,true),'50%');
class Element{constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.classList={add(){}};}append(child){this.children.push(child);}get firstElementChild(){return this.children[0];}querySelector(tag){return this.children.find(child=>child.tag===tag);}setAttribute(key,value){this.attributes[key]=String(value);}}
globalThis.document={createElementNS:(ns,tag)=>new Element(tag)};
const element=new Element('div');
controls.level.render(element,{...c,showValue:true},{bindingValue:sample(20),editing:false});
const svg=element.querySelector('svg'),text=svg.children[3];
assert.equal(text.textContent,'50%');assert.equal(text.attributes.x,'50');assert.equal(text.attributes.y,'100');assert.equal(text.attributes['text-anchor'],'middle');
controls.level.update(element,{...c,showValue:false},{bindingValue:sample(20),editing:false});assert.equal(text.textContent,'');
console.log('Optional centered fill percentage, clamping, unavailable data, and stable SVG text updates passed.');

const fill=svg.children[1];assert.equal(fill.attributes['data-smooth'],'true');
controls.level.update(element,c,{bindingValue:{value:20,quality:'bad'},editing:false});assert.equal(fill.attributes['data-smooth'],'false');
controls.level.update(element,c,{bindingValue:sample(25),editing:false});assert.equal(fill.attributes['data-smooth'],'false');
controls.level.update(element,c,{bindingValue:sample(30),editing:false});assert.equal(fill.attributes['data-smooth'],'true');
controls.level.update(element,c,{bindingValue:sample(30),editing:true});assert.equal(fill.attributes['data-smooth'],'false');
controls.level.update(element,{...c,fillDirection:'right_left'},{bindingValue:sample(30),editing:false});assert.equal(fill.attributes['data-smooth'],'false');
console.log('Smooth level updates exclude initial values, unavailable/recovered samples, editing, and direction changes.');

const surface=svg.children[4],surfaceClip=svg.children[0].children[1].firstElementChild;
controls.level.update(element,c,{bindingValue:sample(20),editing:false});assert.equal(surface.attributes.display,'');assert.equal(surface.attributes['data-axis'],'x');assert.equal(surfaceClip.attributes.y,'100');assert.equal(surfaceClip.attributes.height,'2');
controls.level.update(element,{...c,fillDirection:'top_down'},{bindingValue:sample(20),editing:false});assert.equal(surfaceClip.attributes.y,'98');
controls.level.update(element,{...c,fillDirection:'left_right'},{bindingValue:sample(20),editing:false});assert.equal(surface.attributes['data-axis'],'y');assert.equal(surfaceClip.attributes.x,'48');assert.equal(surfaceClip.attributes.width,'2');
controls.level.update(element,{...c,fillDirection:'right_left'},{bindingValue:sample(20),editing:false});assert.equal(surfaceClip.attributes.x,'50');
for(const value of [10,30]){controls.level.update(element,c,{bindingValue:sample(value),editing:false});assert.equal(surface.attributes.display,'none');}
controls.level.update(element,c,{bindingValue:undefined,editing:false});assert.equal(surface.attributes.display,'none');
assert.equal(svg.children.length,5);
console.log('Quiet surface tracks all four fill boundaries, keeps stable SVG nodes, and hides for empty/full/unavailable values.');

assert.equal(controls.level.props.quietSurface.type,'checkbox');assert.equal(controls.level.defaults.quietSurface,true);
controls.level.update(element,{...c,quietSurface:false},{bindingValue:sample(20),editing:false});assert.equal(surface.attributes.display,'none');
controls.level.update(element,{...c,quietSurface:true},{bindingValue:sample(20),editing:false});assert.equal(surface.attributes.display,'');
assert.equal(fill.attributes['data-smooth'],'true');
console.log('Quiet Surface toggle hides and restores the sheen independently of smooth fill movement.');
