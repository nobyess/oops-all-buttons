import {categoryInput} from './category-input.js';
import {assetNode as node,assetKinds,assetAccept,assetPreview,assetSize,filterAssets,saveAssetFile} from './asset-ui.js';
import {closeIcon} from './close-icon.js';
export function openContentPicker({api,kind,value=''}){
 if(!Object.hasOwn(assetKinds,kind))return Promise.reject(Error('Choose a content type'));
 return new Promise(resolve=>{
  const previous=document.activeElement,modal=node('dialog',null,document.body,{className:'designer-dialog content-picker'});
  modal.setAttribute('aria-label','Select '+assetKinds[kind]);
  const heading=node('div',null,modal,{className:'content-picker-heading'});node('h2','Select '+assetKinds[kind],heading);
  const close=node('button',null,heading,{type:'button',className:'asset-close'});close.setAttribute('aria-label','Close');close.append(closeIcon());
  const tabs=node('div',null,modal,{className:'tabs'}),panels={},tabButtons={};let tab='Asset Center',items=[],selected=null,busy=false,finished=false,previewCleanup=()=>{},tileCleanups=[];
  for(const title of ['Asset Center','Choose File']){
   tabButtons[title]=node('button',title,tabs,{type:'button'});tabButtons[title].setAttribute('role','tab');
   tabButtons[title].onclick=()=>switchTab(title);panels[title]=node('section',null,modal);
  }
  tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Content source');
  const filters=node('div',null,panels['Asset Center'],{className:'asset-filters'});
  const filter=node('input',null,filters,{type:'search',placeholder:'Filter assets or filenames…'});filter.setAttribute('aria-label','Filter assets');
  const category=node('select',null,filters);category.setAttribute('aria-label','Category');node('option','All categories',category,{value:''});
  const grid=node('div',null,panels['Asset Center'],{className:'asset-picker-grid'});grid.setAttribute('role','listbox');grid.setAttribute('aria-label',assetKinds[kind]);
  const details=node('div',null,panels['Asset Center'],{className:'asset-picker-selection'}),chosen=node('strong','Select an asset',details),description=node('span','',details,{className:'hint'});
  const field=(label,type,host)=>{const wrap=node('label',label,host,{className:'asset-field'});return node('input',null,wrap,{type});};
  const file=field('File','file',panels['Choose File']);file.accept=assetAccept[kind];
  const name=field('Name','text',panels['Choose File']),newCategory=categoryInput(panels['Choose File']);
  node('p',`${assetKinds[kind]} · Up to ${kind==='movie'?25:5} MiB · Added to Asset Center for reuse`,panels['Choose File'],{className:'hint'});
  if(kind==='symbol')node('p','DXF: solid hatch = Fore Color; patterned hatch = Back Color. Layers stack by name.',panels['Choose File'],{className:'hint'});
  const status=node('p','Loading assets…',modal,{role:'status',className:'asset-status'}),footer=node('div',null,modal,{className:'row dialog-footer'});
  const cancel=node('button','Cancel',footer,{type:'button'}),use=node('button','Use Asset',footer,{type:'button',disabled:true});use.dataset.dialogDefault='true';
  function finish(result){if(finished)return;finished=true;tileCleanups.forEach(close=>close());previewCleanup();modal.close();modal.remove();if(previous?.isConnected)previous.focus({preventScroll:true});resolve(result);}
  function switchTab(title){tab=title;for(const key of Object.keys(panels)){panels[key].hidden=key!==title;tabButtons[key].classList.toggle('active',key===title);tabButtons[key].setAttribute('aria-selected',String(key===title));}use.textContent=tab==='Choose File'?'Use File':'Use Asset';use.disabled=busy||(tab==='Choose File'?!file.files?.length:!selected);}
  function render(){
   tileCleanups.forEach(close=>close());tileCleanups=[];grid.replaceChildren();
   const matching=filterAssets(items,filter.value,category.value,kind);
   for(const item of matching){
    const tile=node('button',null,grid,{type:'button',className:'asset-tile',disabled:busy});tile.setAttribute('role','option');tile.setAttribute('aria-selected',String(selected?.id===item.id));
    const image=node('div',null,tile,{className:'asset-artwork'});image.setAttribute('aria-hidden','true');tileCleanups.push(assetPreview(image,item,{thumbnail:true}));
    node('span',item.name,tile);node('small',item.category+(item.builtin?' · Built-in':''),tile);
    tile.onclick=()=>{selected=item;chosen.textContent=item.name;description.textContent=item.category+' · '+assetSize(item.size);for(const button of grid.children)if(button.tagName.toLowerCase()==='button')button.setAttribute('aria-selected',String(button===tile));switchTab(tab);};tile.ondblclick=()=>{selected=item;confirm();};tile.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();tile.onclick();confirm();}};
   }
   if(!matching.length)node('p','No matching assets.',grid,{className:'hint'});
  }
  async function confirm(){
   if(busy)return;if(tab==='Asset Center'&&!selected)return;if(tab==='Choose File'&&(!file.files?.length||!name.value.trim()||!newCategory.value.trim())){status.textContent='Choose a file, name and category.';return;}
   busy=true;use.disabled=true;status.textContent='Preparing content…';
   try{let result=tab==='Choose File'?await saveAssetFile(api,file.files[0],kind,{name:name.value.trim(),category:newCategory.value.trim()}):selected.builtin?await api('assets/import-builtin',{id:selected.id}):selected;if(!finished)finish(result);}
   catch(error){if(!finished)status.textContent=error.message;}finally{busy=false;if(!finished){render();switchTab(tab);}}
  }
  filter.oninput=category.onchange=render;
  file.onchange=()=>{if(file.files?.[0])name.value=file.files[0].name.replace(/\.[^.]+$/,'');switchTab(tab);};
  cancel.onclick=close.onclick=()=>finish(null);modal.oncancel=event=>{event.preventDefault();finish(null);};modal.onclose=()=>finish(null);use.onclick=confirm;
  switchTab(tab);modal.showModal();
  api('assets').then(data=>{if(finished)return;newCategory.setCategories(data.map(item=>item.category));items=data.filter(item=>item.kind===kind);for(const title of [...new Set(items.map(item=>item.category))].sort())node('option',title,category,{value:title});selected=items.find(item=>item.url===value||item.id===value.split('/').at(-1)?.split('?')[0])||null;if(selected){chosen.textContent=selected.name;description.textContent=selected.category+' · '+assetSize(selected.size);}status.textContent='';render();switchTab(tab);}).catch(error=>{if(!finished)status.textContent=error.message;});
 });
}
