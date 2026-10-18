// Per-view history consumes existing device samples; it never polls a device.
export class TrendBuffer {
 constructor(startedAt=-Infinity){this.points=[];this.startedAt=startedAt;}
 add(sample,now,span){
  const time=Number(sample?.timestamp),validTime=Number.isFinite(time) && time>0;
  if(validTime && time>=this.startedAt && time<=now+1){
   const value=sample?.quality==='good' && ['number','boolean'].includes(typeof sample.value) && Number.isFinite(Number(sample.value))?Number(sample.value):null;
   const last=this.points.at(-1);
   if(!last || time>last.time)this.points.push({time,value});
   else if(time===last.time)last.value=value;
  }
  const cutoff=now-span;
  let remove=0;while(remove+1<this.points.length && this.points[remove+1].time<cutoff)remove++;
  if(remove)this.points.splice(0,remove);
  if(this.points.length>10000)this.points.splice(0,this.points.length-10000);
  return this.points;
 }
}
export function trendPath(points,{now,span,minimum,maximum,left,top,width,height}){
 let path='',drawing=false;
 for(const point of points){
  if(point.value===null){drawing=false;continue;}
  const x=left+(point.time-(now-span))/span*width;
  const ratio=Math.max(0,Math.min(1,(point.value-minimum)/(maximum-minimum)));
  const y=top+(1-ratio)*height;
  path+=(drawing?' L':'M')+x.toFixed(2)+' '+y.toFixed(2);drawing=true;
 }
 return path;
}

