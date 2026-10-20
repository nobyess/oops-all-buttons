import {categoryInput} from './category-input.js';
import {assetNode as node,assetKinds,assetAccept,assetPreview,assetSize,filterAssets,saveAssetFile} from './asset-ui.js';
import {closeIcon} from './close-icon.js';
import {buttonIcons} from './button-icons.js';
import {makeDialogMovable} from './movable-dialog.js';
export function openContentPicker({api,kind,value='',kinds}){
 const pickerKinds={icon:'Icons',...assetKinds},allowed=kinds||[kind];
 if(!allowed.length||allowed.some(type=>!Object.hasOwn(pickerKinds,type))||!allowed.includes(kind))return Promise.reject(Error('Choose a content type'));
 return new Promise(resolve=>{
  const previous=document.activeElement,modal=node('dialog',null,document.body,{className:'designer-dialog content-picker'});
  const title=allowed.length>1?'Select Content':'Select '+pickerKinds[kind];
  modal.setAttribute('aria-label',title);
  const heading=node('div',null,modal,{className:'content-picker-heading floating-window-caption'});node('h2',title,heading);
  const close=node('button',null,heading,{type:'button',className:'asset-close'});close.setAttribute('aria-label','Close');close.append(closeIcon());
  const tabs=node('div',null,modal,{className:'tabs'}),panels={},tabButtons={};let tab='Asset Center',items=[],selected=null,busy=false,finished=false,previewCleanup=()=>{},tileCleanups=[],stopMoving=()=>{};
  for(const title of ['Asset Center','Choose File']){
   tabButtons[title]=node('button',title,tabs,{type:'button'});tabButtons[title].setAttribute('role','tab');
   tabButtons[title].onclick=()=>switchTab(title);panels[title]=node('section',null,modal);
  }
  tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Content source');
  const filters=node('div',null,panels['Asset Center'],{className:'asset-filters'});
  const filter=node('input',null,filters,{type:'search',placeholder:'Filter assets or filenames…'});filter.setAttribute('aria-label','Filter assets');
  const type=allowed.length>1?node('select',null,filters):null;
  if(type){type.setAttribute('aria-label','Content type');for(const key of allowed)node('option',pickerKinds[key],type,{value:key});type.value=kind;filters.classList.add('asset-filters-with-type');}
  const category=node('select',null,filters);category.setAttribute('aria-label','Category');node('option','All categories',category,{value:''});
  const grid=node('div',null,panels['Asset Center'],{className:'asset-picker-grid'});grid.setAttribute('role','listbox');grid.setAttribute('aria-label',pickerKinds[kind]);
  const details=node('div',null,panels['Asset Center'],{className:'asset-picker-selection'}),chosen=node('strong','Select an asset',details),description=node('span','',details,{className:'hint'});
  const field=(label,type,host)=>{const wrap=node('label',label,host,{className:'asset-field'});return node('input',null,wrap,{type});};
  const file=field('File','file',panels['Choose File']);file.accept=assetAccept[kind];
  const name=field('Name','text',panels['Choose File']),newCategory=categoryInput(panels['Choose File']);
  const uploadHint=node('p','',panels['Choose File'],{className:'hint'});
  const symbolHint=node('p','DXF: solid hatch = Fore Color; patterned hatch = Back Color. Layers stack by name.',panels['Choose File'],{className:'hint'});
  const status=node('p','Loading assets…',modal,{role:'status',className:'asset-status'}),footer=node('div',null,modal,{className:'row dialog-footer'});
  const cancel=node('button','Cancel',footer,{type:'button'}),use=node('button','Use Asset',footer,{type:'button',disabled:true});use.dataset.dialogDefault='true';
  function finish(result){if(finished)return;finished=true;stopMoving();tileCleanups.forEach(close=>close());previewCleanup();modal.close();modal.remove();if(previous?.isConnected)previous.focus({preventScroll:true});resolve(result);}
  function switchTab(title){tab=title;for(const key of Object.keys(panels)){panels[key].hidden=key!==title;tabButtons[key].classList.toggle('active',key===title);tabButtons[key].setAttribute('aria-selected',String(key===title));}use.textContent=tab==='Choose File'?'Use File':kind==='icon'?'Use Icon':'Use Asset';use.disabled=busy||(tab==='Choose File'?!file.files?.length:!selected);stopMoving.reposition?.();}
  function setupKind(){
   category.replaceChildren();node('option','All categories',category,{value:''});category.value='';
   for(const name of [...new Set(items.filter(item=>item.kind===kind).map(item=>item.category))].sort())node('option',name,category,{value:name});
   file.accept=assetAccept[kind]||'';file.value='';tabButtons['Choose File'].hidden=kind==='icon';
   uploadHint.textContent=`${pickerKinds[kind]} · Up to ${kind==='movie'?25:5} MiB · Added to Asset Center for reuse`;symbolHint.hidden=kind!=='symbol';
   grid.setAttribute('aria-label',pickerKinds[kind]);
   chosen.textContent=selected?.name||'Select an asset';description.textContent=selected?selected.category+(kind==='icon'?'':' · '+assetSize(selected.size)):'';
   render();switchTab('Asset Center');
  }
  function render(){
   tileCleanups.forEach(close=>close());tileCleanups=[];grid.replaceChildren();
   const matching=filterAssets(items,filter.value,category.value,kind);
   for(const item of matching){
    const tile=node('button',null,grid,{type:'button',className:'asset-tile',disabled:busy});tile.setAttribute('role','option');tile.setAttribute('aria-selected',String(selected?.id===item.id));
    const image=node('div',null,tile,{className:'asset-artwork'});image.setAttribute('aria-hidden','true');tileCleanups.push(assetPreview(image,item,{thumbnail:true}));
    node('span',item.name,tile);node('small',item.category+(item.builtin?' · Built-in':''),tile);
    tile.onclick=()=>{selected=item;chosen.textContent=item.name;description.textContent=item.category+(item.kind==='icon'?'':' · '+assetSize(item.size));for(const button of grid.children)if(button.tagName.toLowerCase()==='button')button.setAttribute('aria-selected',String(button===tile));switchTab(tab);};tile.ondblclick=()=>{selected=item;confirm();};tile.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();tile.onclick();confirm();}};
   }
   if(!matching.length)node('p','No matching assets.',grid,{className:'hint'});
   stopMoving.reposition?.();
  }
  async function confirm(){
   if(busy)return;if(tab==='Asset Center'&&!selected)return;if(tab==='Choose File'&&(!file.files?.length||!name.value.trim()||!newCategory.value.trim())){status.textContent='Choose a file, name and category.';return;}
   busy=true;use.disabled=true;status.textContent='Preparing content…';
   try{let result=tab==='Choose File'?await saveAssetFile(api,file.files[0],kind,{name:name.value.trim(),category:newCategory.value.trim()}):selected.kind==='icon'?selected:selected.builtin?await api('assets/import-builtin',{id:selected.id}):selected;if(!finished)finish(result);}
   catch(error){if(!finished)status.textContent=error.message;}finally{busy=false;if(!finished){render();switchTab(tab);}}
  }
  filter.oninput=category.onchange=render;
  if(type)type.onchange=()=>{kind=type.value;selected=null;setupKind();};
  file.onchange=()=>{if(file.files?.[0])name.value=file.files[0].name.replace(/\.[^.]+$/,'');switchTab(tab);};
  cancel.onclick=close.onclick=()=>finish(null);modal.oncancel=event=>{event.preventDefault();finish(null);};modal.onclose=()=>finish(null);use.onclick=confirm;
  switchTab(tab);modal.showModal();stopMoving=makeDialogMovable(modal,heading);
  const icons=allowed.includes('icon')?buttonIcons.map(item=>({...item,kind:'icon',filename:'',builtin:true})):[];
  items=icons;setupKind();
  api('assets').then(data=>{if(finished)return;newCategory.setCategories(data.map(item=>item.category));items=[...icons,...data.filter(item=>allowed.includes(item.kind))];selected=items.find(item=>item.kind===kind&&(item.url===value||item.id===value||item.id===value.split('/').at(-1)?.split('?')[0]))||null;status.textContent='';setupKind();}).catch(error=>{if(!finished)status.textContent=error.message;});
 });
}
