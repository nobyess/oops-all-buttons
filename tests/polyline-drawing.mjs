import assert from 'node:assert/strict';
import {completePolyline,mountPolylineDrawing,polylinePagePoints,reshapePolyline,movePolyline} from '../static/polyline-drawing.js';
import {shapeGeometry} from '../static/shapes.js';
const geometry=completePolyline([[20,40],[100,80],[60,120]]);
assert.deepEqual({left:geometry.left,top:geometry.top,width:geometry.width,height:geometry.height},{left:19,top:39,width:82,height:82});
assert.equal(shapeGeometry({type:'polyline',strokeWidth:2,...geometry}).attributes.points,'1,1 81,41 41,81');
const horizontal=completePolyline([[20,40],[100,40]]);assert(horizontal.height>2);assert(horizontal.points.flat().every(Number.isFinite));
assert.throws(()=>completePolyline([[1,1]]));
class Element{constructor(){this.children=[];this.classList={add(){}};}append(el){this.children.push(el);}replaceChildren(){this.children=[];}setAttribute(key,value){(this.attrs??={})[key]=String(value);}getBoundingClientRect(){return {left:10,top:20};}}
globalThis.document={createElementNS:()=>new Element()};
const canvas=new Element(),panel=new Element(),draft={points:[]};let result,cancelled=false;
const node=(tag,text,parent,attrs={})=>{const el=Object.assign(new Element(),{textContent:text},attrs);parent.append(el);return el;};
const button=(text,parent,fn)=>{const el=node('button',text,parent);el.onclick=fn;return el;};
mountPolylineDrawing({canvas,panel,page:{width:200,height:200},zoom:()=>.5,grid:20,draft,node,button,onComplete:g=>result=g,onCancel:()=>cancelled=true});
const overlay=canvas.children[0],click=(x,y)=>overlay.onclick({button:0,clientX:10+x*.5,clientY:20+y*.5,preventDefault(){},stopPropagation(){}});
click(20,40);click(100,80);click(60,120);assert.equal(draft.points.length,3);
overlay.oncontextmenu({preventDefault(){},stopPropagation(){}});assert.deepEqual(draft.points,[[20,40],[100,80]]);
panel.children.find(el=>el.textContent==='Complete').onclick();assert.deepEqual(result,completePolyline(draft.points));assert(!cancelled);
console.log('Click-to-draw polyline, zoom/grid coordinates, right-click removal, completion bounds, and horizontal lines passed.');

// The pointer preview does not add saved points, and closing uses a screen-space hit radius.
overlay.onpointermove({clientX:70,clientY:80});
const preview=overlay.children.at(-1);assert.equal(preview.attrs.visibility,'visible');assert.equal(draft.points.length,2);
overlay.onpointerleave();assert.equal(preview.attrs.visibility,'hidden');
click(60,120);assert.equal(draft.points.length,3);
overlay.onpointermove({clientX:21,clientY:40});assert.equal(overlay.children.at(-1).attrs.points,'60,120 20,40');
click(22,40);assert.deepEqual(result.points[0],result.points.at(-1));assert.equal(result.points.length,4);assert.equal(draft.points.length,3);
console.log('Mouse preview follows the pointer without adding points, hides on exit, and clicking the first point closes and completes the line.');

const edited={type:'polyline',strokeWidth:2,...completePolyline([[100,100],[200,200],[150,250]])};
const absolute=polylinePagePoints(edited);assert.deepEqual(absolute,[[100,100],[200,200],[150,250]]);
absolute[1]=[400,40];reshapePolyline(edited,absolute);
assert.deepEqual(polylinePagePoints(edited),[[100,100],[400,40],[150,250]]);
assert.equal(edited.left,99);assert.equal(edited.top,39);assert.equal(edited.width,302);assert.equal(edited.height,212);
absolute[1]=[120,150];reshapePolyline(edited,absolute);assert.equal(edited.width,52);assert.deepEqual(polylinePagePoints(edited),absolute);
edited.left+=20;edited.top+=30;assert.deepEqual(polylinePagePoints(edited),absolute.map(([x,y])=>[x+20,y+30]));
console.log('Point editing grows and shrinks the bounds without moving other points; whole-line translation remains intact.');

const continuation={points:[[40,40],[100,80]],minimumPoints:2,strokeWidth:6};
const canvas2=new Element(),panel2=new Element();let continuationResult;
mountPolylineDrawing({canvas:canvas2,panel:panel2,page:{width:200,height:200},zoom:()=>1,grid:0,draft:continuation,node,button,onComplete:g=>continuationResult=g,onCancel:()=>{}});
const overlay2=canvas2.children[0];overlay2.oncontextmenu({preventDefault(){},stopPropagation(){}});assert.equal(continuation.points.length,2);
overlay2.onclick({button:0,clientX:160,clientY:140,preventDefault(){},stopPropagation(){}});assert.equal(continuation.points.length,3);
overlay2.oncontextmenu({preventDefault(){},stopPropagation(){}});assert.equal(continuation.points.length,2);
panel2.children.find(el=>el.textContent==='Complete').onclick();assert.equal(continuationResult.left,37);assert.equal(continuationResult.width,66);
console.log('Continuation preserves existing points on right-click and retains stroke width when calculating bounds.');

for(const strokeWidth of [1,2,5,10]){
 const line={type:'polyline',strokeWidth,...completePolyline([[40,60],[120,140],[200,80]],strokeWidth)};
 const original=polylinePagePoints(line),position=movePolyline(line,23,38,{width:400,height:400},20);
 Object.assign(line,position);
 const moved=polylinePagePoints(line);assert.deepEqual(moved,original.map(([x,y])=>[x+20,y+40]));assert(moved.flat().every(value=>Math.abs(value/20-Math.round(value/20))<1e-9));
 const edge=movePolyline(line,1000,-1000,{width:400,height:400},20);assert(Math.abs((edge.left-line.left)%20)<1e-9);assert(Math.abs((edge.top-line.top)%20)<1e-9);assert(edge.left+line.width<=400);assert(edge.top>=0);
 assert.deepEqual(movePolyline(line,0,0,{width:400,height:400},20),{left:line.left,top:line.top});
}
assert.deepEqual(movePolyline({left:39,top:59,width:162,height:82},3.5,4.5,{width:400,height:400},0),{left:42.5,top:63.5});
console.log('Polyline movement snaps translation rather than stroke-padded bounds, preserving grid points and shape at page edges.');

for(const coordinates of [[[40,60],[120,140],[200,80]],[[0,0],[100,0],[0,100],[0,0]]]){
 const line={strokeWidth:2,...completePolyline(coordinates,2)};
 for(const width of [12,1,0,30,2]){
  const before=polylinePagePoints(line);line.strokeWidth=width;reshapePolyline(line,before);
  polylinePagePoints(line).forEach((point,index)=>point.forEach((value,axis)=>assert(Math.abs(value-coordinates[index][axis])<1e-9)));
 }
}
console.log('Stroke changes preserve all page-space vertices, including zero stroke and closed lines at the page origin.');
