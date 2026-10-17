import {freezeSymbolLengths,fitSymbolGeometry} from './symbol-geometry.js';
import {buildSymbol,styleSymbol} from './symbol.js';
import {imageFileData} from './clipboard-image.js';

// Inspect a bounded raster only at import. The saved artwork remains SVG.
export function alphaBounds(pixels,width,height){
 let left=width,top=height,right=-1,bottom=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]){
  left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
 }
 return right<left?null:{x:left,y:top,width:right-left+1,height:bottom-top+1};
}
export function mapBounds(pixels,width,height,area){
 return {x:area.x+pixels.x/width*area.width,y:area.y+pixels.y/height*area.height,
  width:pixels.width/width*area.width,height:pixels.height/height*area.height};
}
export async function trimSymbolData(tree,control={}){
 const host=document.createElement('div');
 Object.assign(host.style,{position:'fixed',left:'-10000px',top:'0',width:'1024px',height:'1024px',opacity:'0',pointerEvents:'none'});
 const svg=buildSymbol(tree);host.append(svg);document.body.append(host);
 let url;
 try{
  styleSymbol(svg,{...control,fit:'contain',backColor:'#000000',foreColor:'#000000',strokeWidth:control.strokeWidth ?? 2});
  freezeSymbolLengths(svg);
  if(document.fonts?.ready)await document.fonts.ready;
  if(fitSymbolGeometry(svg)){
   const [, ,width,height]=svg.getAttribute('viewBox').split(/\s+/).map(Number);
   svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));
   svg.removeAttribute('class');svg.removeAttribute('style');
   return imageFileData(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
  }
  const box=svg.getBBox();
  if(![box.x,box.y,box.width,box.height].every(Number.isFinite))throw Error('Could not measure SVG artwork');
  let stroke=0;
  const rootMatrix=svg.getScreenCTM()?.inverse();
  for(const el of svg.querySelectorAll('[data-symbol-stroke="true"]')){
   const elementMatrix=el.getScreenCTM?.();
   const matrix=rootMatrix && elementMatrix?rootMatrix.multiply(elementMatrix):null;
   const scale=matrix?Math.max(Math.hypot(matrix.a,matrix.b),Math.hypot(matrix.c,matrix.d)):1;
   const style=getComputedStyle(el),width=parseFloat(style.strokeWidth)||0,miter=parseFloat(style.strokeMiterlimit)||4;
   stroke=Math.max(stroke,width*scale*Math.max(1,miter));
  }
  const pad=Math.max(box.width,box.height)*.05+Math.max(1,stroke);
  const area={x:box.x-pad,y:box.y-pad,width:box.width+2*pad,height:box.height+2*pad};
  if(![area.x,area.y,area.width,area.height].every(Number.isFinite) || area.width<=0 || area.height<=0)throw Error('Could not measure SVG artwork');
  const factor=1536/Math.max(area.width,area.height),width=Math.max(1,Math.ceil(area.width*factor)),height=Math.max(1,Math.ceil(area.height*factor));
  svg.setAttribute('viewBox',`${area.x} ${area.y} ${area.width} ${area.height}`);
  svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));svg.setAttribute('preserveAspectRatio','none');
  svg.removeAttribute('class');svg.removeAttribute('style');
  const serialize=()=>new XMLSerializer().serializeToString(svg);
  url=URL.createObjectURL(new Blob([serialize()],{type:'image/svg+xml'}));
  const image=new Image();image.src=url;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,width,height);
  const pixels=alphaBounds(context.getImageData(0,0,width,height).data,width,height);
  if(!pixels)throw Error('SVG contains no visible artwork to fit');
  const bounds=mapBounds(pixels,width,height,area);
  svg.setAttribute('viewBox',`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
  svg.setAttribute('width',String(bounds.width));svg.setAttribute('height',String(bounds.height));svg.setAttribute('preserveAspectRatio','xMidYMid meet');
  return imageFileData(new Blob([serialize()],{type:'image/svg+xml'}));
 }finally{if(url)URL.revokeObjectURL(url);host.remove();}
}
