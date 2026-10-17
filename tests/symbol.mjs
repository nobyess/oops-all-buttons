import assert from 'node:assert/strict';
import {buildSymbol,styleSymbol} from '../static/symbol.js';
import {controls} from '../static/controls.js';
class Element{constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.classList={add(){}};}setAttribute(key,value){this.writes=(this.writes || 0)+1;this.attrs[key]=String(value);}append(child){this.children.push(child);}querySelectorAll(){return this.children.flatMap(child=>[...(Object.hasOwn(child.dataset,'symbolFill')?[child]:[]),...child.querySelectorAll()]);}}
globalThis.document={createElementNS:(ns,tag)=>new Element(tag)};
const tree={tag:'svg',attributes:{viewBox:'0 0 100 100'},children:[{tag:'defs',children:[{tag:'clipPath',attributes:{id:'clip'},children:[]}]},{tag:'path',attributes:{'clip-path':'url(#clip)'},paint:{fill:false,stroke:true}},{tag:'rect',paint:{fill:true,stroke:false}}]};
const first=buildSymbol(tree),second=buildSymbol(tree);assert.notEqual(first.children[0].children[0].attrs.id,second.children[0].children[0].attrs.id);
styleSymbol(first,{backColor:'#ff000080',foreColor:'#112233',strokeWidth:4,fit:'fill'});
assert.equal(first.children[1].attrs.fill,'none');assert.equal(first.children[1].attrs.stroke,'#112233');assert.equal(first.children[1].attrs['stroke-width'],'4');assert.equal(first.children[2].attrs.fill,'#ff000080');assert.equal(first.children[2].attrs.stroke,'none');
styleSymbol(first,{backColor:'#00ff00',foreColor:'#ffffff',strokeWidth:1,fit:'contain'});assert.equal(first.children[1].attrs.stroke,'#ffffff');assert.equal(first.children[1].attrs['stroke-width'],'1');assert.equal(first.children[2].attrs.fill,'#00ff00');
assert.equal(controls.symbol.props.image.type,'symbol');assert(controls.symbol.props.foreColor);assert(!controls.symbol.props.text);
console.log('Symbol fills, strokes, width, transparent paint, local ID isolation, sizing, and event style updates passed.');

const {evaluateControlEvents}=await import('../static/visual-events.js');
const appearance=evaluateControlEvents({type:'symbol',events:[{id:'e',tag:'tag',operator:'>',operand:{kind:'value',value:0},action:'set_colors',backColor:'#ffffff',foreColor:'#000000',strokeWidth:5}]},{tag:{quality:'good',value:1}});
assert.equal(appearance.strokeWidth,5);assert.equal(appearance.backColor,'#ffffff');
assert.deepEqual(evaluateControlEvents({type:'symbol',events:[{id:'e',tag:'tag',operator:'>',operand:{kind:'value',value:0},action:'set_colors',backColor:'#ffffff',foreColor:'#000000',strokeWidth:5}]},{tag:{quality:'good',value:0}}),{});

const settings={backColor:'#00ff00',foreColor:'#ffffff',strokeWidth:1,fit:'contain'};
const mutations=()=>[first,...first.querySelectorAll()].reduce((sum,el)=>sum+(el.writes || 0),0);
const before=mutations();styleSymbol(first,settings);assert.equal(mutations(),before,'Unchanged styles must not mutate the SVG');
styleSymbol(first,{...settings,strokeWidth:2});assert.equal(mutations(),before+1,'A width change only updates visible strokes');
styleSymbol(second,settings);assert.equal(second.children[1].attrs['stroke-width'],'1','Each SVG maintains independent style state');

assert.equal(first.children[1].attrs['vector-effect'],'non-scaling-stroke');assert.equal(second.children[1].attrs['vector-effect'],'non-scaling-stroke');
