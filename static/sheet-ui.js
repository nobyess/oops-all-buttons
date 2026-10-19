import {contextMenu,closeContextMenu} from './context-menu.js';
let cellClipboard=null;
import {displayValue} from './value-format.js';
export function adjacentSheetCell(address,key){
  const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[key];
  if(!delta)return null;
  const col=Math.max(0,Math.min(3,address.charCodeAt(0)-65+delta[0]));
  const row=Math.max(1,Math.min(15,Number(address.slice(1))+delta[1]));
  return String.fromCharCode(65+col)+row;
}
// Shared editable sheet and read-only cell picker. No spreadsheet logic runs here.
function el(tag,text,parent,attrs={}) {
  const element=document.createElement(tag);if(text!==null)element.textContent=text;
  Object.assign(element,attrs);parent?.append(element);return element;
}
export function mountSheetGrid(parent,{source,getSheet,onInterest,onSelect,autoRefresh=true,editable=false,onTag,getFilter=()=>'',beforeLeave=async()=>true,onSave=async()=>true,initialCell=null}) {
  const toolbar=el('div',null,parent,{className:'sheet-toolbar',hidden:!editable});
  const caption=el('strong','A1',toolbar);
  const formula=editable?el('input',null,toolbar,{type:'text',placeholder:'Value or =SUM(A1:A10)',className:'sheet-formula',disabled:true}):null;
  if(editable && onTag) {
    const insert=el('button','Insert Tag…',toolbar,{type:'button',disabled:true});
    insert.onclick=async()=>{const tag=await onTag();if(tag){const text='TAG("'+tag.replaceAll('"','""')+'")';formula.value=formula.value.startsWith('=')?formula.value+text:'='+text;commit();}};
  }
  const functions=editable?el('select',null,toolbar,{className:'sheet-functions',disabled:true}):null;
  if(functions){
    functions.setAttribute('aria-label','Insert function');el('option','Function…',functions,{value:''});
    functions.onchange=()=>{
      const name=functions.value;if(!name)return;
      const text=name+'(';let start,end;
      if(!formula.value.startsWith('=')){formula.value='=';start=end=1;}
      else {start=Math.max(1,formula.selectionStart ?? formula.value.length);end=Math.max(start,formula.selectionEnd ?? start);}
      formula.value=formula.value.slice(0,start)+text+formula.value.slice(end);
      const cursor=start+text.length;formula.focus();formula.setSelectionRange?.(cursor,cursor);functions.value='';commit();
    };
  }
  const status=el('p','',parent,{className:'hint',role:'status',hidden:true});
  const wrap=el('div',null,parent,{className:'sheet-scroll'}),table=el('table',null,wrap,{className:'sheet-grid'});
  const header=el('tr',null,el('thead',null,table));el('th','',header);
  for(const col of 'ABCD')el('th',col,header);
  const body=el('tbody',null,table),buttons=new Map(),cellElements=new Map();
  let selected='A1',cells={},samples={},closed=false,timer,pending=false,loaded=false,savedMessage='',baseline={},moving=false,locked=false;
  async function choose(address){
    if(moving || locked)return false;
    if(editable && address!==selected){
      moving=true;let allowed;try{allowed=await beforeLeave();}finally{moving=false;}
      if(!allowed){if(selected)formula.focus();return false;}
    }
    if(editable)commit();selected=address;caption.textContent=address;
    for(const [key,button] of buttons){button.setAttribute('aria-pressed',String(key===selected));cellElements.get(key).classList.toggle('sheet-selected',key===selected);}
    if(formula){formula.value=cells[selected]?.raw || '';updateInputs();}
    else onSelect?.(address);
    return true;
  }
  for(let row=1;row<=15;row++) {
    const tr=el('tr',null,body);el('th',String(row),tr);
    for(const col of 'ABCD') {
      const address=col+row,td=el('td',null,tr),button=el('button','',td,{type:'button',disabled:true});
      button.setAttribute('aria-label',address);buttons.set(address,button);cellElements.set(address,td);
      let referenceClick=false;
      if(editable){
        button.onpointerdown=event=>{
          referenceClick=event.button===0 && loaded && !locked && !moving && document.activeElement===formula && formula.value.startsWith('=');
          if(referenceClick)event.preventDefault(); // Keep the input caret before the button can take focus.
        };
        button.onpointercancel=()=>{referenceClick=false;};
      }
      button.onclick=()=>{
        if(referenceClick){
          referenceClick=false;
          const start=Math.max(1,formula.selectionStart ?? formula.value.length),end=Math.max(start,formula.selectionEnd ?? start);
          formula.value=formula.value.slice(0,start)+address+formula.value.slice(end);
          const cursor=start+address.length;formula.focus();formula.setSelectionRange?.(cursor,cursor);commit();return true;
        }
        return choose(address);
      };
      if(editable)button.oncontextmenu=async event=>{
        event.preventDefault();event.stopPropagation();
        const point={x:event.clientX,y:event.clientY};
        if(!await choose(address))return;
        button.focus();
        contextMenu(point,[
          {label:'Cut',run:()=>cellCommand('cut',address)},
          {label:'Copy',run:()=>cellCommand('copy',address)},
          {label:'Paste',disabled:cellClipboard===null,run:()=>cellCommand('paste',address)}
        ],{parent:parent.closest?.('dialog') || parent,label:'Cell commands'});
      };
      button.onkeydown=async event=>{
        if(!loaded || locked || event.isComposing || event.ctrlKey || event.metaKey || event.altKey)return;
        if(editable && event.key==='Delete'){
          event.preventDefault();event.stopPropagation?.();
          if(!event.repeat)await cellCommand('clear',address);return;
        }
        const next=adjacentSheetCell(address,event.key);
        if(next){
          event.preventDefault();
          if(!buttons.get(next)?.disabled && await choose(next))buttons.get(next).focus();
          return;
        }
        if(!editable || event.key.length!==1)return;
        event.preventDefault();if(!await choose(address))return;formula.value=event.key;formula.focus();formula.setSelectionRange?.(formula.value.length,formula.value.length);commit();
      };
    }
  }
  async function cellCommand(command,address=selected){
    if(!editable || !address || locked || !loaded)return false;
    if(!await choose(address))return false;
    commit();
    if(command==='copy' || command==='cut')cellClipboard=cells[address]?.raw || '';
    if(command==='copy'){buttons.get(address)?.focus();return true;}
    if(command==='paste' && cellClipboard===null)return false;
    formula.value=command==='paste'?cellClipboard:'';commit();
    try{const saved=await onSave();if(saved)buttons.get(address)?.focus();return saved;}
    catch(error){savedMessage=error.message;status.textContent=savedMessage;status.hidden=false;return false;}
  }
  function commit(){if(formula && loaded && selected){if((cells[selected]?.raw || '')!==formula.value){savedMessage='';status.hidden=true;}cells[selected]={raw:formula.value};}}
  if(formula)formula.oninput=commit;
  function updateInputs(){
    if(formula)formula.disabled=locked || !loaded || !selected;
    if(functions)functions.disabled=locked || !loaded || !selected;
    for(const button of toolbar.querySelectorAll('button'))button.disabled=locked || !loaded || !selected;
  }
  function paint() {
    for(const [address,button] of buttons) {
      const sample=samples[address];button.textContent=sample?.quality==='good'?displayValue(sample.value):'#ERROR';
      button.title=sample?.quality==='bad'?sample.error:address+(editable?' · '+(cells[address]?.raw || ''):'');
      button.classList.toggle('sheet-cell-error',sample?.quality==='bad');
      const hasTag=/^\s*=/.test(cells[address]?.raw || '') && /\bTAG\s*\(/i.test(cells[address]?.raw || '');
      button.classList.toggle('sheet-cell-tag',hasTag);
      button.classList.toggle('sheet-cell-live',hasTag && sample?.quality==='good');
      const search=getFilter().trim().toLowerCase();
      button.disabled=!loaded || locked || Boolean(search && !`${address} ${displayValue(sample?.value)} ${source.name || source.id}`.toLowerCase().includes(search));
    }
  }
  async function poll(){
    if(closed || pending)return;
    if(autoRefresh && document.visibilityState==='hidden'){timer=setTimeout(poll,Math.max(100,Number(source.settings.live || .5)*1000));return;}
    pending=true;
    let delay=Math.max(100,Number(source.settings.live || .5)*1000);
    try {
      const data=await getSheet(source.id);if(closed)return;
      if(!loaded){cells=data.cells;baseline=JSON.parse(JSON.stringify(cells));loaded=true;if(formula){formula.value=cells[selected]?.raw || '';formula.disabled=locked;}for(const button of toolbar.querySelectorAll('button'))button.disabled=locked;
        if(functions){for(const name of data.functions || [])el('option',name,functions,{value:name});functions.disabled=locked;}
        if(initialCell && buttons.has(initialCell))await choose(initialCell);
      }
      samples=data.values;delay=Math.max(100,data.live*1000);paint();status.hidden=!savedMessage;status.textContent=savedMessage;
    } catch(error){status.hidden=false;status.textContent=error.message;}
    finally {pending=false;if(!closed && autoRefresh)timer=setTimeout(poll,delay);}
  }
  if(autoRefresh)onInterest?.(source.id,true);poll();
  return {
    toolbar,formula,cellCommand,
    setLocked(value){locked=value;updateInputs();paint();},
    isDirty(){commit();return [...new Set([...Object.keys(cells),...Object.keys(baseline)])].some(key=>(cells[key]?.raw || '')!==(baseline[key]?.raw || ''));},
    selectedCell(){return selected;},
    focusSelected(){buttons.get(selected)?.focus();},
    revertSelected(){
      if(selected)cells[selected]=baseline[selected]?JSON.parse(JSON.stringify(baseline[selected])):{raw:''};
      selected=null;caption.textContent='';formula.value='';savedMessage='';status.hidden=true;
      for(const [key,button] of buttons){button.setAttribute('aria-pressed','false');cellElements.get(key).classList.toggle('sheet-selected',false);}
      document.activeElement?.blur?.();updateInputs();
    },
    showError(message){savedMessage=message;status.textContent=message;status.hidden=false;},
    getCells(){commit();return cells;},
    setData(data){cells=data.cells;baseline=JSON.parse(JSON.stringify(cells));samples=data.values;loaded=true;if(formula)formula.value=cells[selected]?.raw || '';paint();
      const errors=Object.entries(samples).filter(([address,sample])=>buttons.has(address) && sample.quality==='bad');
      savedMessage=errors.length?`Saved with ${errors.length} cell error(s). ${errors[0][0]}: ${errors[0][1].error}`:'';status.textContent=savedMessage;status.hidden=!savedMessage;},
    close(){closed=true;closeContextMenu();clearTimeout(timer);if(autoRefresh)onInterest?.(source.id,false);}
  };
}
export function confirmSheetSave(address) {
  return new Promise(resolve=>{
    const modal=el('dialog',null,document.body,{className:'sheet-save-confirm designer-dialog'});
    el('h2','Save changes?',modal);
    el('p',`Save and validate changes to ${address} before continuing? Cancel keeps editing; Revert restores the last saved contents.`,modal);
    const footer=el('div',null,modal,{className:'row sheet-footer dialog-footer'});
    function finish(answer){modal.close();modal.remove();resolve(answer);}
    el('button','Revert',footer,{type:'button',className:'sheet-revert'}).onclick=()=>finish('revert');
    el('button','Cancel',footer,{type:'button'}).onclick=()=>finish(false);
    el('button','Save and Continue',footer,{type:'button'}).onclick=()=>finish(true);
    modal.oncancel=event=>{event.preventDefault();finish(false);};modal.showModal();
  });
}
export function openSheetDialog({source,getSheet,saveSheet,onInterest,onTag,readOnly=false,confirmSave=confirmSheetSave}) {
  return new Promise(resolve=>{
    const modal=el('dialog',null,document.body,{className:'sheet-dialog designer-dialog'});
    el('h2',(readOnly?'Select cell — ':'Edit sheet — ')+(source.name || source.id),modal);
    let selected=null,finished=false,saving=null;
    const grid=mountSheetGrid(modal,{source,getSheet,onInterest,editable:!readOnly,onTag,
      beforeLeave:()=>saveChanges(true),onSave:()=>saveChanges(),onSelect:address=>{selected=address;confirm.disabled=false;}});
    const footer=el('div',null,modal,{className:'row sheet-footer dialog-footer'}),cancel=el('button',readOnly?'Cancel':'Close',footer,{type:'button'});
    const confirm=readOnly?el('button','Confirm',footer,{type:'button',disabled:true}):null;
    function warnUnload(event){if(!readOnly && grid.isDirty()){event.preventDefault();event.returnValue='';}}
    window.addEventListener('beforeunload',warnUnload);
    function finish(value){if(finished)return;finished=true;window.removeEventListener('beforeunload',warnUnload);grid.close();modal.close();modal.remove();resolve(value);}
    modal.onclose=()=>finish(null);
    async function saveChanges(ask=false) {
      if(readOnly || !grid.isDirty())return true;
      if(saving)return saving;
      if(ask){
        const answer=await confirmSave(grid.selectedCell());
        if(answer==='revert'){grid.revertSelected();return false;}
        if(!answer)return false;
      }
      grid.setLocked(true);
      saving=(async()=>{
        try{grid.setData(await saveSheet(source.id,grid.getCells()));return true;}
        catch(error){grid.showError(error.message);grid.formula.focus();return false;}
      })().finally(()=>{grid.setLocked(false);saving=null;});
      return saving;
    }
    async function close(){if(await saveChanges(true))finish(null);}
    cancel.onclick=close;modal.oncancel=event=>{event.preventDefault();close();};
    if(confirm)confirm.onclick=()=>finish(selected);
    if(grid.formula)grid.formula.onkeydown=event=>{
      if(event.isComposing)return;
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();
        grid.revertSelected();
      } else if(event.key==='Enter'){
        event.preventDefault();saveChanges().then(saved=>{if(saved)grid.focusSelected();});
      }
    };
    modal.showModal();
  });
}
