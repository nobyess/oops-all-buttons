import {reorderLayer} from './layers.js';
import {randomId} from './uuid.js';
// Group members reorder locally; groups and ungrouped controls reorder on the page.
export function orderControl(page,id,front){reorderLayer(page,id,front?'front':'back');}
export function stepControl(page,id,forward){reorderLayer(page,id,forward?'forward':'backward');}
export function cloneControl(source,page,point,grid,makeId=()=>randomId()) {
  const copy=structuredClone(source);
  copy.id=copy.type+'_'+makeId();
  copy.name=copy.id;
  delete copy.groupId;
  for(const kind of ['actions','events'])for(const rule of copy[kind] || [])rule.id=makeId();
  const snap=n=>grid?Math.round(n/grid)*grid:n;
  copy.left=Math.max(0,Math.min(Math.max(0,page.width-copy.width),snap(point.x)));
  copy.top=Math.max(0,Math.min(Math.max(0,page.height-copy.height),snap(point.y)));
  return copy;
}

export function explorerLabel(control) {
  return (control.pinned?'📌 ':'')+(control.name || control.id);
}
export function togglePinned(control) {control.pinned=!control.pinned;}
