// Bounded, per-page snapshots. Images are references, not embedded data.
export class EditHistory {
  constructor(limit=100) {this.limit=limit;this.pages=new Map();}
  serialize(page) {const copy=structuredClone(page);delete copy.usage;return JSON.stringify(copy);}
  ensure(page) {
    if(!this.pages.has(page.id))this.pages.set(page.id,{items:[this.serialize(page)],index:0,group:null,time:0});
    return this.pages.get(page.id);
  }
  record(page,group=null,now=Date.now()) {
    const state=this.ensure(page),next=this.serialize(page);
    if(next===state.items[state.index])return;
    state.items.splice(state.index+1);
    if(group && state.group===group && now-state.time<700 && state.index>0)state.items[state.index]=next;
    else {state.items.push(next);state.index++;}
    if(state.items.length>this.limit+1){state.items.shift();state.index--;}
    state.group=group;state.time=now;
  }
  canUndo(page) {return this.ensure(page).index>0;}
  canRedo(page) {const s=this.ensure(page);return s.index<s.items.length-1;}
  move(page,delta) {
    const s=this.ensure(page),index=s.index+delta;
    if(index<0 || index>=s.items.length)return null;
    s.index=index;s.group=null;return JSON.parse(s.items[index]);
  }
  reset(page) {this.pages.delete(page.id);this.ensure(page);}
}
