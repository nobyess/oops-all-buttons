import assert from 'node:assert/strict';
import {previewTree,loadSymbolPreview} from '../static/symbol-preview.js';
const node=(tag,attrs={},children=[])=>({localName:tag,namespaceURI:'http://www.w3.org/2000/svg',attributes:Object.entries(attrs).map(([name,value])=>({name,value})),getAttribute:name=>attrs[name]??null,children,childNodes:[]});
const xml=node('svg',{viewBox:'0 0 10 10'},[
 node('path',{d:'M0 0L10 10',fill:'none',stroke:'black',onclick:'bad()'}),
 node('path',{d:'M0 0L10 0L0 10Z',fill:'black','data-symbol-fill-color':'fore'}),
 node('path',{fill:'black'}),node('script'),node('image',{href:'https://example.com'}),
 node('use',{href:'https://example.com','clip-path':'url(https://example.com)'}),
]);
const tree=previewTree(xml);assert.equal(tree.children.length,4);
assert.equal(tree.children[0].attributes.onclick,undefined);assert.equal(tree.children[3].attributes.href,undefined);
assert.equal(tree.children[3].attributes['clip-path'],undefined);
assert.equal(tree.children[1].paint.fillColor,'fore');
class Element{
 constructor(){this.dataset={};this.attributes={};this.children=[];this.classList={add(){}};}
 setAttribute(k,v){this.attributes[k]=v;}append(c){this.children.push(c);}
 querySelectorAll(){return this.children.flatMap(c=>[...(c.dataset.symbolFill!==undefined?[c]:[]),...c.querySelectorAll()]);}
}
globalThis.document={createElementNS:()=>new Element()};
globalThis.DOMParser=class{parseFromString(){return {documentElement:xml,querySelector:()=>null};}};
let fetches=0;globalThis.fetch=async()=>{fetches++;return {ok:true,text:async()=>'<svg/>'};};
const a=await loadSymbolPreview('/symbols/assets/test.svg'),b=await loadSymbolPreview('/symbols/assets/test.svg');
assert.notEqual(a,b);assert.equal(fetches,1);
assert.equal(a.children[0].attributes.stroke,'var(--ui-text)');
assert.equal(a.children[0].attributes.fill,'none');
assert.equal(a.children[1].attributes.fill,'var(--ui-text)');
assert.equal(a.children[2].attributes.fill,'var(--ui-panel)');
await assert.rejects(loadSymbolPreview('https://example.com/test.svg'));
console.log('Theme-aware cached previews preserve paint roles and rebuild only inert local SVG geometry.');
