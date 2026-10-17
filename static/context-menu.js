let cleanup;
export function closeContextMenu() {cleanup?.();}
export function contextMenu(point,items,{parent=document.body,label='Control commands'}={}) {
  closeContextMenu();
  const menu=document.createElement('div');menu.className='context-menu';
  menu.setAttribute('role','dialog');menu.setAttribute('aria-label',label);
  const oldFocus=document.activeElement;
  const clamp=()=> {
    const rect=menu.getBoundingClientRect();
    menu.style.left=Math.max(4,Math.min(point.x,innerWidth-rect.width-4))+'px';
    menu.style.top=Math.max(4,Math.min(point.y,innerHeight-rect.height-4))+'px';
  };
  function add(items,parent) {
    for(const item of items) {
      if(item.separator){const rule=document.createElement('hr');parent.append(rule);continue;}
      if(item.buttons) {
        const heading=document.createElement('div');heading.className='context-order-label';heading.textContent=item.label;parent.append(heading);
        const row=document.createElement('div');row.className='context-order';row.setAttribute('role','group');row.setAttribute('aria-label',item.label);parent.append(row);
        for(const command of item.buttons){
          const button=document.createElement('button');button.type='button';button.textContent=command.icon;button.title=command.label;button.setAttribute('aria-label',command.label);row.append(button);
          button.onclick=()=>{closeContextMenu();command.run();};
        }
      } else if(item.children) {
        const details=document.createElement('details'),summary=document.createElement('summary');
        summary.textContent=item.label;details.append(summary);parent.append(details);
        add(item.children,details);details.addEventListener('toggle',clamp);
      } else {
        const button=document.createElement('button');button.type='button';button.textContent=item.label;
        button.disabled=Boolean(item.disabled);parent.append(button);
        button.onclick=()=>{closeContextMenu();item.run();};
      }
    }
  }
  add(items,menu);parent.append(menu);clamp();
  const outside=event=>{if(!menu.contains(event.target))closeContextMenu();};
  const key=event=>{if(event.key==='Escape'){event.preventDefault();closeContextMenu();}};
  document.addEventListener('pointerdown',outside,true);
  document.addEventListener('keydown',key,true);
  window.addEventListener('resize',closeContextMenu);
  cleanup=()=> {
    cleanup=null;menu.remove();
    document.removeEventListener('pointerdown',outside,true);
    document.removeEventListener('keydown',key,true);
    window.removeEventListener('resize',closeContextMenu);
    if(oldFocus?.isConnected)oldFocus.focus({preventScroll:true});
  };
  menu.querySelector('button:not(:disabled), summary')?.focus({preventScroll:true});
}
