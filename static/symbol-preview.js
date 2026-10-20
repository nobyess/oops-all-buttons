import {buildSymbol,styleSymbol} from './symbol.js';
// Library files are sanitized on import. Rebuild only inert SVG geometry here
// so a changed catalog asset can never inject scripts or external resources.
const tags=new Set(['svg','g','path','rect','circle','ellipse','polygon','polyline','line','defs','clipPath','mask','symbol','use','text','tspan']);
const drawable=new Set(['path','rect','circle','ellipse','polygon','polyline','line','use','text','tspan']);
const attributes=new Set('id viewBox preserveAspectRatio x y x1 y1 x2 y2 dx dy width height rx ry cx cy r d points transform opacity fill-opacity stroke-opacity fill-rule clip-rule stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset clipPathUnits maskUnits maskContentUnits text-anchor dominant-baseline font-size font-family font-weight font-style display visibility'.split(' '));
export function previewTree(root){
 let count=0;
 function clean(node,inherited={},depth=0){
  if(!tags.has(node.localName) || node.namespaceURI!=='http://www.w3.org/2000/svg')return null;
  if(++count>5000 || depth>32)throw new Error('Symbol preview is too complex');
  const attrs={};
  for(const attr of node.attributes){
   if(attributes.has(attr.name) && !/url\s*\(|[<>]/i.test(attr.value))attrs[attr.name]=attr.value;
   if(['href','clip-path','mask'].includes(attr.name) && (attr.name==='href'?/^#[A-Za-z_][\w:.-]*$/:/^url\(#[A-Za-z_][\w:.-]*\)$/).test(attr.value))attrs[attr.name]=attr.value;
  }
  const fill=node.getAttribute('fill')??inherited.fill??'black';
  const stroke=node.getAttribute('stroke')??inherited.stroke??'none';
  const paint=drawable.has(node.localName)?{fill:fill.toLowerCase()!=='none',stroke:stroke.toLowerCase()!=='none',...(node.getAttribute('data-symbol-fill-color')==='fore'?{fillColor:'fore'}:{})}:null;
  return {tag:node.localName,attributes:attrs,paint,text:['text','tspan'].includes(node.localName)?[...node.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(''):'',children:[...node.children].map(n=>clean(n,{fill,stroke},depth+1)).filter(Boolean)};
 }
 const tree=clean(root);
 if(tree?.tag!=='svg')throw new Error('Invalid symbol preview');
 return tree;
}
const previews=new Map();
export async function loadSymbolPreview(url){
 if(!/^(?:\/symbols\/assets\/[A-Za-z0-9_-]+|\/assets\/files\/[a-f0-9]{64})\.svg$/.test(url))throw new Error('Invalid symbol preview path');
 if(!previews.has(url))previews.set(url,fetch(url).then(async response=>{
  if(!response.ok)throw new Error('Could not load symbol preview');
  const text=await response.text();if(text.length>5*1024*1024)throw new Error('Symbol preview is too large');
  const doc=new DOMParser().parseFromString(text,'image/svg+xml');
  if(doc.querySelector('parsererror'))throw new Error('Invalid symbol preview');
  return previewTree(doc.documentElement);
 }).catch(error=>{previews.delete(url);throw error;}));
 const svg=buildSymbol(await previews.get(url));
 styleSymbol(svg,{foreColor:'var(--ui-text)',backColor:'var(--ui-panel)',strokeWidth:2,fit:'contain'});
 return svg;
}
