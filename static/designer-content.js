// Shared inspector and canvas content editing; no live-view event handlers.
const pending=new WeakSet();
export function contentEditorKind(control,definitions){
 const props=definitions[control.type]?.props||{};
 if(Object.values(props).some(prop=>prop.type==='textAsset'))return 'textAsset';
 if(control.type==='button'&&control.buttonDisplay==='icon')return 'icon';
 if(props.text)return 'text';
 return Object.values(props).find(prop=>prop.type==='image'||prop.type==='symbol')?.type||null;
}
export async function editDesignerContent(control,{definitions,kind=contentEditorKind(control,definitions),openText,openTextViewer,pickAsset,canApply=()=>true,onChanged}){
 if(!kind||pending.has(control)||!canApply())return false;
 pending.add(control);
 try{
  const result=kind==='text'?await openText(control):kind==='textAsset'?await openTextViewer(control):await pickAsset(kind,control);
  if(!result||!canApply())return false;
  if(kind==='text'||kind==='textAsset')Object.assign(control,result);
  else if(kind==='icon')Object.assign(control,{buttonArtworkKind:result.kind,icon:result.kind==='icon'?result.id:'',image:result.kind==='icon'?'':result.url,imageName:result.kind==='icon'?'':result.name});
  else Object.assign(control,{image:result.url,imageName:result.name});
  onChanged(control);return true;
 }finally{pending.delete(control);}
}
export function bindContentDoubleClick(element,{canEdit,onEdit}){
 element.ondblclick=event=>{
  if(event.button!==0||event.target.closest?.('[data-handle],[data-point-index]')||!canEdit())return;
  event.preventDefault();event.stopPropagation();onEdit();
 };
}
