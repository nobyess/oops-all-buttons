import {clampPosition} from './page-window.js';

// Same pointer-captured caption dragging as runtime action page windows.
// Keep the native dialog's focus trap and keyboard/cancel behavior.
export function makeDialogMovable(frame,caption){
 let closed=false,gesture=null;
 const viewport=()=>({width:window.innerWidth,height:window.innerHeight});
 function move(point){
  const rect=frame.getBoundingClientRect(),next=clampPosition(point,rect,viewport());
  frame.style.left=next.x+'px';frame.style.top=next.y+'px';
 }
 const rect=frame.getBoundingClientRect();
 frame.style.margin='0';frame.style.right='auto';frame.style.bottom='auto';
 move({x:(window.innerWidth-rect.width)/2,y:(window.innerHeight-rect.height)/2});
 const resize=()=>{if(!closed){const rect=frame.getBoundingClientRect();move({x:rect.left,y:rect.top});}};
 const end=()=>{
  if(gesture&&caption.hasPointerCapture?.(gesture.id))caption.releasePointerCapture(gesture.id);
  gesture=null;
 };
 caption.onpointerdown=event=>{
  if(event.button!==0||event.target.closest('button'))return;
  event.preventDefault();const rect=frame.getBoundingClientRect();
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
  caption.setPointerCapture(event.pointerId);
 };
 caption.onpointermove=event=>{
  if(gesture&&event.pointerId===gesture.id)move({x:gesture.left+event.clientX-gesture.x,y:gesture.top+event.clientY-gesture.y});
 };
 caption.onpointerup=caption.onpointercancel=caption.onlostpointercapture=end;
 window.addEventListener('resize',resize);
 const close=()=>{if(closed)return;closed=true;end();window.removeEventListener('resize',resize);caption.onpointerdown=caption.onpointermove=caption.onpointerup=caption.onpointercancel=caption.onlostpointercapture=null;};
 close.reposition=resize;return close;
}
