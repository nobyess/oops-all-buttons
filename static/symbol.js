import {positionArtwork} from './artwork-rotation.js';
import {fitSymbolGeometry} from './symbol-geometry.js';
import {randomId} from './uuid.js';
const cache=new Map();
function load(url){
 if(!/^\/api\/images\/[a-f0-9]{64}(?:\?v=\d+)?$/.test(url))return Promise.reject(new Error('Choose an uploaded SVG symbol'));
 if(!cache.has(url))cache.set(url,fetch(url.replace('/images/','/symbols/')).then(async response=>{const tree=await response.json();if(!response.ok)throw new Error(tree.error || 'Could not load symbol');return tree;}).catch(error=>{cache.delete(url);throw error;}));
 return cache.get(url);
}
export function buildSymbol(tree){
 const ns='http://www.w3.org/2000/svg',prefix='symbol-'+randomId()+'-';
 function build(item){
  const element=document.createElementNS(ns,item.tag);
  for(const [key,raw] of Object.entries(item.attributes || {})){
   let value=String(raw);
   if(key==='id')value=prefix+value;
   if(key==='href' && value.startsWith('#'))value='#'+prefix+value.slice(1);
   value=value.replace(/url\(\s*#([^)]*)\s*\)/g,(_,id)=>'url(#'+prefix+id.trim()+')');
   element.setAttribute(key,value);
  }
  if(item.paint){element.dataset.symbolFill=String(item.paint.fill);if(item.paint.fillColor==='fore')element.dataset.symbolFillColor='fore';element.dataset.symbolStroke=String(item.paint.stroke);if(item.paint.stroke)element.setAttribute('vector-effect','non-scaling-stroke');}
  if(item.text)element.textContent=item.text;
  for(const child of item.children || [])element.append(build(child));
  return element;
 }
 const svg=build(tree);svg.classList.add('symbol-svg');return svg;
}
const styles=new WeakMap();
// One compositor animation per live symbol. Pausing preserves the exact phase.
export function spinSymbol(el,rpm,editing=false){
 const speed=editing?0:Math.min(60,Math.max(0,Number(rpm)||0));
 if(!el.symbolSpin && speed){
  el.style.transformOrigin='50% 50%';
  el.symbolSpin=el.animate([{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:60000,iterations:Infinity});
 }
 if(el.symbolSpin){
  if(editing){el.symbolSpin.cancel();el.symbolSpin=null;return;}
  if(speed){el.symbolSpin.playbackRate=speed;el.symbolSpin.play();}else el.symbolSpin.pause();
 }
}
export function styleSymbol(svg,c){
 const next={fit:c.fit==='fill'?'none':c.fit==='cover'?'xMidYMid slice':'xMidYMid meet',label:c.alt || c.imageName || 'Symbol',fill:c.backColor || '#ffffff',stroke:c.foreColor || '#243247',width:Math.max(0,Number(c.strokeWidth)||0)};
 const previous=styles.get(svg);
 if(previous && Object.keys(next).every(key=>next[key]===previous[key]))return;
 if(!previous){svg.setAttribute('role','img');}
 if(!previous || next.fit!==previous.fit)svg.setAttribute('preserveAspectRatio',next.fit);
 if(!previous || next.label!==previous.label)svg.setAttribute('aria-label',next.label);
 if(!previous || next.fill!==previous.fill || next.stroke!==previous.stroke || next.width!==previous.width){
  for(const element of svg.querySelectorAll('[data-symbol-fill]')){
   if(!previous || next.fill!==previous.fill || next.stroke!==previous.stroke)element.setAttribute('fill',element.dataset.symbolFill==='true'?(element.dataset.symbolFillColor==='fore'?next.stroke:next.fill):'none');
   if(!previous || next.stroke!==previous.stroke)element.setAttribute('stroke',element.dataset.symbolStroke==='true'?next.stroke:'none');
   if(element.dataset.symbolStroke==='true' && (!previous || next.width!==previous.width))element.setAttribute('stroke-width',next.width);
  }
 }
 styles.set(svg,next);
}
export function symbolDefinition(common){
 function update(el,c,ctx){
  el.symbolControl=c;el.style.position='relative';
  spinSymbol(el,c.spinRpm,ctx.editing);
  if(el.dataset.symbolImage!==c.image){
   el.dataset.symbolImage=c.image || '';el.replaceChildren();
   if(!c.image){el.textContent=ctx.editing?'Choose SVG or DXF symbol':'';return;}
   el.textContent=ctx.editing?'Loading symbol…':'';
   const url=c.image;
   load(url).then(tree=>{
    if(el.dataset.symbolImage!==url || !el.isConnected)return;
    const svg=buildSymbol(tree);el.replaceChildren(svg);styleSymbol(svg,el.symbolControl);fitSymbolGeometry(svg);positionArtwork(svg,el.symbolControl);
   }).catch(error=>{if(el.dataset.symbolImage===url && el.isConnected){el.textContent=ctx.editing?'Symbol unavailable':'';el.title=error.message;}});
  }
  const svg=el.querySelector('svg');if(svg){styleSymbol(svg,c);fitSymbolGeometry(svg);positionArtwork(svg,c);}
 }
 return {label:'Symbol',props:{image:{label:'SVG / DXF symbol',type:'symbol'},fit:{label:'Fit',type:'select',options:[['contain','Fit (keep proportions)'],['cover','Fill (crop)'],['fill','Stretch']]},alt:{label:'Description',type:'text'},
  ...Object.fromEntries(['left','top','width','height','visible'].map(key=>[key,common[key]])),strokeWidth:{label:'Stroke Width',type:'number',min:0,step:'any'},backColor:common.backColor,foreColor:common.foreColor},
  defaults:{width:160,height:160,image:'',imageName:'',alt:'',fit:'contain',strokeWidth:2,backColor:'#ffffff',foreColor:'#243247'},render:update,update};
}
