import assert from 'node:assert/strict';
import {alphaBounds,mapBounds} from '../static/symbol-import.js';
const pixels=new Uint8ClampedArray(10*8*4);for(let y=2;y<6;y++)for(let x=3;x<8;x++)pixels[(y*10+x)*4+3]=255;
assert.deepEqual(alphaBounds(pixels,10,8),{x:3,y:2,width:5,height:4});
assert.equal(alphaBounds(new Uint8ClampedArray(16),2,2),null);
assert.deepEqual(mapBounds({x:3,y:2,width:5,height:4},10,8,{x:-20,y:10,width:100,height:80}),{x:10,y:30,width:50,height:40});
pixels.fill(0);pixels[(7*10+9)*4+3]=1;assert.deepEqual(alphaBounds(pixels,10,8),{x:9,y:7,width:1,height:1});
console.log('SVG import measures visible alpha extents, including faint strokes, and maps negative/non-square coordinates.');
