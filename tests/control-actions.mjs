import assert from 'node:assert/strict';
import {bindControlActions} from '../static/control-actions.js';
const calls=[],captured=[],el={setPointerCapture:id=>captured.push(id)};
const bind=()=>bindControlActions(el,{enabled:true,execute:(trigger,point)=>calls.push({trigger,point})});
const event=(type,pointerId=1,pointerType='touch')=>({type,pointerId,pointerType,button:0,isPrimary:true,clientX:10,clientY:20,detail:1});
for(const pointerType of ['mouse','touch','pen']){
 calls.length=0;bind();el.onpointerdown(event('pointerdown',1,pointerType));
 bind(); // A live repaint between press and release must preserve the gesture.
 el.onpointerup(event('pointerup',1,pointerType));el.onlostpointercapture(event('lostpointercapture'));el.onclick(event('click'));
 assert.deepEqual(calls.map(c=>c.trigger),['mouse_down','mouse_up','click']);
}
for(const cancellation of ['pointercancel','lostpointercapture']){
 calls.length=0;bind();el.onpointerdown(event('pointerdown'));el['on'+cancellation](event(cancellation));el.onpointerup(event('pointerup'));
 assert.deepEqual(calls.map(c=>c.trigger),['mouse_down','mouse_up']);
}
calls.length=0;bind();el.onpointerdown({...event('pointerdown'),button:2});el.onpointerdown({...event('pointerdown'),isPrimary:false});el.onpointerup(event('pointerup'));assert.equal(calls.length,0);
el.onclick({...event('click'),detail:0});assert.equal(calls.at(-1).point,null);
calls.length=0;el.onpointerdown(event('pointerdown'));el.onpointerdown(event('pointerdown',2));el.onpointerup(event('pointerup',2));assert.equal(calls.length,1);el.onpointerup(event('pointerup'));assert.equal(calls.length,2);
bindControlActions(el,{enabled:false,execute(){throw Error('Disabled');}});assert.equal(el.onpointerdown,null);assert.equal(el.onclick,null);assert.equal(el.onmousedown,null);
assert(captured.length>0);
console.log('Mouse/touch/pen press and release, capture, repaint continuity, cancellation, keyboard clicks, and secondary-pointer exclusion passed.');

const designer={onpointerdown:()=>{}};const drag=designer.onpointerdown;bindControlActions(designer,{enabled:false,execute(){}});assert.equal(designer.onpointerdown,drag);
