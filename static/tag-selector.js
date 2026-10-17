import {contextMenu} from './context-menu.js';
import {displayValue} from './value-format.js';
import {mountSheetGrid} from './sheet-ui.js';
import {refreshPolicy} from './refresh-policy.js';
// Reusable tag picker. This module has no dependency on the page editor.
// Cancel returns null and leaves the caller's selection unchanged.
function element(tag, text, parent, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== null) node.textContent = text;
  Object.assign(node, attributes);
  parent?.append(node);
  return node;
}
// User-facing paths use display names, never device network routes or internal IDs.
export function tagPath(tag) {
  return `${tag.source_name || tag.source}\\${tag.name || tag.address || tag.id}`;
}

// Shared friendly reference for picker summaries and fields.
export function tagDisplayName(tag) {
  return tagPath(tag);
}

let copiedTagReference='';
export function copyTagReference(id){copiedTagReference=id || '';}
export function pasteTagReference(tags){return tags.some(tag=>tag.id===copiedTagReference)?copiedTagReference:null;}

const pickerStateKey='python-hmi.tag-selector.v1';
function pickerState(){try{return JSON.parse(localStorage.getItem(pickerStateKey)) || {};}catch{return {};}}
function rememberPicker(state){try{localStorage.setItem(pickerStateKey,JSON.stringify(state));}catch{/* Storage may be disabled. */}}
export function openTagSelector({value = '', getSources, getTags, getValues, onInterest, getSheet, onSheetInterest, ensureSheetTag}) {
  return new Promise(resolve => {
    const remembered=pickerState(),sheetCells={...remembered.sheetCells};
    const modal = element('dialog', null, document.body, {className: 'tag-selector'});
    element('h2', 'Select Tag', modal);
    const sheetSources=getSources().filter(source=>source.kind==='sheet');
    const filterLabel = element('label', null, modal);
    const filter = element('input', null, filterLabel, {type: 'search', placeholder: 'Filter tags: Name, address, or source...'});
    filter.value=typeof remembered.filter==='string'?remembered.filter:'';
    filter.setAttribute('aria-label','Filter tags');
    const columns = element('div', null, modal, {className: 'tag-selector-columns'});
    const sourceLabel = element('div', null, columns, {className:'tag-source-column'});
    element('div','Sources',sourceLabel,{className:'tag-source-heading'});
    const sources={value:getSources().some(source=>source.id===remembered.source)?remembered.source:''},sourceButtons=[];
    const sourceList=element('div',null,sourceLabel,{className:'tag-source-list',role:'group'});
    sourceList.setAttribute('aria-label','Sources');
    function sourceButton(source,parent) {
      const id=source?.id || '';
      const button=element('button',source?.name || source?.id || 'All Sources',parent,{type:'button',className:'tag-source-button'});
      if(!source)button.className+=' tag-source-all';
      sourceButtons.push([button,id]);
      button.onclick=()=>{
        sources.value=id;selected='';onInterest?.('');
        refreshSources();renderTags();poll();
      };
    }
    for(const source of getSources().filter(source=>source.kind==='parameters'))sourceButton(source,sourceList);
    let sheetGroup=null;
    if(sheetSources.length && getSheet) {
      sheetGroup=element('details',null,sourceList,{className:'tag-source-sheets'});
      element('summary','Sheets',sheetGroup);
      const children=element('div',null,sheetGroup,{className:'tag-source-children'});
      for(const source of sheetSources)sourceButton(source,children);
    }
    sourceButton(null,sourceList);
    for(const source of getSources().filter(source=>source.kind!=='sheet' && source.kind!=='parameters'))sourceButton(source,sourceList);
    function refreshSources(){for(const [button,id] of sourceButtons)button.setAttribute('aria-pressed',String(id===sources.value));}
    const tagLabel = element('label', 'Tags', columns);
    const tags = element('select', null, tagLabel, {size: 12, className: 'listbox'});
    const sheetPanel=element('div',null,columns,{className:'sheet-picker-panel',hidden:true});
    let sheetGrid=null,activeSheet=null,pendingCell=null,sheetSamples={};
    const empty = element('p', '', tagLabel, {className: 'hint'});
    const footer = element('div', null, modal, {className: 'tag-selector-footer'});
    const selection = element('div', null, footer);
    const selectedName = element('strong', '', selection);
    const currentValue = element('p', '', selection, {role: 'status'});
    const buttons = element('div', null, footer, {className: 'row'});
    const cancel = element('button', 'Cancel', buttons, {type: 'button'});
    const confirm = element('button', 'Confirm', buttons, {type: 'button'});
    let selected = value || (getTags().some(tag=>tag.id===remembered.selected)?remembered.selected:''), samples = {}, finished = false, polling = false;
    const initialSource=getSources().find(source=>source.id===getTags().find(tag=>tag.id===selected)?.source);
    if(value && initialSource){
      sources.value=initialSource.id;
      const current=getTags().find(tag=>tag.id===value);
      if(!`${tagDisplayName(current)} ${tagPath(current)} ${current.address} ${current.description || ''}`.toLowerCase().includes(filter.value.trim().toLowerCase()))filter.value='';
    }
    else if(selected && !sources.value && initialSource)sources.value=initialSource.id;
    if(sheetGroup)sheetGroup.open=Boolean(remembered.sheetsOpen || getSources().find(source=>source.id===sources.value)?.kind==='sheet');
    refreshSources();

    function refreshFooter() {
      const tag = pendingCell?{name:pendingCell.address,source:pendingCell.source.id,source_name:pendingCell.source.name,address:pendingCell.address,path:(pendingCell.source.name || pendingCell.source.id)+'\\'+pendingCell.address}:getTags().find(tag => tag.id === selected);
      selectedName.textContent = tag ? tagDisplayName(tag) : 'No tag selected';
      const sample = pendingCell?sheetSamples[pendingCell.address]:samples[selected];
      currentValue.textContent = !tag ? 'Current value: —'
        : sample?.quality === 'good' ? `Current value: ${displayValue(sample.value)}`
        : 'Current value: unavailable';
      confirm.disabled = !tag;
    }
    function renderTags() {
      sheetGrid?.close();sheetGrid=null;activeSheet=null;pendingCell=null;sheetPanel.replaceChildren();
      const source=sheetSources.find(source=>source.id===sources.value);
      sheetPanel.hidden=source?.kind!=='sheet' || !getSheet;tagLabel.hidden=!sheetPanel.hidden;
      if(!sheetPanel.hidden) {
        activeSheet=source;
        sheetGrid=mountSheetGrid(sheetPanel,{source,initialCell:sheetCells[source.id],onInterest:onSheetInterest,getFilter:()=>filter.value,
          getSheet:async id=>{const data=await getSheet(id);sheetSamples=data.values;for(const tag of getTags().filter(tag=>tag.source===id))samples[tag.id]=data.values[tag.address];refreshFooter();return data;},
          onSelect:address=>{pendingCell={source,address};sheetCells[source.id]=address;refreshFooter();}});
        refreshFooter();return;
      }
      tags.replaceChildren();
      const search = filter.value.trim().toLowerCase();
      const sheetIds=new Set(sheetSources.map(source=>source.id));
      const matches = getTags().filter(tag => !sheetIds.has(tag.source) && (!sources.value || tag.source === sources.value)
        && `${tagDisplayName(tag)} ${tagPath(tag)} ${tag.address} ${tag.description || ""}`.toLowerCase().includes(search));
      for (const tag of matches) element('option', sources.value?(tag.name || tag.address || tag.id):tagDisplayName(tag), tags, {value: tag.id});
      tags.value = selected;
      empty.textContent = matches.length ? `${matches.length} tag(s)` : 'No matching tags.';
      refreshFooter();
    }
    async function poll() {
      if (polling || finished || activeSheet) return;
      polling = true;
      try { samples = await getValues(); }
      catch { samples = {}; }
      finally { polling = false; if (!finished) refreshFooter(); }
    }
    function finish(result) {
      if (finished) return;
      const scroll=sheetPanel.querySelector('.sheet-scroll');
      rememberPicker({source:sources.value,filter:filter.value,selected,sheetsOpen:Boolean(sheetGroup?.open),sheetCells,
        sourceScroll:sourceList.scrollTop,tagScroll:tags.scrollTop,sheetScroll:scroll?{source:sources.value,left:scroll.scrollLeft,top:scroll.scrollTop}:remembered.sheetScroll});
      finished = true;sheetGrid?.close();
      onInterest?.('');
      clearInterval(timer);
      modal.close(); modal.remove(); resolve(result);
    }
    filter.oninput = renderTags;
    tags.onchange = () => {pendingCell=null;selected = tags.value; onInterest?.(selected); refreshFooter();};
    tags.ondblclick = () => {if (!confirm.disabled) finish(selected);};
    confirm.onclick = async () => {
      confirm.disabled=true;
      try{const id=pendingCell?await ensureSheetTag(pendingCell.source,pendingCell.address):selected;finish(id);}
      catch(error){currentValue.textContent=error.message;confirm.disabled=false;}
    };
    cancel.onclick = () => finish(null);
    modal.oncancel = event => {event.preventDefault(); finish(null);};
    const timer = setInterval(poll, refreshPolicy.tagSelector);
    onInterest?.(initialSource?.kind==='sheet'?'':selected);
    renderTags(); modal.showModal(); filter.focus();
    sourceList.scrollTop=Number(remembered.sourceScroll)||0;tags.scrollTop=Number(remembered.tagScroll)||0;
    const scroll=sheetPanel.querySelector('.sheet-scroll');
    if(scroll && remembered.sheetScroll?.source===sources.value){scroll.scrollLeft=Number(remembered.sheetScroll.left)||0;scroll.scrollTop=Number(remembered.sheetScroll.top)||0;}
    poll();
  });
}

