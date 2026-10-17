const fitted=new WeakSet();
export function geometryViewBox(box){
 const {x,y,width,height}=box;
 if(![x,y,width,height].every(Number.isFinite) || width<0 || height<0 || width===0 && height===0)return null;
 // A straight line needs a nonzero viewport, centered on its zero-size axis.
 return [x-(width===0?.5:0),y-(height===0?.5:0),width || 1,height || 1];
}
export function freezeSymbolLengths(svg){
 for(const el of svg.querySelectorAll('*'))for(const key of ['x','y','width','height','cx','cy','r','rx','ry','x1','x2','y1','y2']){
  if(el.getAttribute(key)?.includes('%') && Number.isFinite(el[key]?.baseVal?.value))el.setAttribute(key,String(el[key].baseVal.value));
 }
}
export function fitSymbolGeometry(svg){
 if(fitted.has(svg))return false;
 // Clipped/masked artwork keeps its painted import bounds.
 if(svg.querySelector('[clip-path],[mask]')){fitted.add(svg);return false;}
 if(!svg.getClientRects().length)return false;
 freezeSymbolLengths(svg);
 try{
  const bounds=geometryViewBox(svg.getBBox());
  if(!bounds)return false;
  svg.setAttribute('viewBox',bounds.join(' '));fitted.add(svg);return true;
 }catch{return false;}
}
