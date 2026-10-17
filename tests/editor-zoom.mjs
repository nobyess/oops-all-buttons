import assert from 'node:assert/strict';
import {editorView} from '../static/editor-view.js';
const listeners={},surface={scrollLeft:100,scrollTop:50,clientWidth:600,clientHeight:400,addEventListener:(name,fn,options)=>{listeners[name]=fn;if(name==='wheel')assert.equal(options.passive,false);},getBoundingClientRect:()=>({left:0,top:0})};
globalThis.document={createElement:()=>({style:{},append(){}})};
const canvas={style:{setProperty(key,value){this[key]=value;}},before(){},getBoundingClientRect:()=>({left:20-surface.scrollLeft,top:20-surface.scrollTop})};
let displayed;
const view=editorView(surface,canvas,{id:'zoom-test',width:1000,height:800},zoom=>displayed=zoom);
const wheel=deltaY=>{const e={deltaY,clientX:200,clientY:150,preventDefault(){this.prevented=true;}};listeners.wheel(e);return e;};
// Cursor is over logical (180,130) before scaling.
assert(wheel(-100).prevented);assert.equal(view.state.zoom,1.25);assert.equal(canvas.style['--grid-stroke'],'1.6px');assert.equal(displayed,1.25);
let rect=canvas.getBoundingClientRect();assert.equal(rect.left+180*view.state.zoom,200);assert.equal(rect.top+130*view.state.zoom,150);
wheel(100);assert.equal(view.state.zoom,1);
for(let i=0;i<20;i++)wheel(-100);assert.equal(view.state.zoom,3);
for(let i=0;i<20;i++)wheel(100);assert.equal(view.state.zoom,0.25);
assert.equal(wheel(0).prevented,undefined);
assert.equal(view.state.left,surface.scrollLeft);assert.equal(view.state.top,surface.scrollTop);
console.log('Wheel zoom direction, cursor anchor, limits, toolbar updates, and view state passed.');
