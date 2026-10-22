import {assetNode as node,assetPreview,assetCategories,filterAssets} from './asset-ui.js';

// Embedded, selection-only Asset Center. No uploads or nested picker dialog.
export function mountAssetSelection(parent,{api,kind,value='',onSelect=()=>{},onConfirm=()=>{}}){
 let items=[],selected=null,closed=false,cleanups=[];
 const filters=node('div',null,parent,{className:'asset-filters'});
 const filter=node('input',null,filters,{type:'search',placeholder:'Filter assets or filenames…'});filter.setAttribute('aria-label','Filter assets');
 const category=node('select',null,filters);category.setAttribute('aria-label','Category');
 node('option','All categories',category,{value:''});
 const grid=node('div',null,parent,{className:'asset-picker-grid'});grid.setAttribute('role','listbox');grid.setAttribute('aria-label','Text assets');
 const chosen=node('p','Select a text asset.',parent,{className:'asset-picker-selection'});
 const status=node('p','Loading assets…',parent,{className:'asset-status',role:'status'});
 function choose(item){selected=item;chosen.textContent=item.name;onSelect(item);for(const tile of grid.children)tile.setAttribute('aria-selected',String(tile.dataset.assetId===item.id));}
 function render(){
  cleanups.forEach(clean=>clean());cleanups=[];grid.replaceChildren();
  for(const item of filterAssets(items,filter.value,category.value,kind)){
   const tile=node('button',null,grid,{type:'button',className:'asset-tile'});tile.dataset.assetId=item.id;tile.setAttribute('role','option');tile.setAttribute('aria-selected',String(selected?.id===item.id));
   const image=node('div',null,tile,{className:'asset-artwork'});image.setAttribute('aria-hidden','true');cleanups.push(assetPreview(image,item,{thumbnail:true}));
   node('span',item.name,tile);node('small',item.category,tile);
   tile.onclick=()=>choose(item);tile.ondblclick=()=>{choose(item);onConfirm();};
   tile.onkeydown=event=>{
    const tiles=[...grid.children],index=tiles.indexOf(tile);let next;
    if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();choose(item);if(event.key==='Enter')onConfirm();return;}
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){
     event.preventDefault();event.stopPropagation();
     next=event.key==='Home'?0:event.key==='End'?tiles.length-1:Math.max(0,Math.min(tiles.length-1,index+({ArrowLeft:-1,ArrowRight:1,ArrowUp:-3,ArrowDown:3}[event.key])));
     tiles[next]?.focus();
    }
   };
  }
  if(!grid.children.length)node('p','No matching text assets.',grid,{className:'hint'});
 }
 filter.oninput=category.onchange=render;
 api('assets').then(data=>{
  if(closed)return;items=data.filter(item=>item.kind===kind);
  for(const name of assetCategories(items,kind).sort())node('option',name,category,{value:name});
  selected=items.find(item=>item.url===value || item.id===value.split('/').at(-2)) || null;
  if(selected){chosen.textContent=selected.name;onSelect(selected);}
  status.textContent='';render();
 }).catch(error=>{if(!closed)status.textContent=error.message;});
 return ()=>{closed=true;cleanups.forEach(clean=>clean());cleanups=[];};
}
