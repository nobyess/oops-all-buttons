const STORAGE='hmi-designer-panel-widths';
const listScrollState=new Map();
function rememberList(list){
 const key=list.dataset.editorListKey;if(!key)return;
 listScrollState.set(key,{top:list.scrollTop,left:list.parentElement.scrollLeft});
}
export function saveEditorListScroll(root){
 for(const list of root.querySelectorAll('[data-editor-list-key]'))rememberList(list);
}
export function constrainPanelWidth(value,available,other){return Math.round(Math.max(160,Math.min(600,Math.max(160,available-other-160),value)));}
export function scrollableEditorList(list,explorer=false,stateKey=''){
 const wrapper=document.createElement('div');wrapper.className='editor-list-scroll'+(explorer?' explorer-list-scroll':'');
 list.before(wrapper);wrapper.append(list);list.classList.add('editor-scroll-list');
 if(stateKey){
  list.dataset.editorListKey=stateKey;
  const previous=listScrollState.get(stateKey);let ready=false;
  const remember=()=>{if(ready && list.isConnected)rememberList(list);};
  list.addEventListener('scroll',remember);wrapper.addEventListener('scroll',remember);
  requestAnimationFrame(()=>{
   if(!list.isConnected)return;
   if(previous){list.scrollTop=previous.top;wrapper.scrollLeft=previous.left;}
   ready=true;rememberList(list);
  });
 }
 return wrapper;
}
export function mountEditorPanels(layout){
 let saved={};try{saved=JSON.parse(localStorage.getItem(STORAGE) || '{}');}catch{}
 const defaults=()=>layout.clientWidth<=1000?{left:190,right:300}:{left:250,right:320};
 let widths={...defaults(),...Object.fromEntries(Object.entries(saved).filter(([key,value])=>['left','right'].includes(key) && Number.isFinite(value)))};
 let closed=false,dragging=false;
 const handles=[];
 function apply(){
  widths.left=constrainPanelWidth(widths.left,layout.clientWidth,widths.right);
  widths.right=constrainPanelWidth(widths.right,layout.clientWidth,widths.left);
  for(const side of ['left','right']){layout.style.setProperty('--editor-'+side,widths[side]+'px');const handle=handles.find(handle=>handle.dataset.side===side);if(handle)handle.setAttribute('aria-valuenow',String(widths[side]));}
 }
 function save(){try{localStorage.setItem(STORAGE,JSON.stringify(widths));}catch{}}
 for(const side of ['left','right']){
  const handle=document.createElement('div');handle.className='editor-panel-resizer '+side;handle.dataset.side=side;handle.tabIndex=0;
  handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label','Resize '+side+' sidebar');handle.setAttribute('aria-valuemin','160');handle.setAttribute('aria-valuemax','600');
  handle.title='Drag to resize; arrow keys adjust width';
  handle.onpointerdown=event=>{
   if(event.button!==0)return;event.preventDefault();handle.setPointerCapture(event.pointerId);dragging=true;layout.classList.add('resizing-panels');
   const origin=event.clientX,width=widths[side];
   handle.onpointermove=move=>{widths[side]=constrainPanelWidth(width+(move.clientX-origin)*(side==='left'?1:-1),layout.clientWidth,widths[side==='left'?'right':'left']);apply();};
   const finish=()=>{handle.onpointermove=null;dragging=false;layout.classList.remove('resizing-panels');save();};
   handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=finish;
  };
  handle.onkeydown=event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();widths[side]+=(event.key==='ArrowRight'?1:-1)*(side==='left'?1:-1)*(event.shiftKey?30:10);apply();save();};
  layout.append(handle);handles.push(handle);
 }
 apply();const observer=new ResizeObserver(()=>{if(!closed && !dragging)apply();});observer.observe(layout);
 return ()=>{closed=true;observer.disconnect();layout.classList.remove('resizing-panels');};
}
