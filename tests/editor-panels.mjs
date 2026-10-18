import assert from 'node:assert/strict';
import {constrainPanelWidth,mountEditorPanels,scrollableEditorList,saveEditorListScroll} from '../static/editor-panels.js';
assert.equal(constrainPanelWidth(700,1200,320),600);assert.equal(constrainPanelWidth(500,900,320),420);assert.equal(constrainPanelWidth(10,1200,320),160);
const properties={},saved={};let observerClosed=false;
class Element{constructor(){this.dataset={};this.attrs={};this.classList={add(){},remove(){}};}setAttribute(k,v){this.attrs[k]=v;}setPointerCapture(){}append(el){(this.children??=[]).push(el);}before(el){this.wrapper=el;}}
globalThis.document={createElement:()=>new Element()};globalThis.localStorage={getItem:()=>JSON.stringify({left:270,right:350}),setItem:(k,v)=>saved[k]=JSON.parse(v)};globalThis.ResizeObserver=class{observe(){}disconnect(){observerClosed=true;}};
const layout=new Element();layout.clientWidth=1200;layout.style={setProperty:(k,v)=>properties[k]=v};
const close=mountEditorPanels(layout);assert.equal(properties['--editor-left'],'270px');assert.equal(properties['--editor-right'],'350px');
const left=layout.children[0],right=layout.children[1];
left.onpointerdown({button:0,clientX:270,pointerId:1,preventDefault(){}});left.onpointermove({clientX:320});left.onpointerup();assert.equal(properties['--editor-left'],'320px');
right.onkeydown({key:'ArrowLeft',shiftKey:false,preventDefault(){}});assert.equal(properties['--editor-right'],'360px');assert.equal(saved['hmi-designer-panel-widths'].right,360);
const list=new Element(),wrapper=scrollableEditorList(list,true);assert.equal(wrapper,list.wrapper);assert.equal(wrapper.children[0],list);assert(wrapper.className.includes('explorer-list-scroll'));
close();assert(observerClosed);
console.log('Designer sidebar drag/keyboard sizing, bounds, saved widths, cleanup, and list overflow wrappers passed.');

// Preserve each list's native vertical and wrapper horizontal scroll independently.
class ScrollElement extends Element {
 constructor(){super();this.scrollTop=0;this.scrollLeft=0;this.isConnected=true;this.listeners={};}
 append(el){super.append(el);el.parentElement=this;}
 addEventListener(event,fn){this.listeners[event]=fn;}
}
const frames=[];globalThis.requestAnimationFrame=fn=>frames.push(fn);
globalThis.document.createElement=()=>new ScrollElement();
const firstList=new ScrollElement(),firstWrapper=scrollableEditorList(firstList,false,'main:control:Actions');frames.shift()();
firstList.scrollTop=160;firstWrapper.scrollLeft=80;firstList.listeners.scroll();firstWrapper.listeners.scroll();
const replacement=new ScrollElement(),replacementWrapper=scrollableEditorList(replacement,false,'main:control:Actions');frames.shift()();
assert.equal(replacement.scrollTop,160);assert.equal(replacementWrapper.scrollLeft,80);
const eventsList=new ScrollElement();scrollableEditorList(eventsList,false,'main:control:Events');frames.shift()();assert.equal(eventsList.scrollTop,0);
replacement.scrollTop=220;replacementWrapper.scrollLeft=120;
saveEditorListScroll({querySelectorAll:()=>[replacement]});
const third=new ScrollElement(),thirdWrapper=scrollableEditorList(third,false,'main:control:Actions');frames.shift()();
assert.equal(third.scrollTop,220);assert.equal(thirdWrapper.scrollLeft,120);
console.log('Inspector list refreshes preserve scroll without mixing controls or tabs.');
