import {randomId} from './uuid.js';
import {displayValue} from './value-format.js';

export function topicTree(items){
 const root={children:new Map()};
 for(const item of items){let branch=root;const levels=item.topic.split('/');let path='';
  for(let index=0;index<levels.length;index++){path+=(index?'/':'')+levels[index];let next=branch.children.get(levels[index]);if(!next){next={label:levels[index] || '(empty level)',path,children:new Map()};branch.children.set(levels[index],next);}branch=next;}branch.item=item;
 }
 return root;
}
export function mqttTagBrowser({source,dialog,node,field,button,api,reload,onDone}){
 dialog('Add MQTT tag - '+(source.name || source.id),(body,submit)=>{
  const modal=body.closest('dialog');modal.classList.add('plc-tag-dialog');
  const client=randomId(),footer=submit.parentElement;
  const refresh=button('Refresh Topics',footer,()=>load(true));refresh.className='plc-tag-refresh';footer.prepend(refresh);
  node('p','Expand topics to select a value. Retained topics appear immediately; other topics appear when messages arrive.',body,{className:'hint'});
  const discovery=node('div',null,body,{className:'mqtt-discovery-fields'});
  const filter=field('Discovery filter',discovery,'text','#');filter.placeholder='plant/#';
  const search=field('Filter topics',discovery,'search','');search.placeholder='Name or topic...';
  const list=node('div',null,body,{className:'plc-tag-list',role:'tree',tabIndex:0});list.setAttribute('aria-label','MQTT topics');
  const status=node('p','Starting discovery...',body,{className:'hint',role:'status'});
  const summary=node('strong','Select a topic or enter one below.',body);
  const current=node('p','Current value: -',body,{role:'status'});
  const fields=node('div',null,body,{className:'mqtt-discovery-fields'});
  const topic=field('Topic',fields);topic.required=true;topic.placeholder='plant/pump/speed';
  const name=field('Tag name',fields);name.required=true;name.placeholder='Tag name';
  let items=[],expanded=new Set(),closed=false,pending=false,started=false,lastSignature='',timer,manualName=false;
  function selection(){const item=items.find(item=>item.topic===topic.value);summary.textContent=topic.value?(source.name || source.id)+'\\'+topic.value:'Select a topic or enter one below.';current.textContent=item?(item.quality==='good'?'Current value: '+displayValue(item.value):'Current value: unavailable'):'Current value: waiting for a message';current.title=item?.error || '';submit.disabled=!topic.value.trim() || !name.value.trim() || Boolean(item?.added);}
  function render(){
   const scroll=list.scrollTop;list.replaceChildren();const query=search.value.toLowerCase();
   const tree=topicTree(items.filter(item=>item.topic.toLowerCase().includes(query)));
   function rows(branch,depth){for(const child of [...branch.children.values()].sort((a,b)=>a.label.localeCompare(b.label))){
    const row=node('div',null,list,{className:'plc-tag-row',role:'treeitem',tabIndex:0});row.style.paddingLeft=(9+depth*18)+'px';row.setAttribute('aria-level',depth+1);row.setAttribute('aria-selected',String(child.path===topic.value));
    if(child.children.size)row.setAttribute('aria-expanded',String(query!=='' || expanded.has(child.path)));
    const arrow=node('span',child.children.size?(query!=='' || expanded.has(child.path)?'\u25be':'\u25b8'):'',row,{className:'plc-tag-arrow'});
    node('span',child.label+(child.item?.added?' (Already Added)':''),row,{className:'plc-tag-name'});
    node('span',child.item?(child.item.quality!=='good'?'Unavailable':typeof child.item.value==='number'?'NUMBER':typeof child.item.value==='boolean'?'BOOL':'STRING'):'',row,{className:'plc-tag-type'});
    const toggle=()=>{if(expanded.has(child.path))expanded.delete(child.path);else expanded.add(child.path);render();};
    const pick=()=>{if(child.item){topic.value=child.path;if(!manualName)name.value=child.label;selection();render();}else toggle();};
    row.onclick=pick;arrow.onclick=event=>{event.stopPropagation();toggle();};
    row.onkeydown=event=>{if(event.key==='Enter' || event.key===' '){event.preventDefault();pick();}else if(child.children.size && (event.key==='ArrowRight' || event.key==='ArrowLeft')){event.preventDefault();if(event.key==='ArrowRight')expanded.add(child.path);else expanded.delete(child.path);render();}};
    if(child.children.size && (query!=='' || expanded.has(child.path)))rows(child,depth+1);
   }}rows(tree,0);list.scrollTop=scroll;selection();
  }
  async function load(reset=false){
   if(closed || pending || document.visibilityState==='hidden')return;
   pending=true;refresh.disabled=true;
   try{
    const result=await api('mqtt/discover',{source:source.id,client,action:reset || !started?'start':'read',filter:filter.value});
    if(closed)return;started=true;items=result.items || [];
    const signature=JSON.stringify(items.map(item=>[item.topic,item.added,item.quality,typeof item.value]));
    if(signature!==lastSignature || reset){lastSignature=signature;render();}else selection();
    status.textContent=(result.status.quality==='good'?'Listening':'Broker: '+result.status.message)+' - '+items.length+' topics'+(result.capped?' - Discovery limit reached ('+result.limit+' topics; oversized topics/payloads are skipped).':'');
   }catch(error){if(!closed){status.textContent=error.message;started=false;}}finally{pending=false;refresh.disabled=false;}
  }
  search.oninput=render;filter.onchange=()=>load(true);
  topic.oninput=()=>{if(!manualName)name.value=topic.value.split('/').at(-1);selection();};
  name.oninput=()=>{manualName=Boolean(name.value);selection();};
  const visibility=()=>{if(document.visibilityState==='visible')load(true);};document.addEventListener('visibilitychange',visibility);
  const cleanup=()=>{if(closed)return;closed=true;clearInterval(timer);document.removeEventListener('visibilitychange',visibility);api('mqtt/discover',{source:source.id,client,action:'stop'}).catch(()=>{});};
  modal.addEventListener('close',cleanup,{once:true});
  submit.disabled=true;load(true);timer=setInterval(()=>load(),1000);
  return async()=>{await api('tags',{source:source.id,name:name.value,address:topic.value});cleanup();await reload();onDone();};
 });
}
