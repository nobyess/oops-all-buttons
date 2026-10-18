// Two corners define the control's bounds, regardless of click direction.
export function placementBounds(first,second){
 const width=Math.abs(second[0]-first[0]),height=Math.abs(second[1]-first[1]);
 if(width<20 || height<20)return null;
 return {left:Math.min(first[0],second[0]),top:Math.min(first[1],second[1]),width,height};
}
export function mountControlPlacement({canvas,panel,page,zoom,grid,draft,label,node,button,onComplete,onCancel}){
 panel.replaceChildren();node('h3','Place '+label,panel);
 node('p','Click the first corner, then the opposite corner to place the control. Draw in any direction. Minimum size is 20 × 20. Right-click to reset the first corner. Press Escape or Cancel to stop.',panel,{className:'hint'});
 const status=node('p','',panel,{className:'hint'});button('Cancel',panel,onCancel);
 const ns='http://www.w3.org/2000/svg',overlay=document.createElementNS(ns,'svg');
 overlay.classList.add('polyline-drawing');overlay.setAttribute('viewBox',`0 0 ${page.width} ${page.height}`);canvas.append(overlay);
 const preview=document.createElementNS(ns,draft.type==='circle'?'ellipse':'rect');
 preview.setAttribute('fill','#0284c720');preview.setAttribute('stroke','#0284c7');preview.setAttribute('stroke-width','1');preview.setAttribute('vector-effect','non-scaling-stroke');preview.setAttribute('stroke-dasharray','5 4');overlay.append(preview);
 const dot=document.createElementNS(ns,'circle');dot.setAttribute('fill','#0284c7');overlay.append(dot);
 let cursor=null;
 function point(event){const rect=canvas.getBoundingClientRect(),snap=n=>grid?Math.round(n/grid)*grid:n;return [Math.max(0,Math.min(page.width,snap((event.clientX-rect.left)/zoom()))),Math.max(0,Math.min(page.height,snap((event.clientY-rect.top)/zoom())))];}
 function update(){
  const first=draft.first;dot.setAttribute('visibility',first?'visible':'hidden');
  if(first){dot.setAttribute('cx',first[0]);dot.setAttribute('cy',first[1]);dot.setAttribute('r',3/zoom());}
  preview.setAttribute('visibility',first && cursor?'visible':'hidden');
  status.textContent=first?'Click the opposite corner.':'Click the first corner.';
  if(!first || !cursor)return;
  const left=Math.min(first[0],cursor[0]),top=Math.min(first[1],cursor[1]),width=Math.abs(cursor[0]-first[0]),height=Math.abs(cursor[1]-first[1]);
  const attributes=draft.type==='circle'?{cx:left+width/2,cy:top+height/2,rx:width/2,ry:height/2}:{x:left,y:top,width,height};
  for(const [key,value] of Object.entries(attributes))preview.setAttribute(key,value);
  status.textContent=`Width: ${width} · Height: ${height}`+(width<20 || height<20?' — minimum 20 × 20':'');
 }
 overlay.onpointerdown=event=>{if(event.button===0){event.preventDefault();event.stopPropagation();}};
 overlay.onclick=event=>{event.preventDefault();event.stopPropagation();if(event.button!==0)return;
  cursor=point(event);
  if(!draft.first)draft.first=cursor;
  else {const bounds=placementBounds(draft.first,cursor);if(bounds){onComplete(bounds);return;}}
  update();
 };
 overlay.onpointermove=event=>{cursor=point(event);update();};
 overlay.onpointerleave=()=>{cursor=null;update();};
 overlay.oncontextmenu=event=>{event.preventDefault();event.stopPropagation();draft.first=null;update();};
 update();
}
