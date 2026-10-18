import {pickAccessRoles} from './access-ui.js';
import {confirmMessage} from './message-dialog.js';
import {confirmPageLeave} from './page-leave-dialog.js';
import {tagPath} from './tag-selector.js';
import {eventLabel} from './rule-labels.js';

export function filterActiveAlarms(items,text='',from='',to=''){
 const query=text.trim().toLowerCase(),start=from?new Date(from).getTime()/1000:-Infinity,end=to?new Date(to).getTime()/1000:Infinity;
 return items.filter(a=>a.state?.active && a.state.activated_at>=start && a.state.activated_at<=end && (!query || [a.name,a.message,a.tagPath || ''].some(value=>String(value).toLowerCase().includes(query))));
}
export function silenceLabel(state){return state?.silenced_at?`Silenced by ${state.silenced_by}`:'Not silenced';}

export function mountAlarms(parent,{node,button,api,canManage,tagSelect,getTags,getRoles=()=>[],initialId}){
 const card=node('section',null,parent,{className:'card alarms-workspace'});node('h2','Alarms',card);
 const tabs=node('div',null,card,{className:'tabs alarms-tabs'}),activeButton=button('Active Alarms',tabs,()=>switchView('active'));
 const historyButton=button('Alarm History',tabs,()=>switchView('history'));
 const configButton=canManage?button('Configuration',tabs,()=>switchView('config')):null;
 const error=node('p','',card,{className:'bad',role:'alert',hidden:true});
 const active=node('section',null,card),history=node('section',null,card,{hidden:true}),config=node('section',null,card,{hidden:true});
 let items=[],selected=initialId || '',draft=null,dirty=false,view=initialId && canManage?'config':'active',detail='event',closed=false,pending=false,saving=false,liveSignature='',listSignature='',editorId=null,filterFrom='',filterTo='';
 const tagName=id=>{const tag=getTags().find(t=>t.id===id);return tag?tagPath(tag):id || '[Select Tag]';};
 function showError(message=''){error.textContent=message;error.hidden=!message;}
 const search=node('input',null,active,{type:'search',placeholder:'Search alarm names, messages, or tags…',className:'alarm-search'});search.setAttribute('aria-label','Filter active alarms');
 const filters=node('div',null,active,{className:'alarm-date-filters'});
 function input(label,parent,type,value=''){return node('input',null,node('label',label,parent),{type,value});}
 const from=input('Activated From',filters,'datetime-local'),to=input('Activated To',filters,'datetime-local');from.step=to.step=1;
 const toolbar=node('div',null,active,{className:'alarm-live-toolbar'}),count=node('span','',toolbar,{role:'status'});
 button('Apply Filter',toolbar,()=>{if(from.value && to.value && from.value>to.value){showError('From must be before To.');return;}filterFrom=from.value;filterTo=to.value;showError();renderActive();});
 const silenceAll=button('Silence All',toolbar,async()=>{silenceAll.disabled=true;try{const result=await api('alarms/silence',{all:true});await refresh();if(result.skipped)showError(`${result.skipped} ${result.skipped===1?'alarm requires':'alarms require'} additional access roles and ${result.skipped===1?'was':'were'} not silenced.`);}catch(e){showError(e.message);}finally{renderActive(true);}});
 const table=node('table',null,active,{className:'alarm-active-table'}),head=node('tr',null,node('thead',null,table));
 for(const title of ['Activated','Alarm','State',''])node('th',title,head);
 const rows=node('tbody',null,table);
 node('p','Silencing leaves an alarm active. Silence All includes permitted alarms hidden by filters.',active,{className:'hint'});
 search.oninput=()=>renderActive();
 const historySearch=node('input',null,history,{type:'search',placeholder:'Search alarm names, messages, or users…',className:'alarm-search'});historySearch.setAttribute('aria-label','Filter alarm history');
 const historyDates=node('div',null,history,{className:'alarm-date-filters'}),historyFrom=input('Activated From',historyDates,'datetime-local'),historyTo=input('Activated To',historyDates,'datetime-local');historyFrom.step=historyTo.step=1;
 let historyOffset=0,historyFilterFrom=null,historyFilterTo=null,historyVersion=0,historyPending=false,historyQueued=false,historySignature='',historyDebounce;
 const historyToolbar=node('div',null,history,{className:'alarm-live-toolbar'}),historyCount=node('span','',historyToolbar,{role:'status'});
 button('Apply Filter',historyToolbar,()=>{if(historyFrom.value && historyTo.value && historyFrom.value>historyTo.value){showError('From must be before To.');return;}historyFilterFrom=historyFrom.value?new Date(historyFrom.value).getTime()/1000:null;historyFilterTo=historyTo.value?new Date(historyTo.value).getTime()/1000:null;historyOffset=0;historyVersion++;showError();loadHistory();});
 button('Refresh',historyToolbar,()=>loadHistory());
 const historyTable=node('table',null,history,{className:'alarm-active-table alarm-history-table'}),historyHead=node('tr',null,node('thead',null,historyTable));for(const title of ['Activated','Cleared','Alarm','Silenced'])node('th',title,historyHead);
 const historyRows=node('tbody',null,historyTable),historyPages=node('div',null,history,{className:'alarm-history-pages'});
 const newer=button('Newer',historyPages,()=>{historyOffset=Math.max(0,historyOffset-50);historyVersion++;loadHistory();}),older=button('Older',historyPages,()=>{historyOffset+=50;historyVersion++;loadHistory();});
 historySearch.oninput=()=>{historyOffset=0;historyVersion++;clearTimeout(historyDebounce);historyDebounce=setTimeout(loadHistory,250);};
 function historyTime(parent,stamp,fallback){const cell=node('td',stamp?new Date(stamp*1000).toLocaleDateString():fallback,parent);if(stamp)node('small',new Date(stamp*1000).toLocaleTimeString(),cell);return cell;}
 async function loadHistory(){if(closed || view!=='history')return;if(historyPending){historyQueued=true;return;}historyPending=true;const version=historyVersion;
  try{const data=await api('alarms/history',{text:historySearch.value,from:historyFilterFrom,to:historyFilterTo,offset:historyOffset});if(closed || version!==historyVersion)return;
   historyCount.textContent=data.total?`${data.offset+1}–${Math.min(data.total,data.offset+data.items.length)} of ${data.total} occurrences`:'No alarm history';newer.disabled=data.offset===0;older.disabled=data.offset+data.items.length>=data.total;
   const signature=JSON.stringify(data);if(signature===historySignature)return;historySignature=signature;historyRows.replaceChildren();
   if(!data.items.length)node('td','No alarm history matches these filters.',node('tr',null,historyRows),{colSpan:4});
   for(const a of data.items){const row=node('tr',null,historyRows);historyTime(row,a.activated_at,'Not recorded');const cleared=historyTime(row,a.cleared_at,a.ended?'Not recorded':'Active');if(a.clear_reason && a.clear_reason!=='Condition cleared')node('small',a.clear_reason,cleared);
    const name=node('td',null,row);node('strong',a.alarm_name,name);if(a.message)node('small',a.message,name);
    const silenced=node('td',a.silenced_by?'Silenced by '+a.silenced_by:'Not silenced',row);if(a.silenced_at)node('small',new Date(a.silenced_at*1000).toLocaleString(),silenced);
   }
  }catch(e){if(!closed)showError(e.message);}finally{historyPending=false;if(historyQueued){historyQueued=false;loadHistory();}}
 }
 const columns=node('div',null,config,{className:'alarm-columns'}),left=node('section',null,columns,{className:'alarm-list-column'}),right=node('section',null,columns,{className:'alarm-editor-column'});
 node('h3','Alarms',left);const list=node('select',null,left,{size:12,className:'listbox alarm-list'});list.setAttribute('aria-label','Configured alarms');
 const listCommands=node('div',null,left,{className:'alarm-commands'});
 button('+ Add Alarm',listCommands,async()=>{if(!await allowed())return;selected='';draft={name:'',message:'',enabled:true,event:{tag:'',operator:'=',operand:{kind:'value',value:0},end_operand:{kind:'value',value:100}}};dirty=true;detail='alarm';list.value='';renderEditor();right.querySelector('input')?.focus();});
 const remove=button('Remove',listCommands,async()=>{if(!selected || saving)return;if(!await confirmMessage('Remove this alarm?',{title:'Remove Alarm?',confirmText:'Remove'}))return;await api('admin/alarms/remove',{id:selected});dirty=false;draft=null;selected='';await refresh();});
 list.onchange=async()=>{const id=list.value;if(!await allowed()){list.value=selected;return;}selected=id;draft=structuredClone(items.find(a=>a.id===id));dirty=false;renderEditor();};
 function changed(){dirty=true;showError();}
 function updateList(){const signature=JSON.stringify(items.map(a=>[a.id,a.name,a.enabled,a.state?.active,a.state?.quality]));if(signature===listSignature)return;listSignature=signature;const top=list.scrollTop;list.replaceChildren();for(const a of items)node('option',a.name+(!a.enabled?' — Disabled':a.state?.quality==='bad'?' — Tag unavailable':a.state?.active?' — Active':' — Normal'),list,{value:a.id});list.value=selected;list.scrollTop=top;}
 function renderActive(force=false){
  const decorated=items.map(a=>({...a,tagPath:tagName(a.event.tag)})),visible=filterActiveAlarms(decorated,search.value,filterFrom,filterTo),all=items.filter(a=>a.state?.active);
  activeButton.textContent=`Active Alarms (${all.length})`;count.textContent=`${visible.length} of ${all.length} active · ${all.filter(a=>!a.state.silenced_at).length} not silenced`;
  silenceAll.disabled=!all.some(a=>!a.state.silenced_at && a.canSilence!==false);
  const signature=JSON.stringify(visible.map(a=>[a.id,a.name,a.message,a.state,a.canSilence]));if(!force && signature===liveSignature)return;liveSignature=signature;
  rows.replaceChildren();
  if(!visible.length){node('td','No active alarms match these filters.',node('tr',null,rows),{colSpan:4});return;}
  for(const a of visible){const row=node('tr',null,rows),date=new Date(a.state.activated_at*1000),time=node('td',date.toLocaleDateString(),row);node('small',date.toLocaleTimeString(),time);
   const name=node('td',null,row);node('strong',a.name,name);node('small',a.message || a.name,name);
   const state=node('td',null,row);node('span','',state,{className:'alarm-dot active'});node('span',' Active',state);node('small',silenceLabel(a.state),state);
   if(a.state.silenced_at)node('small',new Date(a.state.silenced_at*1000).toLocaleString(),state);
   if(a.state.quality==='bad')node('small','Tag unavailable; last active state retained',state,{className:'bad'});
   const action=node('td',null,row),silence=button(a.state.silenced_at?'Silenced':'Silence',action,async()=>{silence.disabled=true;try{await api('alarms/silence',{id:a.id,occurrence:a.state.occurrence});await refresh();}catch(e){showError(e.message);liveSignature='';await refresh();}});silence.disabled=Boolean(a.state.silenced_at) || a.canSilence===false;if(a.canSilence===false)silence.title='Additional access roles are required to silence this alarm.';
  }
 }
 let stateBox,ruleBox;
 function showState(){if(!stateBox || !draft)return;const saved=items.find(a=>a.id===selected),state=saved?.state;stateBox.replaceChildren();node('span','',stateBox,{className:'alarm-dot'+(state?.active?' active':'')});node('strong',!draft.enabled?'Disabled':state?.quality==='bad'?'Tag unavailable':state?.active?'Active':selected?'Normal':'Not saved',stateBox);node('span','Current value: '+(saved?.current_value ?? '—'),stateBox);
  const event={...draft.event,tag:tagName(draft.event.tag),action:'alarm'};for(const key of ['operand','end_operand'])if(event[key]?.kind==='tag')event[key]={...event[key],tag:tagName(event[key].tag)};ruleBox.textContent=eventLabel(event).replace(/ → Alarm$/,'');}
 function renderEditor(){
  editorId=selected;right.replaceChildren();remove.disabled=!selected;stateBox=ruleBox=null;
  if(!draft){node('p','Add an alarm to configure its condition.',right,{className:'hint'});return;}
  const detailTabs=node('div',null,right,{className:'tabs alarms-tabs'}),alarmPanel=node('section',null,right),eventPanel=node('section',null,right),detailButtons=[];
  for(const [key,title]of [['alarm','Alarm'],['event','Event']])detailButtons.push([key,button(title,detailTabs,()=>{detail=key;showDetail();})]);
  function showDetail(){for(const[key,b]of detailButtons){b.setAttribute('aria-selected',String(detail===key));}alarmPanel.hidden=detail!=='alarm';eventPanel.hidden=detail!=='event';}showDetail();
  const name=input('Name',alarmPanel,'text',draft.name);name.required=true;name.maxLength=150;name.oninput=()=>{draft.name=name.value;changed();};
  const message=input('Alarm Message',alarmPanel,'text',draft.message);message.maxLength=2000;message.oninput=()=>{draft.message=message.value;changed();};
  let roles=getRoles();
  const roleLabel=()=> 'Silence Access Roles: '+((draft.requiredRoles || []).length?(draft.requiredRoles || []).map(id=>roles.find(role=>role.id===id)?.name || 'Missing role').join(', '):'Any signed-in user');
  const roleButton=button(roleLabel(),alarmPanel,async()=>{roles=await api('access/roles');const next=await pickAccessRoles(roles,draft.requiredRoles || []);if(next!==null){draft.requiredRoles=next;changed();roleButton.textContent=roleLabel();}});roleButton.className='alarm-roles-button';roleButton.title='All selected roles are required to silence. Administrators always have access.';
  const focused=input('Focused Alarm',alarmPanel,'checkbox');focused.checked=Boolean(draft.focused);focused.parentElement.className='checkbox-row';focused.onchange=()=>{draft.focused=focused.checked;changed();};
  const enabled=input('Enabled',alarmPanel,'checkbox');enabled.checked=draft.enabled;enabled.parentElement.className='checkbox-row';enabled.onchange=()=>{draft.enabled=enabled.checked;changed();showState();};
  tagSelect('Tag',eventPanel,draft.event.tag,value=>{draft.event.tag=value;changed();showState();});
  const conditionGroup=node('div',null,eventPanel,{className:'event-condition-group',role:'group'});conditionGroup.setAttribute('aria-label','Event condition');
  const comparison=node('select',null,node('label','Comparison',conditionGroup));for(const[value,title]of [['=','Equals'],['!=','Not Equal'],['<','Less Than'],['>','Greater Than'],['within_range','Within Range'],['out_of_range','Out Of Range']])node('option',title,comparison,{value});comparison.value=draft.event.operator;
  const operands=node('div',null,conditionGroup);
  // Refresh can replace the draft; handlers must resolve its current operand.
  function operand(label,key){const value=draft.event[key]??={kind:'value',value:0},group=node('div',null,operands,{className:'alarm-operand'}),mode=node('select',null,node('label',label+' type',group));for(const[k,title]of [['value','Value'],['tag','Tag']])node('option',title,mode,{value:k});mode.value=value.kind;mode.onchange=()=>{draft.event[key].kind=mode.value;changed();renderOperands();};if(value.kind==='tag')tagSelect(label,group,value.tag || '',tag=>{draft.event[key].tag=tag;changed();showState();});else{const box=input(label,group,'number',value.value??0);box.step='any';box.oninput=()=>{draft.event[key].value=box.value===''?null:Number(box.value);changed();showState();};}}
  function renderOperands(){operands.replaceChildren();const range=['within_range','out_of_range','range'].includes(draft.event.operator);operand(range?'Range Start':'Compare To','operand');if(range)operand('Range End','end_operand');showState();}
  comparison.onchange=()=>{draft.event.operator=comparison.value;changed();renderOperands();};renderOperands();
  node('p','This condition activates the alarm while it is true.',eventPanel,{className:'hint'});
  stateBox=node('div',null,right,{className:'alarm-current-state'});ruleBox=node('div',null,right,{className:'hint alarm-rule'});showState();
  const footer=node('div',null,right,{className:'alarm-commands alarm-editor-footer'});button('Revert',footer,()=>{dirty=false;draft=selected?structuredClone(items.find(a=>a.id===selected)):null;renderEditor();});button('Save Alarm',footer,save);
 }
 async function save(){if(!draft || saving)return false;saving=true;try{const result=await api('admin/alarms/save',draft);if(closed)return false;selected=result.id;dirty=false;await refresh();return true;}catch(e){showError(e.message);return false;}finally{saving=false;}}
 async function allowed(){if(saving)return false;if(!dirty)return true;const choice=await confirmPageLeave(draft?.name || 'this alarm');if(choice==='cancel')return false;if(choice==='save')return save();dirty=false;draft=selected?structuredClone(items.find(a=>a.id===selected)):null;return true;}
 async function switchView(next){if(next===view)return;if(!await allowed())return;view=next;renderViews();if(view==='config')renderEditor();if(view==='history')loadHistory();}
 function renderViews(){active.hidden=view!=='active';history.hidden=view!=='history';config.hidden=view!=='config';activeButton.setAttribute('aria-selected',String(view==='active'));historyButton.setAttribute('aria-selected',String(view==='history'));if(configButton){configButton.setAttribute('aria-selected',String(view==='config'));}}
 async function refresh(){if(pending || closed)return;pending=true;try{const data=await api('alarms');if(closed)return;items=data;if(canManage){if(!dirty){if(!items.some(a=>a.id===selected))selected=items[0]?.id || '';draft=selected?structuredClone(items.find(a=>a.id===selected)):null;}updateList();if(!right.children.length || editorId!==selected)renderEditor();else showState();}renderActive();}catch(e){if(!closed)showError(e.message);}finally{pending=false;}}
 renderViews();refresh();const timer=setInterval(()=>{if(document.visibilityState!=='hidden')refresh();},1000),historyTimer=setInterval(()=>{if(document.visibilityState!=='hidden' && view==='history')loadHistory();},5000);
 const beforeUnload=event=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
 const close=()=>{closed=true;clearInterval(timer);clearInterval(historyTimer);clearTimeout(historyDebounce);window.removeEventListener('beforeunload',beforeUnload);};close.isDirty=()=>dirty;close.beforeLeave=allowed;return close;
}
