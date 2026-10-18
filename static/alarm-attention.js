export function unsilencedAlarms(items){return items.filter(a=>a.state?.active && !a.state.silenced_at);}
export function nextFocusedAlarm(items,dismissed){return unsilencedAlarms(items).filter(a=>a.focused && !dismissed.has(a.state.occurrence)).sort((a,b)=>a.state.activated_at-b.state.activated_at)[0];}

export function mountAlarmAttention({before,api}){
 const bell=document.createElement('button');bell.id='alarm-bell';bell.type='button';bell.hidden=true;bell.title='Alarms';bell.setAttribute('aria-haspopup','dialog');bell.setAttribute('aria-expanded','false');
 const ns='http://www.w3.org/2000/svg',icon=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');path.setAttribute('d','M6 9a6 6 0 0 1 12 0v6l2 3H4l2-3z M10 21h4');icon.append(path);bell.append(icon);
 const count=document.createElement('span');count.className='alarm-bell-count';count.hidden=true;bell.append(count);before.before(bell);
 let user=null,items=[],dismissed=new Set(),current=null,pending=false,generation=0;
 const storageKey=()=>`hmi-focused-alarms:${user?.id}`;
 function remember(occurrence){dismissed.add(occurrence);try{sessionStorage.setItem(storageKey(),JSON.stringify([...dismissed].slice(-512)));}catch{}}
 function closeCurrent(record=true){if(!current)return;current.record=record;current.modal.close();}
 function setUser(next){generation++;closeCurrent(false);user=next;items=[];dismissed=new Set();bell.hidden=!user;bell.classList.remove('has-unsilenced');count.hidden=true;bell.setAttribute('aria-label','Alarms');
  if(user){try{const saved=JSON.parse(sessionStorage.getItem(storageKey()) || '[]');if(Array.isArray(saved))dismissed=new Set(saved.filter(x=>typeof x==='string'));}catch{}refresh();}
 }
 function add(tag,text,parent,attributes={}){const el=document.createElement(tag);if(text!==null)el.textContent=text;Object.assign(el,attributes);parent.append(el);return el;}
 function makeDialog(){
  const modal=document.createElement('dialog');modal.className='designer-dialog alarm-attention-dialog';modal.setAttribute('aria-label','Active Alarms');
  const record={modal,record:true,shown:new Set()};current=record;
  add('h2','Active Alarms',modal);
  const body=add('div',null,modal),error=add('p','',modal,{className:'bad',hidden:true});error.setAttribute('role','alert');
  const footer=add('div',null,modal,{className:'row dialog-footer'});
  const close=add('button','Close',footer,{type:'button'});close.onclick=()=>modal.close();
  modal.onclose=()=>{modal.remove();bell.setAttribute('aria-expanded','false');if(record.record && user)for(const occurrence of record.shown)remember(occurrence);if(current===record)current=null;};
  modal.oncancel=event=>{event.preventDefault();modal.close();};
  async function silence(a,button){const epoch=generation;button.disabled=true;try{await api('alarms/silence',{id:a.id,occurrence:a.state.occurrence});if(epoch!==generation)return;remember(a.state.occurrence);await refresh();}catch(e){if(epoch===generation && modal.isConnected){error.hidden=false;error.textContent=e.message;button.disabled=false;}}}
  const list=add('div',null,body,{className:'alarm-attention-list'});
  function render(){list.replaceChildren();if(!items.length)add('p','No active alarms.',list,{className:'hint'});
   for(const a of items){if(a.focused && !a.state.silenced_at)record.shown.add(a.state.occurrence);const row=add('div',null,list,{className:'alarm-attention-row'}),text=add('div',null,row);add('strong',a.name,text);add('p',a.message || a.name,text);add('small',a.state.silenced_at?`Silenced by ${a.state.silenced_by}`:'Not silenced',text);const silenceButton=add('button',a.state.silenced_at?'Silenced':'Silence',row,{type:'button',disabled:Boolean(a.state.silenced_at)});silenceButton.onclick=()=>silence(a,silenceButton);}
  }render();record.render=render;record.signature=JSON.stringify(items);
  if(!user.kiosk){const open=add('button','Open Alarms',footer,{type:'button'});open.onclick=()=>{modal.close();location.hash='#alarms';};}
  document.body.append(modal);bell.setAttribute('aria-expanded','true');modal.showModal();close.focus();
 }
 function update(){
  const unsilenced=unsilencedAlarms(items);bell.classList.toggle('has-unsilenced',unsilenced.length>0);count.hidden=!unsilenced.length;count.textContent=unsilenced.length>99?'99+':String(unsilenced.length);bell.setAttribute('aria-label',`Alarms: ${unsilenced.length} not silenced`);bell.title=`Alarms: ${unsilenced.length} not silenced`;
  if(current?.render){const signature=JSON.stringify(items);if(signature!==current.signature){current.signature=signature;current.render();}}
  if(!current && !document.querySelector('dialog[open]') && nextFocusedAlarm(items,dismissed))makeDialog();
 }
 async function refresh(){if(!user || pending || document.visibilityState==='hidden')return;const epoch=generation;pending=true;
  try{const result=await api('alarms/attention');if(epoch!==generation)return;items=result;update();}catch{if(epoch===generation && user)bell.title='Alarm status unavailable';}finally{pending=false;}
 }
 bell.onclick=()=>{if(!user || current)return;makeDialog();};
 const timer=setInterval(refresh,1000),visible=()=>refresh();document.addEventListener('visibilitychange',visible);
 return {setUser,refresh,close:()=>{setUser(null);clearInterval(timer);document.removeEventListener('visibilitychange',visible);bell.remove();}};
}
