// The list can be wider than its horizontal scroll viewport.
export function explorerViewport(list){
 const bounds=list.getBoundingClientRect(),wrapper=list.closest('.editor-list-scroll') || list,clip=wrapper.getBoundingClientRect();
 const left=Math.max(bounds.left+list.clientLeft,clip.left+wrapper.clientLeft);
 const right=Math.min(bounds.left+list.clientLeft+list.clientWidth,clip.left+wrapper.clientLeft+wrapper.clientWidth);
 const top=Math.max(bounds.top,clip.top),bottom=Math.min(bounds.bottom,clip.bottom);
 return {left,right,top,bottom,width:Math.max(0,right-left)};
}
// Pointer dragging avoids the browser's native multi-row select gesture.
export function mountExplorerDrag(list,{select,describeDrop,drop}){
 let gesture=null,frame=null,indicator=null,last=null;
 const optionAt=(x,y)=>[...list.options].find(option=>{const r=option.getBoundingClientRect();return x>=r.left && x<=r.right && y>=r.top && y<=r.bottom;});
 function clear(){
  if(frame!==null)cancelAnimationFrame(frame);
  frame=null;gesture=null;last=null;indicator?.remove();indicator=null;list.classList.remove('explorer-dragging');
 }
 function locate(event){
  const rect=explorerViewport(list);
  if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom){indicator.hidden=true;return null;}
  const target=optionAt(event.clientX,event.clientY);if(!target){indicator.hidden=true;return null;}
  const r=target.getBoundingClientRect(),after=event.clientY>r.top+r.height/2;
  const plan=describeDrop(gesture.id,target.value,after);
  if(!plan){indicator.hidden=true;return null;}
  const edges=[...list.options].filter(option=>plan.edgeIds.includes(option.value));
  const edge=(after?edges.at(-1):edges[0]).getBoundingClientRect();
  const y=after?edge.bottom:edge.top;
  indicator.hidden=y<rect.top || y>rect.bottom;
  Object.assign(indicator.style,{left:rect.left+3+'px',top:y-1+'px',width:Math.max(0,rect.width-6)+'px'});
  return plan;
 }
 function tick(){
  frame=null;if(!gesture?.dragging || !last)return;
  if(!list.isConnected){clear();return;}
  const rect=explorerViewport(list);
  if(last.clientX>=rect.left && last.clientX<=rect.right && last.clientY>=rect.top && last.clientY<=rect.bottom){
   if(last.clientY<rect.top+24)list.scrollTop-=7;
   else if(last.clientY>rect.bottom-24)list.scrollTop+=7;
  }
  gesture.plan=locate(last);frame=requestAnimationFrame(tick);
 }
 list.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  const option=optionAt(event.clientX,event.clientY);if(!option)return;
  event.preventDefault();list.focus({preventScroll:true});
  const changed=list.value!==option.value;list.value=option.value;select(option.value,changed);
  if(!list.isConnected)return;
  gesture={id:option.value,x:event.clientX,y:event.clientY,dragging:false};
  list.setPointerCapture(event.pointerId);
 });
 list.addEventListener('pointermove',event=>{
  if(!gesture)return;last={clientX:event.clientX,clientY:event.clientY};
  if(!gesture.dragging && Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<5)return;
  if(!gesture.dragging){
   gesture.dragging=true;list.classList.add('explorer-dragging');
   indicator=document.createElement('div');indicator.className='explorer-drop-line';indicator.setAttribute('aria-hidden','true');document.body.append(indicator);
   frame=requestAnimationFrame(tick);
  }
  event.preventDefault();gesture.plan=locate(event);
 });
 list.addEventListener('pointerup',event=>{
  const plan=gesture?.dragging?locate(event):null;clear();
  if(plan)drop(plan);
 });
 list.addEventListener('pointercancel',clear);
 list.addEventListener('lostpointercapture',clear);
 list.addEventListener('keydown',event=>{if(event.key==='Escape' && gesture){event.preventDefault();clear();}});
}
