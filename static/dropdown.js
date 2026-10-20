import {listboxDefinition} from './listbox.js';

// Share the Listbox's zero-based index binding and action configuration.
export function dropdownDefinition(common){
 const base=listboxDefinition(common);
 function update(el,c,ctx){
  const select=el.querySelector('select'),lines=Array.isArray(c.elements)?c.elements:[];
  const signature=JSON.stringify(lines);
  if(select.dataset.elements!==signature){
   select.replaceChildren();
   lines.forEach((text,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=text;select.append(option);});
   select.dataset.elements=signature;
   if(select.dropdownState){select.dropdownState.feedback=undefined;select.dropdownState.browsing=false;}
  }
  const disabled=ctx.editing||c.touchable===false||ctx.canInteract===false;
  // Even assigning disabled=false again can disturb an open native popup.
  // Leave its DOM attributes untouched when live state hasn't changed.
  if(select.disabled!==Boolean(disabled))select.disabled=Boolean(disabled);
  const label=c.name||'Dropdown';
  if(select.dropdownLabel!==label){select.setAttribute('aria-label',label);select.dropdownLabel=label;}
  const value=ctx.bindingValue?.quality==='good'?Number(ctx.bindingValue.value):NaN;
  const valid=Number.isInteger(value)&&value>=0&&value<lines.length;
  // Paint read feedback independently of the native popup's active option.
  const displayed=valid?lines[value]:'';
  if(select.liveLabel.textContent!==displayed)select.liveLabel.textContent=displayed;
  const foreground=c.foreColor||'var(--ui-text)';
  if(select.dropdownForeground!==foreground){el.style.setProperty('--dropdown-foreground',foreground);select.dropdownForeground=foreground;}
  const state=select.dropdownState||=( {browsing:false,feedback:undefined} );
  const feedback=valid?String(value):'';
  const restore=()=>{select.value=feedback;if(!valid)select.selectedIndex=-1;state.feedback=feedback;};
  // Native selects highlight options while open. Reassigning value on every
  // live tick interrupts that highlight even when the tag hasn't changed.
  if(disabled){state.browsing=false;}
  if(!state.browsing&&state.feedback!==feedback)restore();
  select.onfocus=select.onpointerdown=()=>{if(!disabled)state.browsing=true;};
  select.onkeydown=event=>{
   if(['Escape','Tab'].includes(event.key)){state.browsing=false;restore();}
   else if(!disabled)state.browsing=true;
  };
  select.onblur=()=>{state.browsing=false;restore();};
  select.onchange=()=>{
   const raw=select.value,index=raw===''?NaN:Number(raw);
   // Restore read feedback immediately; only a confirmed read selects an item.
   state.browsing=false;restore();
   if(!disabled&&Number.isInteger(index)&&index>=0&&index<lines.length&&index!==value)ctx.changeIndex(index);
  };
 }
 return {...base,label:'Dropdown',defaults:{...base.defaults,width:220,height:40},
  render(el,c,ctx){el.style.position='relative';const select=document.createElement('select');select.className='dropdown-control';el.append(select);const label=document.createElement('span');label.className='dropdown-live-value';label.setAttribute('aria-hidden','true');select.liveLabel=label;el.append(label);update(el,c,ctx);},update};
}
