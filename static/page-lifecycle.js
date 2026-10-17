// One lifecycle per rendered instance, including multiple popups of the same page.
export class PageLifecycles {
  constructor(onTransition){this.views=new Map();this.onTransition=onTransition;}
  sync(entries) {
    const wanted=new Map(entries.map(entry=>[entry.key,entry.owner]));let changed=false;
    for(const [key,view] of this.views)if(!wanted.has(key)) {
      this.views.delete(key);this.onTransition(view.owner,'page_close');changed=true;
    }
    for(const [key,owner] of wanted)if(!this.views.has(key)) {
      this.views.set(key,{owner,states:new Map()});this.onTransition(owner,'page_open');changed=true;
    }
    return changed;
  }
}
