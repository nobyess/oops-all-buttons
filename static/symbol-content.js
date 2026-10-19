// Symbol inspector Content only. Library choices use the normal embedded-image import.
import {imageFileData} from './clipboard-image.js';
const states=new WeakMap();
export function libraryAssetURL(file){
  if(typeof file!=='string' || !/^assets\/[A-Za-z0-9_-]+\.svg$/.test(file))throw new Error('Invalid library symbol path');
  return '/symbols/'+file;
}
export function filterSymbols(items,query='',category=''){
  query=query.trim().toLocaleLowerCase();
  return items.filter(item=>(!category || item.category===category) && `${item.name} ${item.category}`.toLocaleLowerCase().includes(query))
    .sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name));
}
export function mountSymbolContent(parent,{control,importSymbol,clear,rotate,safe}){
  const state=states.get(control)||{tab:'Library',query:'',category:''};states.set(control,state);
  const add=(tag,text,host=parent,className='')=>{const el=document.createElement(tag);if(text!==null)el.textContent=text;if(className)el.className=className;host.append(el);return el;};
  const root=add('div',null,parent,'symbol-content');
  const tabs=add('div',null,root,'tabs symbol-content-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Symbol source');
  const library=add('div',null,root),filePanel=add('div',null,root);
  const tabButtons=[];
  function switchTab(name){state.tab=name;library.hidden=name!=='Library';filePanel.hidden=name!=='Choose File';for(const b of tabButtons){b.classList.toggle('active',b.textContent===name);b.setAttribute('aria-selected',String(b.textContent===name));}}
  for(const name of ['Library','Choose File']){const b=add('button',name,tabs);b.type='button';b.setAttribute('role','tab');b.onclick=()=>switchTab(name);tabButtons.push(b);}
  tabs.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const index=e.key==='Home'?0:e.key==='End'?1:1-tabButtons.indexOf(document.activeElement);tabButtons[index].click();tabButtons[index].focus();};
  const filter=add('input',null,library,'symbol-library-filter');filter.type='search';filter.placeholder='Filter symbols…';filter.setAttribute('aria-label','Filter symbols');filter.value=state.query;
  const categories=add('select',null,library);categories.setAttribute('aria-label','Symbol category');
  const all=add('option','All categories',categories);all.value='';
  const viewport=add('div',null,library,'symbol-library-viewport');viewport.setAttribute('aria-label','Built-in symbols');
  const status=add('p','Loading symbols…',library,'hint');status.setAttribute('role','status');
  let items=[],busy=false;
  function render(){
    viewport.replaceChildren();
    const matching=filterSymbols(items,state.query,state.category);
    status.textContent=matching.length?'':items.length?'No matching symbols.':'No built-in symbols yet. Add them with the Symbol Library Manager.';
    status.hidden=Boolean(matching.length);
    let category,grid;
    for(const item of matching){
      if(category!==item.category){category=item.category;add('h4',category,viewport);grid=add('div',null,viewport,'symbol-library-grid');}
      const b=add('button',null,grid,'symbol-library-tile');b.type='button';b.title=item.name;b.setAttribute('aria-label','Use '+item.name);b.disabled=busy;
      const image=add('img',null,b);image.src=libraryAssetURL(item.file);image.alt='';image.loading='lazy';add('span',item.name,b);
      b.onclick=()=>safe(async()=>{
        if(busy)return;busy=true;for(const tile of viewport.querySelectorAll('button'))tile.disabled=true;
        status.hidden=false;status.textContent='Importing '+item.name+'…';
        try{
          const response=await fetch(libraryAssetURL(item.file),{cache:'no-store'});if(!response.ok)throw new Error('Unable to load this library symbol. Reload the library and try again.');
          const blob=await response.blob();if(blob.size>5*1024*1024)throw new Error('Symbols must be 5 MB or smaller');
          await importSymbol(item.name+'.svg',await imageFileData(new File([blob],item.name+'.svg',{type:'image/svg+xml'})));
        }finally{busy=false;if(root.isConnected)render();}
      });
    }
  }
  async function load(){
    const response=await fetch('/symbols/index.json',{cache:'no-store'});if(!response.ok)throw new Error('Unable to load the symbol library');
    const catalog=await response.json();if(catalog.version!==1||!Array.isArray(catalog.symbols))throw new Error('Unsupported symbol library catalog');
    for(const item of catalog.symbols){if(typeof item.name!=='string'||typeof item.category!=='string')throw new Error('Invalid symbol library entry');libraryAssetURL(item.file);}
    if(!root.isConnected)return;
    items=catalog.symbols;categories.replaceChildren(all);
    for(const name of [...new Set(items.map(i=>i.category))].sort()){const option=add('option',name,categories);option.value=name;}
    if(!items.some(i=>i.category===state.category))state.category='';categories.value=state.category;render();
  }
  filter.oninput=()=>{state.query=filter.value;render();};categories.onchange=()=>{state.category=categories.value;render();};
  const label=add('label','Choose SVG or DXF',filePanel);const upload=add('input',null,label);upload.type='file';upload.accept='.svg,.dxf';
  add('p','DXF: solid hatches on a FORECOLOR layer use Fore Color; other fills use Back Color. Closed outlines remain unfilled.',filePanel,'hint');
  upload.onchange=()=>safe(async()=>{const file=upload.files[0];if(!file)return;if(file.size>5*1024*1024)throw new Error('Symbols must be 5 MB or smaller');upload.disabled=true;try{await importSymbol(file.name,await imageFileData(file));}finally{upload.disabled=false;upload.value='';}});
  if(control.image){const b=add('button','Clear image',root);b.type='button';b.onclick=clear;}
  const rotateButton=add('button','Rotate 90°',root);rotateButton.type='button';rotateButton.onclick=rotate;
  switchTab(state.tab);
  load().catch(error=>{if(root.isConnected)status.textContent=error.message;});
}