// Return an actual recorded sample; do not invent values outside recorded history.
export function trendSampleAt(points,time){
 if(!points.length || time<points[0].time || time>points.at(-1).time)return null;
 let low=0,high=points.length-1;
 while(low<high){const mid=Math.floor((low+high)/2);if(points[mid].time<time)low=mid+1;else high=mid;}
 const after=points[low],before=points[low-1];
 return before && time-before.time<=after.time-time?before:after;
}
export function trendColor(color){return /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color || '')?color.slice(0,7):'#2563eb';}
export function trendSeries(c){const series=Array.isArray(c.series)?c.series:c.binding?.tag?[{id:'legacy',tag:c.binding.tag,color:c.foreColor||'#2563eb'}]:[];return series.map(s=>({...s,color:trendColor(s.color),minimum:s.minimum??c.minimum??0,maximum:s.maximum??c.maximum??100}));}
export const trendColors=['#2563eb','#dc2626','#16a34a','#9333ea','#ea580c','#0891b2'];
export function trendDefinition(common){
 const states=new WeakMap(),ns='http://www.w3.org/2000/svg';
 function make(tag,parent,attrs={}){const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);parent.append(el);return el;}
 const set=(element,attrs)=>{for(const [k,v] of Object.entries(attrs))element.setAttribute(k,v);};
 function update(el,c,ctx){
  const state=states.get(el);if(!state)return;
  const now=Date.now()/1000,span=Math.max(1,Number(c.timespan)||60),minimum=Number(c.minimum??0),maximum=Number(c.maximum??100),series=trendSeries(c);
  if(state.editing!==Boolean(ctx.editing)){
   state.startedAt=now;
   // Remove the previous mode's traces, including synthetic designer preview data.
   for(const entry of state.entries.values())entry.group.remove();state.entries.clear();
   state.editing=Boolean(ctx.editing);
  }
  const w=Math.max(100,Number(c.width)||360),h=Math.max(60,Number(c.height)||200),columns=1,rows=series.length;
  const left=Math.min(48,w*.3),top=12+rows*32,width=Math.max(1,w-left-12),height=Math.max(1,h-top-26);
  set(state.svg,{viewBox:`0 0 ${w} ${h}`,preserveAspectRatio:'none','aria-label':ctx.editing?'Live Trend preview':'Live Trend'});
  set(state.clip,{x:left,y:top,width,height});
  set(state.grid,{d:[0,.5,1].map(f=>`M${left} ${top+height*f}h${width}`).join(' '),stroke:c.foreColor||'#243247','stroke-opacity':'.2','stroke-width':1});
  const wanted=new Set(series.map(s=>s.id));for(const [id,entry] of state.entries)if(!wanted.has(id)){entry.group.remove();state.entries.delete(id);}
  let hasData=false;
  series.forEach((series,index)=>{
   const minimum=Number(series.minimum),maximum=Number(series.maximum);
   let entry=state.entries.get(series.id);
   if(!entry){const group=make('g',state.svg),line=make('path',group,{fill:'none','clip-path':`url(#${state.clipId})`,'vector-effect':'non-scaling-stroke','stroke-width':2}),dot=make('circle',group,{r:2.5,'clip-path':`url(#${state.clipId})`}),legend=make('text',group),title=make('title',legend),range=make('text',group);entry={group,line,dot,legend,title,range,buffer:new TrendBuffer(state.startedAt),tag:series.tag};state.entries.set(series.id,entry);}
   if(entry.tag!==series.tag || ctx.editing){entry.buffer=new TrendBuffer(now);entry.tag=series.tag;}
   const sample=Array.isArray(c.series)?ctx.values?.[series.tag]:ctx.bindingValue;
   const points=ctx.editing?Array.from({length:61},(_,i)=>({time:now-span+i*span/60,value:minimum+(maximum-minimum)*(.5+.3*Math.sin(i/7+index))})):entry.buffer.add(sample,now,span);
   set(entry.line,{d:trendPath(points,{now,span,minimum,maximum,left,top,width,height}),stroke:series.color});
   const latest=points.at(-1);set(entry.dot,{cx:latest?left+(latest.time-(now-span))/span*width:left,cy:latest?top+(1-Math.max(0,Math.min(1,(latest.value-minimum)/(maximum-minimum))))*height:top,fill:series.color,display:latest && latest.value!==null && latest.time>=now-span?'':'none'});
   const name=ctx.tagLabel?.(series.tag)||series.tag||'Select tag';const nameLimit=Math.max(8,Math.floor((w-left-12)/((Number(c.fontSize)||12)*.62)));entry.legend.textContent=name.length>nameLimit?name.slice(0,nameLimit-1)+'…':name;
   // Tooltip retains the full tag name without adding another layout row.
   entry.legend.append(entry.title);entry.title.textContent=name;
   set(entry.legend,{x:left+(index%columns)*((w-left)/columns),y:14+Math.floor(index/columns)*32,fill:series.color,'font-size':Number(c.fontSize)||12});
   entry.range.textContent=String(series.minimum)+' → '+String(series.maximum);set(entry.range,{x:left+(index%columns)*((w-left)/columns),y:28+Math.floor(index/columns)*32,fill:series.color,'font-size':Number(c.fontSize)||12});
   hasData ||= points.some(p=>p.value!==null && p.time>=now-span);
  });
  const format=n=>String(Number(n.toPrecision(5))),first=series[0],shared=first && series.every(s=>s.minimum===first.minimum && s.maximum===first.maximum);
  const upper=shared?format(Number(first.maximum)):'100%',lower=shared?format(Number(first.minimum)):'0%';
  for(const [text,value,x,y,anchor] of [[state.max,upper,left-6,top+4,'end'],[state.min,lower,left-6,top+height,'end'],[state.from,`−${span}s`,left,h-7,'start'],[state.to,'Now',left+width,h-7,'end']]){text.textContent=value;set(text,{x,y,'text-anchor':anchor,fill:c.foreColor||'#243247','font-size':Number(c.fontSize)||12});}
  state.empty.textContent=ctx.editing || hasData?'':series.length?'Waiting for data…':'Add a trend tag';set(state.empty,{x:left+width/2,y:top+height/2,'text-anchor':'middle',fill:c.foreColor||'#243247','font-size':Number(c.fontSize)||12});
  state.paintCursor=()=>{
   state.cursorGroup?.remove();state.cursorGroup=null;
   if(state.cursorRatio===null || ctx.editing)return;
   const ratio=Math.max(0,Math.min(1,state.cursorRatio)),time=now-span+ratio*span,x=left+ratio*width;
   const group=state.cursorGroup=make('g',state.svg,{'pointer-events':'none'});
   const font=Number(c.fontSize)||12,lineHeight=font+6,boxHeight=(series.length+1)*lineHeight+12;
   const boxWidth=Math.min(width,Math.max(120,Math.min(300,width))),boxX=Math.max(left,Math.min(x-boxWidth/2,left+width-boxWidth)),boxY=Math.max(top,top+height-boxHeight);
   make('line',group,{x1:x,x2:x,y1:top,y2:boxY,stroke:c.foreColor||'#243247','stroke-width':1,'stroke-dasharray':'4 3','vector-effect':'non-scaling-stroke'});
   make('rect',group,{x:boxX,y:boxY,width:boxWidth,height:boxHeight,rx:4,fill:c.backColor||'#ffffff',stroke:c.foreColor||'#243247','stroke-width':1});
   const stamp=make('text',group,{x:boxX+8,y:boxY+font+6,fill:c.foreColor||'#243247','font-size':font});stamp.textContent=new Date(time*1000).toLocaleTimeString();
   series.forEach((s,index)=>{
    const point=trendSampleAt(state.entries.get(s.id)?.buffer.points || [],time),name=ctx.tagLabel?.(s.tag)||s.tag;
    const value=point?.value==null?'—':String(Number(point.value.toPrecision(6)));
    const text=make('text',group,{x:boxX+8,y:boxY+font+6+(index+1)*lineHeight,fill:s.color,'font-size':font});
    const limit=Math.max(3,Math.floor((boxWidth-16)/(font*.62))-value.length-2);text.textContent=(name.length>limit?name.slice(0,limit-1)+'…':name)+': '+value;
    make('title',text).textContent=name+': '+value;
   });
  };
  state.geometry={w,h,left,top,width,height};state.paintCursor();
 }
 return {label:'Live Trend',bindable:true,
  props:{trendSeries:{label:'Tags',type:'trendSeries'},timespan:{label:'Timespan (seconds)',type:'number',min:1,max:86400,step:1},...Object.fromEntries(Object.entries(common).filter(([key])=>['left','top','width','height','visible','fontFamily','fontSize','bold','italic','backColor','foreColor'].includes(key)))},
  defaults:{width:360,height:200,timespan:60,minimum:0,maximum:100,fontSize:12,backColor:'#ffffff',foreColor:'#243247',series:[]},
  render(el,c,ctx){const svg=make('svg',el,{class:'trend-svg',role:'img'}),defs=make('defs',svg),clipId='trend-'+Math.random().toString(36).slice(2),clipPath=make('clipPath',defs,{id:clipId}),clip=make('rect',clipPath),grid=make('path',svg,{fill:'none'});states.set(el,{svg,clip,clipId,grid,startedAt:Date.now()/1000,editing:Boolean(ctx.editing),entries:new Map(),cursorRatio:null,cursorGroup:null,max:make('text',svg),min:make('text',svg),from:make('text',svg),to:make('text',svg),empty:make('text',svg)});
   const state=states.get(el);
   const move=event=>{const r=svg.getBoundingClientRect(),g=state.geometry;if(!g || !r.width)return;const x=(event.clientX-r.left)*g.w/r.width;state.cursorRatio=(x-g.left)/g.width;state.paintCursor?.();};
   svg.onpointerdown=event=>{if(state.editing || event.button!==0)return;const r=svg.getBoundingClientRect(),g=state.geometry,y=(event.clientY-r.top)*g.h/r.height;if(y<g.top || y>g.top+g.height)return;event.preventDefault();event.stopPropagation();state.pointerId=event.pointerId;svg.setPointerCapture?.(event.pointerId);move(event);};
   svg.onpointermove=event=>{if(state.pointerId===event.pointerId)move(event);};
   const release=event=>{if(state.pointerId!==event.pointerId)return;state.pointerId=null;state.cursorRatio=null;state.paintCursor?.();};
   svg.onpointerup=release;svg.onpointercancel=release;svg.onlostpointercapture=release;
   update(el,c,ctx);},update
 };
}
