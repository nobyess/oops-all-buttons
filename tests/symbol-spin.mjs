import assert from 'node:assert/strict';
import {spinSymbol} from '../static/symbol.js';
let creations=0;
const el={style:{},animate(frames,options){
 creations++;assert.equal(options.duration,60000);assert.equal(options.iterations,Infinity);
 assert.equal(frames[1].transform,'rotate(360deg)');
 return {currentTime:12500,play(){this.running=true;},pause(){this.running=false;},cancel(){this.cancelled=true;}};
}};
spinSymbol(el,undefined);assert.equal(creations,0);
spinSymbol(el,30);const animation=el.symbolSpin;
assert.equal(el.style.transformOrigin,'50% 50%');assert.equal(animation.playbackRate,30);
spinSymbol(el,0);assert.equal(animation.running,false);assert.equal(animation.currentTime,12500);
spinSymbol(el,60);assert.equal(animation.running,true);assert.equal(animation.currentTime,12500);assert.equal(creations,1);
spinSymbol(el,100);assert.equal(animation.playbackRate,60);
spinSymbol(el,undefined);assert.equal(animation.running,false);
spinSymbol(el,10,true);assert.equal(animation.cancelled,true);assert.equal(el.symbolSpin,null);
console.log('Symbol spin: phase retained, speed bounded, no duplicate animation, designer static.');
