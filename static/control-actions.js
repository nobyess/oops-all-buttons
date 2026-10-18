// Retain an active press across live repaints, including touch and pen input.
const states=new WeakMap();
export function bindControlActions(element,{enabled,execute}){
 let state=states.get(element);
 if(!state){state={pointer:null,point:null,execute:null};states.set(element,state);}
 state.execute=execute;
 if(!enabled){
  state.pointer=null;
  for(const [name,handler] of Object.entries(state.handlers || {}))if(element[name]===handler)element[name]=null;
  element.onmousedown=element.onmouseup=element.onclick=null;
  return;
 }
 element.onmousedown=element.onmouseup=null;
 const point=event=>({x:event.clientX,y:event.clientY});
 element.onpointerdown=event=>{
  if(event.button!==0 || event.isPrimary===false || state.pointer!==null)return;
  state.pointer=event.pointerId;state.point=point(event);
  // Capture preserves release delivery when the finger leaves the control.
  try{element.setPointerCapture?.(event.pointerId);}catch{}
  state.execute('mouse_down',state.point);
 };
 const release=event=>{
  if(state.pointer!==event.pointerId)return;
  state.pointer=null;
  state.execute('mouse_up',event.type==='lostpointercapture'?state.point:point(event));
 };
 element.onpointerup=element.onpointercancel=element.onlostpointercapture=release;
 element.onclick=event=>{if(event.button===0)state.execute('click',event.detail===0?null:point(event));};
 state.handlers=Object.fromEntries(['onpointerdown','onpointerup','onpointercancel','onlostpointercapture','onclick'].map(name=>[name,element[name]]));
}
