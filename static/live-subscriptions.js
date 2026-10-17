import {controlInlineTagIds} from './inline-text.js';
// One cached batch request loop per source, shared by all views in this tab.
export function pageTagIds(page,tags=[]) {
  const ids=new Set();
  for(const control of [page,...page.controls || [],...page.groups || []]) {
    ids.add(control.binding?.tag);
    for(const id of controlInlineTagIds(control,tags))ids.add(id);
    for(const action of control.actions || [])if(!['navigate','popup'].includes(action.action))ids.add(action.tag);
    for(const event of control.events || []) {
      ids.add(event.tag);ids.add(event.target);
      for(const operand of [event.operand,event.end_operand])if(operand?.kind==='tag')ids.add(operand.tag);
    }
  }
  return [...ids].filter(Boolean);
}
export class LiveSubscriptions {
  constructor({fetchBatch,onData,onError,setTimer=(fn,delay)=>setTimeout(fn,delay),clearTimer=id=>clearTimeout(id),now=()=>performance.now()}) {
    Object.assign(this,{fetchBatch,onData,onError,setTimer,clearTimer,now});this.jobs=new Map();
  }
  update(groups) {
    const wanted=new Map(groups.map(group=>[group.source,group]));
    for(const [source,job] of this.jobs) {
      if(!wanted.has(source) || job.signature!==JSON.stringify(wanted.get(source))) {
        job.closed=true;this.clearTimer(job.timer);this.jobs.delete(source);
      }
    }
    for(const [source,group] of wanted)if(!this.jobs.has(source)) {
      const job={...group,signature:JSON.stringify(group),closed:false,pending:false,promise:null};
      this.jobs.set(source,job);this.run(job);
    }
  }
  run(job) {
    if(job.closed)return Promise.resolve();
    if(job.promise){job.pending=true;return job.promise;}
    this.clearTimer(job.timer);
    const started=this.now();
    let failed=false;
    job.promise=(async()=> {
      try {
        const data=await this.fetchBatch(job);
        if(!job.closed){if(Number.isFinite(data.live) && data.live>0)job.interval=data.live*1000;this.onData(data,job);}
      } catch(error){failed=true;if(!job.closed)this.onError?.(error);}
    })().finally(()=> {
      job.promise=null;
      if(job.closed)return;
      // Fetch, parsing and painting consume the interval instead of extending it.
      const elapsed=Math.max(0,this.now()-started);
      const delay=job.pending?0:failed?job.interval:Math.max(0,job.interval-elapsed);job.pending=false;
      job.timer=this.setTimer(()=>this.run(job),delay);
    });
    return job.promise;
  }
  refreshAll(){return Promise.all([...this.jobs.values()].map(job=>this.run(job)));}
  close(){this.update([]);}
}
