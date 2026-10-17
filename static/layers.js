// Controls remain in one saved array. Groups paint as contiguous layer blocks.
export function layerBlocks(page){
 const groups=new Map((page.groups || []).map(group=>[group.id,group])),layers=new Map();
 for(const control of page.controls || []){
  const group=groups.get(control.groupId),id=group?.id || control.id;
  const layer=layers.get(id) || {id,group,controls:[]};layer.controls.push(control);
  // Existing interleaved groups settle at their frontmost member's layer.
  layers.delete(id);layers.set(id,layer);
 }
 return [...layers.values()];
}
export const paintOrder=page=>layerBlocks(page).flatMap(layer=>layer.controls);
export function reorderLayer(page,id,direction){
 const layers=layerBlocks(page),outer=layers.findIndex(layer=>layer.id===id);
 const layer=outer>=0?null:layers.find(layer=>layer.controls.some(control=>control.id===id));
 const list=layer?layer.controls:layers,index=layer?list.findIndex(control=>control.id===id):outer;
 if(index<0)return;
 const target=direction==='front'?list.length-1:direction==='back'?0:Math.max(0,Math.min(list.length-1,index+(direction==='forward'?1:-1)));
 const [item]=list.splice(index,1);list.splice(target,0,item);
 page.controls=layers.flatMap(layer=>layer.controls);
 pruneEmptyGroups(page);
}
export function addToGroup(page,ids,id){
 const group=(page.groups || []).find(group=>group.id===id);if(!group)return;
 const wanted=new Set(ids),layers=layerBlocks(page),joining=paintOrder(page).filter(control=>wanted.has(control.id));
 let target=layers.find(layer=>layer.id===id);
 if(!target){target={id,group,controls:[]};layers.push(target);}
 for(const layer of layers)layer.controls=layer.controls.filter(control=>!wanted.has(control.id));
 for(const control of joining)control.groupId=id;
 target.controls.push(...joining); // New members are at the front within this group.
 page.controls=layers.flatMap(layer=>layer.controls);
 pruneEmptyGroups(page);
}
export function removeFromGroups(page,ids){
 const wanted=new Set(ids),next=[];
 for(const layer of layerBlocks(page)){
  const removed=layer.group?layer.controls.filter(control=>wanted.has(control.id)):[];
  next.push(...layer.controls.filter(control=>!removed.includes(control)));
  for(const control of removed){delete control.groupId;next.push(control);}
 }
 page.controls=next;
 pruneEmptyGroups(page);
}

export function pruneEmptyGroups(page){
 const used=new Set((page.controls || []).map(control=>control.groupId));
 page.groups=(page.groups || []).filter(group=>used.has(group.id));
}

// A drag changes order within one layer list; it never changes membership.
export function layerDrop(page,sourceId,targetId,after=false){
 const layers=layerBlocks(page),sourceControl=page.controls.find(control=>control.id===sourceId);
 if(sourceControl?.groupId){
  const target=page.controls.find(control=>control.id===targetId);
  if(!target || target.groupId!==sourceControl.groupId || targetId===sourceId)return null;
  return {sourceId,targetId,after,edgeIds:[targetId],groupId:sourceControl.groupId};
 }
 const source=layers.find(layer=>layer.id===sourceId);
 const target=layers.find(layer=>layer.id===targetId || layer.controls.some(control=>control.id===targetId));
 if(!source || !target || source===target)return null;
 return {sourceId,targetId:target.id,after,edgeIds:[target.id,...(target.group?target.controls.map(control=>control.id):[])]};
}
export function moveLayerTo(page,sourceId,targetId,after=false){
 const drop=layerDrop(page,sourceId,targetId,after);if(!drop)return false;
 const layers=layerBlocks(page),list=drop.groupId?layers.find(layer=>layer.id===drop.groupId).controls:layers;
 const from=list.findIndex(item=>item.id===drop.sourceId),[item]=list.splice(from,1);
 const to=list.findIndex(item=>item.id===drop.targetId)+(after?1:0);
 list.splice(to,0,item);
 const next=layers.flatMap(layer=>layer.controls);
 if(next.every((control,index)=>control===page.controls[index]))return false;
 page.controls=next;return true;
}
