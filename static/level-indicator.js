import {shapeGeometry} from './shapes.js';
import {randomId} from './uuid.js';
export function levelGeometry(control,sample,editing=false){
 const geometry=shapeGeometry({...control,type:'square'}).attributes;
 const minimum=Number(control.minimum ?? 0),maximum=Number(control.maximum ?? 100);
 const valid=sample?.quality==='good' && ['number','boolean'].includes(typeof sample.value) && Number.isFinite(Number(sample.value));
 const fraction=editing ? 0.5 : valid && Number.isFinite(minimum) && Number.isFinite(maximum) && maximum>minimum?Math.max(0,Math.min(1,(Number(sample.value)-minimum)/(maximum-minimum))):0;
 const {x,y,width,height}=geometry;
 const fill={x,y,width,height};
 switch(control.fillDirection || 'bottom_up'){
  case 'top_down':fill.height=height*fraction;break;
  case 'left_right':fill.width=width*fraction;break;
  case 'right_left':fill.width=width*fraction;fill.x=x+width-fill.width;break;
  default:fill.height=height*fraction;fill.y=y+height-fill.height;
 }
 return {geometry,fill,fraction,valid};
}
export function levelText(control,sample,editing=false){
 if(!control.showValue)return '';
 const {fraction,valid}=levelGeometry(control,sample,editing);
 return editing || valid?Math.round(fraction*100)+'%':'—';
}
export function levelDefinition(common){
 const base=Object.fromEntries(['left','top','width','height','visible'].map(key=>[key,common[key]]));
 function update(el,c,ctx){
  const svg=el.querySelector('svg'),{geometry,fill,fraction,valid}=levelGeometry(c,ctx.bindingValue,ctx.editing);
  svg.setAttribute('preserveAspectRatio','none');
  svg.setAttribute('viewBox',`0 0 ${Math.max(1,Number(c.width)||120)} ${Math.max(1,Number(c.height)||120)}`);
  const clip=svg.children[0].firstElementChild.firstElementChild,filled=svg.children[1],outline=svg.children[2];
  for(const [key,value] of Object.entries(geometry)){clip.setAttribute(key,value);outline.setAttribute(key,value);}
  for(const [key,value] of Object.entries(fill))filled.setAttribute(key,value);
  filled.setAttribute('fill',c.backColor || '#16a34a');
  outline.setAttribute('fill','none');outline.setAttribute('stroke',c.foreColor || '#243247');
  outline.setAttribute('stroke-width',Math.min(Number(c.width)||120,Number(c.height)||120,Math.max(0,Number(c.strokeWidth)||0)));
  const text=svg.children[3];text.textContent=levelText(c,ctx.bindingValue,ctx.editing);
  text.setAttribute('x',Math.max(1,Number(c.width)||120)/2);text.setAttribute('y',Math.max(1,Number(c.height)||120)/2);
  text.setAttribute('text-anchor','middle');text.setAttribute('dominant-baseline','central');
  text.setAttribute('fill',c.foreColor || '#243247');text.setAttribute('font-size',Number(c.fontSize)||16);
  svg.setAttribute('role','img');svg.setAttribute('aria-label',ctx.editing?'Level Indicator preview':valid?`Level: ${ctx.bindingValue.value} (${Math.round(fraction*100)}%)`:'Level unavailable');
 }
 return {label:'Level Indicator',bindable:true,
  props:{valueTag:{label:'Input tag',type:'binding'},minimum:{label:'Minimum',type:'number',step:'any'},maximum:{label:'Maximum',type:'number',step:'any'},fillDirection:{label:'Fill direction',type:'select',options:[['bottom_up','Bottom to Top'],['top_down','Top to Bottom'],['left_right','Left to Right'],['right_left','Right to Left']]},showValue:{label:'Show Value',type:'checkbox'},...base,
   strokeWidth:{label:'Stroke Width',type:'number',min:0,step:'any'},edgeDiameter:{label:'Edge Diameter',type:'number',min:0,step:'any'},backColor:common.backColor,foreColor:common.foreColor},
  defaults:{width:100,height:200,minimum:0,maximum:100,fillDirection:'bottom_up',showValue:false,strokeWidth:2,edgeDiameter:0,backColor:'#16a34a',foreColor:'#243247'},
  render(el,c,ctx){
   const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('shape-svg');
   const defs=document.createElementNS(ns,'defs'),clip=document.createElementNS(ns,'clipPath'),shape=document.createElementNS(ns,'rect');
   const id='level-'+randomId();clip.id=id;clip.setAttribute('clipPathUnits','userSpaceOnUse');clip.append(shape);defs.append(clip);svg.append(defs);
   const fill=document.createElementNS(ns,'rect');fill.setAttribute('clip-path','url(#'+id+')');svg.append(fill);svg.append(document.createElementNS(ns,'rect'));svg.append(document.createElementNS(ns,'text'));el.append(svg);update(el,c,ctx);
  },update
 };
}
