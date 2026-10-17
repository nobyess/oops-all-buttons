import assert from 'node:assert/strict';
import {shapeGeometry,addLinePoint,removeLinePoint,linePoints,polylineSelection,editingPolyline} from '../static/shapes.js';
import {controls} from '../static/controls.js';
import {evaluateControlEvents} from '../static/visual-events.js';
assert.deepEqual(shapeGeometry({type:'square',width:100,height:80,strokeWidth:4,edgeDiameter:20}),{tag:'rect',attributes:{x:0,y:0,width:100,height:80,rx:10}});
assert.equal(shapeGeometry({type:'square',width:20,height:20,strokeWidth:2,edgeDiameter:100}).attributes.rx,10);
assert.deepEqual(shapeGeometry({type:'circle',width:120,height:80,strokeWidth:4}),{tag:'ellipse',attributes:{cx:60,cy:40,rx:60,ry:40}});
assert.equal(shapeGeometry({type:'triangle',width:100,height:100,strokeWidth:4}).attributes.points,'50,2 98,98 2,98');
for(const type of ['square','circle','triangle']) {
 assert.equal(controls[type].category,'shapes');assert(controls[type].props.backColor);assert(controls[type].props.foreColor);
 const c={type,events:[{id:'e',tag:'tag',operator:'=',operand:{value:1},action:'set_content',content:'Running',contentStyle:{backColor:'#ff000080',foreColor:'#00ff00'}}]};
 assert.deepEqual(evaluateControlEvents(c,{tag:{quality:'good',value:1}}),{});
 assert.equal(controls[type].props.text,undefined);assert.equal(controls[type].props.fontSize,undefined);
 assert.deepEqual(evaluateControlEvents(c,{tag:{quality:'good',value:0}}),{});
}
console.log('Shape stroke bounds, corner diameter, ellipse sizing, categories, content removal, and triangle rotation passed.');

const triangle={type:'triangle',width:120,height:80,strokeWidth:4};
const expected=['118,40 2,78 2,2','60,78 2,2 118,2','2,40 118,2 118,78','60,2 118,78 2,78'];
for(const points of expected){controls.triangle.props.rotation.onClick(triangle);assert.equal(shapeGeometry(triangle).attributes.points,points);}
assert.equal(triangle.rotation,0);

const line={id:'line',type:'polyline',width:200,height:100,strokeWidth:4,points:[[0,0],[1,1]]};
assert.deepEqual(shapeGeometry(line),{tag:'polyline',attributes:{points:'2,2 198,98'}});
addLinePoint(line);assert.deepEqual(line.points,[[0,0],[0.5,0.5],[1,1]]);
assert.equal(polylineSelection.get(line.id),1);assert(editingPolyline(line));
removeLinePoint(line);assert.deepEqual(line.points,[[0,0],[1,1]]);
removeLinePoint(line);assert.equal(line.points.length,2);
line.width=400;assert.equal(shapeGeometry(line).attributes.points,'2,2 398,98');
const defaults=linePoints({});addLinePoint({id:'other',width:100,height:100});assert.equal(defaults.length,3);
assert.equal(controls.polyline.props.text,undefined);assert(controls.polyline.props.backColor);
console.log('Polyline open geometry, scaling, midpoint insertion, selected point removal, and minimum point count passed.');

const {shapeFill,closedPolyline}=await import('../static/shapes.js');
const closed={id:'closed',type:'polyline',fillWhenClosed:true,backColor:'#00ff0080',points:[[0,0],[1,0],[.5,1],[0,0]]};
assert(closedPolyline(closed));assert.equal(shapeFill(closed),'#00ff0080');
assert.equal(shapeFill({...closed,fillWhenClosed:false}),'none');assert.equal(shapeFill({...closed,points:closed.points.slice(0,-1)}),'none');
assert.equal(controls.polyline.props.addAfter.visibleWhen(closed),true);
controls.polyline.props.pointEditing.onClick({...closed,width:100,height:100,left:0,top:0,strokeWidth:2});
assert.equal(controls.polyline.props.addAfter.visibleWhen(closed),false);assert.equal(controls.polyline.props.removePoint.visibleWhen(closed),false);
controls.polyline.props.pointEditing.onClick(closed);assert.equal(controls.polyline.props.addAfter.visibleWhen(closed),true);
console.log('Closed polyline fill uses Back Color only when enabled; point commands appear only during point editing.');

const {insertLinePoint,selectedLinePoint,canInsertLinePoint,openPolyline,canContinuePolyline}=await import('../static/shapes.js');
const open={id:'ordered',type:'polyline',left:20,top:30,width:100,height:100,strokeWidth:2,points:[[0,0],[.5,.5],[1,1]]};
polylineSelection.set(open.id,1);insertLinePoint(open,true);assert.deepEqual(open.points,[[0,0],[.25,.25],[.5,.5],[1,1]]);assert.equal(selectedLinePoint(open),1);
insertLinePoint(open,false);assert.deepEqual(open.points[2],[.375,.375]);assert.equal(selectedLinePoint(open),2);
polylineSelection.set(open.id,0);assert(!canInsertLinePoint(open,true));assert(canInsertLinePoint(open,false));assert(canContinuePolyline(open));
polylineSelection.set(open.id,open.points.length-1);assert(canInsertLinePoint(open,true));assert(!canInsertLinePoint(open,false));assert(canContinuePolyline(open));
const loop={...open,id:'loop',points:[[0,0],[1,0],[.5,1],[0,0]]};polylineSelection.set(loop.id,0);insertLinePoint(loop,true);assert.deepEqual(loop.points.at(-2),[.25,.5]);assert(closedPolyline(loop));
openPolyline(loop);assert(!closedPolyline(loop));assert.equal(selectedLinePoint(loop),loop.points.length-1);assert(canContinuePolyline(loop));
const triangleLoop={...loop,id:'minimum-loop',points:[[0,0],[1,0],[.5,1],[0,0]]};removeLinePoint(triangleLoop);assert.equal(triangleLoop.points.length,4);
console.log('Before/after insertion follows selection, wraps closed loops, opens at the last point, and exposes endpoint continuation.');

class ShapeElement{
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.classList={add(){}};}
 append(el){this.children.push(el);}setAttribute(key,value){this.attrs[key]=String(value);}
 get firstElementChild(){return this.children[0];}
 querySelector(tag){return this.children.find(child=>child.tag===tag) || null;}
}
globalThis.document={createElementNS:(ns,tag)=>new ShapeElement(tag)};
for(const type of ['square','circle']){
 const host=new ShapeElement('div'),shape={type,width:120,height:120,strokeWidth:4};controls[type].render(host,shape);
 shape.width=800;shape.height=160;controls[type].update(host,shape);
 const svg=host.querySelector('svg');assert.equal(svg.attrs.viewBox,'0 0 800 160');assert.equal(svg.attrs.preserveAspectRatio,'none');
 const geometry=svg.firstElementChild.attrs;
 if(type==='circle'){assert.equal(geometry.rx,'400');assert.equal(geometry.ry,'80');assert.equal(geometry.cx,'400');assert.equal(geometry.cy,'80');}
 else {assert.equal(geometry.x,'0');assert.equal(geometry.y,'0');assert.equal(geometry.width,'800');assert.equal(geometry.height,'160');}
}
assert.equal(controls.triangle.hidden,true);assert.equal(controls.circle.hidden,false);
console.log('Large/asymmetric shape resizing updates SVG geometry and prevents letterboxing; Triangle is hidden from the toolbox.');
