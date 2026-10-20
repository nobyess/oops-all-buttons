// Indexes are zero-based. Values outside the element range select nothing.
export function listboxDefinition(common) {
 function update(el,c,ctx) {
  const list=el.querySelector('[role="listbox"]');
  const lines=Array.isArray(c.elements)?c.elements:[];
  const signature=JSON.stringify(lines);
  if(list.dataset.elements!==signature){
   list.replaceChildren();
   lines.forEach(text=>{const option=document.createElement('div');option.textContent=text;option.className='listbox-element';option.setAttribute('role','option');list.append(option);});
   list.dataset.elements=signature;
  }
  const disabled=ctx.editing || c.touchable===false || ctx.canInteract===false;
  list.setAttribute('aria-disabled',String(disabled));
  const sample=ctx.bindingValue;
  const index=sample?.quality==='good'?Number(sample.value):NaN;
  const rows=[...list.children];
  rows.forEach((row,offset)=>{
   const selected=Number.isInteger(index) && index===offset;
   // Only read feedback controls selection. Clicks never change this attribute.
   row.setAttribute('aria-selected',String(selected));
   row.tabIndex=disabled?-1:0;
   const choose=()=>{if(!disabled && offset!==index)ctx.changeIndex(offset);};
   row.onclick=choose;
   row.onkeydown=event=>{
    if(disabled)return;
    if(event.key==='Enter' || event.key===' '){event.preventDefault();choose();}
    else if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){
     event.preventDefault();
     const next=event.key==='Home'?0:event.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,offset+(event.key==='ArrowDown'?1:-1)));
     rows[next]?.focus();
    }
   };
  });
 }
 return {
  label:'Listbox',bindable:true,
  props:{valueTag:{label:'Index tag',type:'binding'},touchable:{label:'Touchable',type:'checkbox'},requiredRoles:{label:'Access Roles',type:'accessRoles'},elements:{label:'Text lines (one per element)',type:'elements'},
   ...Object.fromEntries(Object.entries(common).filter(([key])=>key!=='text'))},
  defaults:{width:220,height:180,touchable:true,elements:['Element 1','Element 2','Element 3']},
  render(el,c,ctx){const list=document.createElement('div');list.setAttribute('role','listbox');list.className='listbox-control';list.setAttribute('aria-label','Listbox');el.append(list);update(el,c,ctx);},update
 };
}
