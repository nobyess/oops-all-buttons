import {randomId} from './uuid.js';
// Preserve rule order: later matching visual events take precedence.
export function moveRule(items,id,direction) {
  const index=items.findIndex(item=>item.id===id),next=index+direction;
  if(index<0 || next<0 || next>=items.length || ![-1,1].includes(direction))return false;
  [items[index],items[next]]=[items[next],items[index]];return true;
}
export function duplicateRule(items,id) {
  const index=items.findIndex(item=>item.id===id);if(index<0)return null;
  const copy=structuredClone(items[index]);copy.id=randomId();items.splice(index+1,0,copy);return copy;
}
