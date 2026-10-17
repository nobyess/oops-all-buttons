import assert from 'node:assert/strict';
import {constrainPanelWidth,mountEditorPanels,scrollableEditorList} from '../static/editor-panels.js';
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
