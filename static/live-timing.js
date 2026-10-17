// Temporary diagnostics. Uses existing batch responses, never extra requests.
export class LiveTimingState {
 constructor(now=()=>performance.now()){this.now=now;this.reset();}
 reset(){this.started=this.tickAt=this.now();this.replyAt=null;this.dataAge=null;this.source='';this.peakDelay=0;this.count=0;}
 tick(){const now=this.now();this.peakDelay=Math.max(this.peakDelay,Math.max(0,now-this.tickAt-100));this.tickAt=now;}
 resume(){this.tickAt=this.now();}
 reply(data,source){
  this.replyAt=this.now();this.source=source;this.count++;
  const ages=Object.values(data.values || {}).filter(sample=>sample.quality==='good' && Number.isFinite(sample.timestamp)).map(sample=>Math.max(0,data.server_time-sample.timestamp)*1000);
  this.dataAge=Number.isFinite(data.server_time) && ages.length?Math.max(...ages):null;
 }
 snapshot(){const now=this.now(),replyAge=this.replyAt===null?null:Math.max(0,now-this.replyAt);return {elapsed:now-this.started,replyAge,dataAge:this.dataAge===null?null:this.dataAge+replyAge,peakDelay:this.peakDelay,count:this.count,source:this.source};}
}
export function mountLiveTiming(){
 const state=new LiveTimingState(),box=document.createElement('aside');box.className='live-timing';box.hidden=true;box.setAttribute('aria-label','Temporary live update diagnostics');
 const title=document.createElement('div');title.className='live-timing-title';title.textContent='Live timing';box.append(title);
 const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Hide timing overlay until reload');title.append(close);
 const rows={};for(const label of ['Browser timer','Last server reply','Latest batch data age','Peak browser delay']){const row=document.createElement('div'),name=document.createElement('span'),value=document.createElement('strong');name.textContent=label;row.append(name,value);box.append(row);rows[label]=value;}
 const source=document.createElement('div');source.className='live-timing-source';box.append(source);
 box.title='Browser timer: local heartbeat. Last server reply: time since any successful batch response. Data age: oldest good sample in the latest batch. Peak browser delay: longest visible-tab heartbeat delay beyond its expected 100 ms. Hidden tabs are excluded.';
 document.body.append(box);
 let active=false,dismissed=false,timer;
 const seconds=value=>value===null?'Waiting…':(value/1000).toFixed(1)+' s';
 function paint(){const value=state.snapshot();rows['Browser timer'].textContent=seconds(value.elapsed);rows['Last server reply'].textContent=seconds(value.replyAge);rows['Latest batch data age'].textContent=value.dataAge===null?'Unavailable':seconds(value.dataAge);rows['Peak browser delay'].textContent=seconds(value.peakDelay);source.textContent=value.count?`${value.source} · ${value.count} replies`:'Waiting for first batch';}
 function schedule(){clearInterval(timer);if(active && !dismissed && document.visibilityState!=='hidden'){state.resume();timer=setInterval(()=>{state.tick();paint();},100);}}
 close.onclick=()=>{dismissed=true;box.hidden=true;clearInterval(timer);};
 document.addEventListener('visibilitychange',schedule);
 return {
  setActive(value){if(value===active)return;if(value && !active)state.reset();active=value;box.hidden=!active || dismissed;schedule();if(active)paint();},
  reply(data,source){if(active && !dismissed){state.reply(data,source);paint();}}
 };
}