export function tagPicker(parent, {label, value = '', onChange, hideLabel=false, ...providers}) {
  const wrapper = element('label', hideLabel?null:label, parent);
  const row = element('div', null, wrapper, {className: 'tag-picker-field'});
  const display = id => {const tag=providers.getTags().find(tag=>tag.id===id);return tag?tagDisplayName(tag):(id || 'Select tag…');};
  const box = element('button', display(value), row, {type: 'button', className: 'tag-picker-box'});
  box.setAttribute('aria-haspopup', 'dialog');
  if(hideLabel)box.setAttribute('aria-label',label);
  const clear = element('button', '×', row, {type: 'button', title: 'Clear tag selection'});
  clear.setAttribute('aria-label', 'Clear ' + label);
  function setValue(next) {value = next; box.textContent = display(value); onChange?.(value);}
  box.onclick = async () => {
    const selected = await openTagSelector({value, ...providers});
    if (selected !== null) setValue(selected);
  };
  clear.onclick = () => setValue('');
  box.oncontextmenu=event=>{
    event.preventDefault();event.stopPropagation();
    const next=pasteTagReference(providers.getTags());
    contextMenu({x:event.clientX,y:event.clientY},[
      {label:'Copy Tag',disabled:!value,run:()=>copyTagReference(value)},
      {label:'Paste Tag',disabled:next===null,run:()=>setValue(next)}
    ],{parent:box.closest('dialog') || document.body,label:'Tag commands'});
  };
  box.onkeydown=event=>{
    if(!(event.ctrlKey || event.metaKey))return;
    if(event.key.toLowerCase()==='c'){event.preventDefault();if(value)copyTagReference(value);}
    if(event.key.toLowerCase()==='v'){event.preventDefault();const next=pasteTagReference(providers.getTags());if(next!==null)setValue(next);}
  };
  return box;
}
