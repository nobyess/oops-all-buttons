import assert from 'node:assert/strict';
import {quarterRotation,rotateArtwork,positionArtwork} from '../static/artwork-rotation.js';
import {rotatePolyline,closedPolyline,polylineSelection} from '../static/shapes.js';
import {polylinePagePoints} from '../static/polyline-drawing.js';
const c={left:20,top:30,width:200,height:100,image:'unchanged'};
const child={style:{}};
for(const angle of [90,180,270,0]){
 rotateArtwork(c);assert.equal(c.artworkRotation,angle);positionArtwork(child,c);
 assert.equal(child.style.width,(angle%180?100:200)+'px');
 assert.equal(child.style.height,(angle%180?200:100)+'px');
 assert.equal(child.style.transform,`translate(-50%, -50%) rotate(${angle}deg)`);
 assert.deepEqual([c.left,c.top,c.width,c.height,c.image],[20,30,200,100,'unchanged']);
}
assert.equal(quarterRotation(-90),270);
assert.equal(JSON.parse(JSON.stringify({...c,artworkRotation:90})).artworkRotation,90);
const line={id:'line',type:'polyline',left:20,top:30,width:202,height:102,strokeWidth:2,points:[[0,0],[1,0],[1,1],[0,0]],fillWhenClosed:true};
const original=polylinePagePoints(line),cx=121,cy=81;
polylineSelection.set('line',1);rotatePolyline(line);
assert.equal(line.width,102);assert.equal(line.height,202);assert(closedPolyline(line));assert.equal(polylineSelection.get('line'),1);
for(const [index,[x,y]] of polylinePagePoints(line).entries()){
 assert(Math.abs(x-(cx-(original[index][1]-cy)))<1e-9);
 assert(Math.abs(y-(cy+(original[index][0]-cx)))<1e-9);
}
for(let n=0;n<3;n++)rotatePolyline(line);
for(const [index,point] of polylinePagePoints(line).entries())for(let axis=0;axis<2;axis++)assert(Math.abs(point[axis]-original[index][axis])<1e-8);
console.log('Quarter turns preserve artwork boundaries, swap fit axes, and rotate editable polyline points without distortion.');
