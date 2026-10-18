export function completePolyline(points,strokeWidth=2){
 if(points.length<2)throw new Error('Add at least two points');
 const padding=Math.max(0,strokeWidth)/2;
 const left=Math.min(...points.map(p=>p[0]))-padding,top=Math.min(...points.map(p=>p[1]))-padding;
 const width=Math.max(strokeWidth+1,Math.max(...points.map(p=>p[0]))+padding-left),height=Math.max(strokeWidth+1,Math.max(...points.map(p=>p[1]))+padding-top);
 return {left,top,width,height,points:points.map(([x,y])=>[Math.max(0,Math.min(1,(x-left-padding)/(width-strokeWidth))),Math.max(0,Math.min(1,(y-top-padding)/(height-strokeWidth)))])};
}
export function polylinePagePoints(control){
 const stroke=Math.min(control.width,control.height,Math.max(0,Number(control.strokeWidth)||0));
 return control.points.map(([x,y])=>[control.left+stroke/2+x*(control.width-stroke),control.top+stroke/2+y*(control.height-stroke)]);
}
export function reshapePolyline(control,points){Object.assign(control,completePolyline(points,Math.max(0,Number(control.strokeWidth)||0)));}
export function movePolyline(start,dx,dy,page,grid){
 function axis(origin,size,extent,delta){
  const minimum=Math.min(0,-origin),maximum=Math.max(0,extent-size-origin);
  if(grid){
   const low=Math.ceil(minimum/grid),high=Math.floor(maximum/grid);
   if(low>high)return origin;
   return origin+Math.max(low,Math.min(high,Math.round(delta/grid)))*grid;
  }
  return origin+Math.max(minimum,Math.min(maximum,delta));
 }
 return {left:axis(start.left,start.width,page.width,dx),top:axis(start.top,start.height,page.height,dy)};
}
export function mountPolylineDrawing({canvas,panel,page,zoom,grid,draft,node,button,onComplete,onCancel}){
 panel.replaceChildren();node('h3','Draw Polyline',panel);node('p','Click on the page to add points. Right-click to remove the last point. Click the first point after adding three points to close and complete the line. Complete adds the line to the page; Save Page stores it. Press Escape or Cancel to stop.',panel,{className:'hint'});
 const count=node('p','',panel),complete=button('Complete',panel,()=>onComplete(completePolyline(draft.points,draft.strokeWidth ?? 2)));
 button('Cancel',panel,onCancel);
 const ns='http://www.w3.org/2000/svg',overlay=document.createElementNS(ns,'svg');overlay.classList.add('polyline-drawing');overlay.setAttribute('viewBox',`0 0 ${page.width} ${page.height}`);canvas.append(overlay);
 let cursor=null,preview=null,firstDot=null;
 function nearStart(point){return draft.points.length>=3 && draft.points.length<1000 && Math.hypot(point[0]-draft.points[0][0],point[1]-draft.points[0][1])*zoom()<=8;}
 function eventPoint(event,snapped=true){const rect=canvas.getBoundingClientRect(),snap=n=>snapped && grid?Math.round(n/grid)*grid:n;return [Math.max(0,Math.min(page.width,snap((event.clientX-rect.left)/zoom()))),Math.max(0,Math.min(page.height,snap((event.clientY-rect.top)/zoom())))];}
 function updatePreview(){const last=draft.points.at(-1),closing=cursor && nearStart(cursor.raw),end=closing?draft.points[0]:cursor?.point;
  preview.setAttribute('visibility',last && end?'visible':'hidden');
  if(last && end)preview.setAttribute('points',[last,end].map(p=>p.join(',')).join(' '));
  if(firstDot){firstDot.setAttribute('r',(closing?6:3)/zoom());firstDot.setAttribute('fill',closing?'#16794b':'#0284c7');}
 }
 function render(){overlay.replaceChildren();firstDot=null;count.textContent=draft.points.length+' points';complete.disabled=draft.points.length<2;
  if(draft.points.length>1){const line=document.createElementNS(ns,'polyline');line.setAttribute('points',draft.points.map(p=>p.join(',')).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke',draft.foreColor || '#243247');line.setAttribute('stroke-width',String(draft.strokeWidth ?? 2));overlay.append(line);}
  for(const [x,y] of draft.points){const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.setAttribute('r',3/zoom());dot.setAttribute('fill','#0284c7');overlay.append(dot);if(!firstDot)firstDot=dot;}
  preview=document.createElementNS(ns,'polyline');preview.setAttribute('fill','none');preview.setAttribute('stroke',draft.foreColor || '#243247');preview.setAttribute('stroke-width',String(draft.strokeWidth ?? 2));preview.setAttribute('stroke-dasharray','5 4');overlay.append(preview);updatePreview();
 }
 overlay.onpointerdown=event=>{if(event.button===0){event.preventDefault();event.stopPropagation();}};
 overlay.onclick=event=>{event.preventDefault();event.stopPropagation();if(event.button!==0)return;
  const point=eventPoint(event);
  if(nearStart(eventPoint(event,false))){onComplete(completePolyline([...draft.points,[...draft.points[0]]],draft.strokeWidth ?? 2));return;}
  const last=draft.points.at(-1);if(draft.points.length<1000 && (!last || last[0]!==point[0] || last[1]!==point[1]))draft.points.push(point);render();
 };
 overlay.onpointermove=event=>{cursor={raw:eventPoint(event,false),point:eventPoint(event)};updatePreview();};
 overlay.onpointerleave=()=>{cursor=null;updatePreview();};
 overlay.oncontextmenu=event=>{event.preventDefault();event.stopPropagation();if(draft.points.length>(draft.minimumPoints ?? 0))draft.points.pop();render();};render();
}
