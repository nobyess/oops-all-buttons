import {polylinePagePoints,reshapePolyline} from './polyline-drawing.js';
// Points are normalized to the bounding box, so resizing scales the entire line.
export const polylineEditing=new Map();
export const polylineSelection=new Map();
export const editingPolyline=control=>control.type==='polyline' && polylineEditing.get(control.id)!==false;
export function linePoints(control) {
  return Array.isArray(control.points) && control.points.length>=2?control.points:[[0,0.8],[0.5,0.2],[1,0.8]];
}
export function closedPolyline(control){
 const points=linePoints(control),first=points[0],last=points.at(-1);
 return points.length>=4 && Math.abs(first[0]-last[0])<1e-9 && Math.abs(first[1]-last[1])<1e-9;
}
export function shapeFill(control){return control.type==='polyline' && !(control.fillWhenClosed && closedPolyline(control))?'none':(control.backColor || '#ffffff');}
export function addLinePoint(control) {
  const points=linePoints(control).map(point=>[...point]);
  let segment=0,longest=-1;
  for(let i=0;i<points.length-1;i++) {
    const distance=Math.hypot((points[i+1][0]-points[i][0])*control.width,(points[i+1][1]-points[i][1])*control.height);
    if(distance>longest){longest=distance;segment=i;}
  }
  points.splice(segment+1,0,points[segment].map((value,axis)=>(value+points[segment+1][axis])/2));
  control.points=points;polylineSelection.set(control.id,segment+1);polylineEditing.set(control.id,true);
}
export function selectedLinePoint(control){
 const last=linePoints(control).length-1,index=Math.max(0,Math.min(last,polylineSelection.get(control.id) ?? last));
 return closedPolyline(control) && index===last?0:index;
}
export function canInsertLinePoint(control,before){
 if(!editingPolyline(control) || linePoints(control).length>=1000)return false;
 const index=selectedLinePoint(control);
 return closedPolyline(control) || (before?index>0:index<linePoints(control).length-1);
}
export function insertLinePoint(control,before){
 if(!canInsertLinePoint(control,before))return;
 const points=linePoints(control).map(point=>[...point]),index=selectedLinePoint(control);
 const insertion=before?(index===0?points.length-1:index):index+1;
 points.splice(insertion,0,points[insertion-1].map((value,axis)=>(value+points[insertion][axis])/2));
 control.points=points;polylineSelection.set(control.id,insertion);
}
export function openPolyline(control){
 if(!closedPolyline(control))return;
 control.points=linePoints(control).slice(0,-1).map(point=>[...point]);
 reshapePolyline(control,polylinePagePoints(control));polylineSelection.set(control.id,control.points.length-1);
}
export function canContinuePolyline(control){
 const index=selectedLinePoint(control);
 return editingPolyline(control) && !closedPolyline(control) && (index===0 || index===linePoints(control).length-1);
}
export function removeLinePoint(control) {
 const closed=closedPolyline(control),points=linePoints(control).map(point=>[...point]);
 if(points.length<=(closed?4:2))return;
 const index=selectedLinePoint(control);
 if(closed)points.pop();points.splice(index,1);
 if(closed)points.push([...points[0]]);
 control.points=points;polylineSelection.set(control.id,Math.min(index,points.length-(closed?2:1)));
}
// SVG keeps fill/line opacity independent and scales cleanly with editor zoom.
export function shapeGeometry(control) {
  const width=Math.max(1,Number(control.width)||120),height=Math.max(1,Number(control.height)||120);
  const stroke=Math.min(width,height,Math.max(0,Number(control.strokeWidth) || 0)),inset=stroke/2;
  if(control.type==='polyline')return {tag:'polyline',attributes:{points:linePoints(control).map(([x,y])=>`${inset+x*(width-stroke)},${inset+y*(height-stroke)}`).join(' ')}};
  if(control.type==='square')return {tag:'rect',attributes:{x:0,y:0,width,height,rx:Math.min((Math.max(0,Number(control.edgeDiameter)||0))/2,Math.min(width,height)/2)}};
  if(control.type==='circle')return {tag:'ellipse',attributes:{cx:width/2,cy:height/2,rx:width/2,ry:height/2}};
  const orientations=[`${width/2},${inset} ${width-inset},${height-inset} ${inset},${height-inset}`,`${width-inset},${height/2} ${inset},${height-inset} ${inset},${inset}`,`${width/2},${height-inset} ${inset},${inset} ${width-inset},${inset}`,`${inset},${height/2} ${width-inset},${inset} ${width-inset},${height-inset}`];
  return {tag:'polygon',attributes:{points:orientations[((Math.round((Number(control.rotation)||0)/90)%4)+4)%4]}};
}
function renderShape(el,control) {
  const geometry=shapeGeometry(control),ns='http://www.w3.org/2000/svg';
  let svg=el.querySelector('svg');
  if(!svg) {
    svg=document.createElementNS(ns,'svg');svg.classList.add('shape-svg');svg.setAttribute('aria-hidden','true');
    svg.append(document.createElementNS(ns,geometry.tag));el.append(svg);
  }
  svg.setAttribute('viewBox',`0 0 ${Math.max(1,Number(control.width)||120)} ${Math.max(1,Number(control.height)||120)}`);
  svg.setAttribute('preserveAspectRatio','none');
  const shape=svg.firstElementChild;
  for(const [key,value] of Object.entries(geometry.attributes))shape.setAttribute(key,String(value));
  shape.setAttribute('fill',shapeFill(control));shape.setAttribute('stroke',control.foreColor || '#243247');
  shape.setAttribute('stroke-width',String(Math.min(Number(control.width)||120,Number(control.height)||120,Math.max(0,Number(control.strokeWidth)||0))));
  shape.setAttribute('stroke-linejoin','round');
  shape.setAttribute('stroke-linecap','round');
}
export function shapeDefinitions(common) {
  const {backColor,foreColor}=common;
  const base=Object.fromEntries(['left','top','width','height','visible'].map(key=>[key,common[key]]));
  return Object.fromEntries([['square','Square'],['circle','Ellipse'],['triangle','Triangle'],['polyline','Polyline']].map(([type,label])=>[type,{
    label,hidden:type==='triangle',category:'shapes',props:{...base,strokeWidth:{label:'Stroke Width',type:'number',min:0,step:'any'},
      ...(type==='square'?{edgeDiameter:{label:'Edge Diameter',type:'number',min:0,step:'any'}}:{}),
      ...(type==='triangle'?{rotation:{label:'Rotate 90°',type:'button',onClick:control=>{control.rotation=((Number(control.rotation)||0)+90)%360;}}}:{}),...(type==='polyline'?{fillWhenClosed:{label:'Fill when closed',type:'checkbox'},pointEditing:{label:control=>editingPolyline(control)?'Finish Editing Points':'Edit Points',type:'button',onClick:control=>{if(editingPolyline(control)){if(!control.points)control.points=linePoints(control).map(point=>[...point]);reshapePolyline(control,polylinePagePoints(control));}polylineEditing.set(control.id,!editingPolyline(control));}},addBefore:{label:'Add Before Selection',type:'button',visibleWhen:control=>canInsertLinePoint(control,true),onClick:control=>insertLinePoint(control,true)},addAfter:{label:'Add After Selection',type:'button',visibleWhen:control=>canInsertLinePoint(control,false),onClick:control=>insertLinePoint(control,false)},openLine:{label:'Open Polyline',type:'button',visibleWhen:control=>editingPolyline(control) && closedPolyline(control),onClick:openPolyline},continueDrawing:{label:control=>selectedLinePoint(control)===0?'Continue Drawing Backward':'Continue Drawing',type:'button',visibleWhen:canContinuePolyline,command:'continuePolyline'},removePoint:{label:'Remove Selected Point',type:'button',visibleWhen:editingPolyline,onClick:removeLinePoint}}:{}),backColor,foreColor},
    defaults:{width:120,height:120,strokeWidth:2,...(type==='polyline'?{fillWhenClosed:false}:{}),...(type==='square'?{edgeDiameter:0}:{})},
    render:renderShape,update:renderShape
  }]));
}
