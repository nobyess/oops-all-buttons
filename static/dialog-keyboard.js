// One default action for app dialogs; nested dialogs receive keys independently.
export function installDialogKeyboard(root){
 const arrowSelection=new WeakMap();
 const handler=event=>{
  if(event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.metaKey || event.ctrlKey)return;
  const modal=event.target.closest?.('dialog[open]');if(!modal)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(modal.dispatchEvent(new Event('cancel',{cancelable:true})))modal.close();return;}
  if(event.key==='ArrowLeft' || event.key==='ArrowRight'){
   if(event.shiftKey)return;
   const current=event.target.closest?.('button'),footer=current?.closest?.('.dialog-footer');
   if(!current || !footer)return; // Keep caret, select/list and tree navigation native.
   const actions=[...footer.querySelectorAll('button')].filter(button=>button.closest('dialog')===modal &&
    !button.disabled && !button.hidden && (!button.getClientRects || button.getClientRects().length));
   const index=actions.indexOf(current);if(index<0 || actions.length<2)return;
   const next=actions[(index+(event.key==='ArrowRight'?1:-1)+actions.length)%actions.length];
   event.preventDefault();event.stopPropagation();arrowSelection.set(modal,next);next.focus();return;
  }
  if(event.key!=='Enter' || (event.shiftKey && event.target.tagName==='TEXTAREA'))return;
  const buttons=[...modal.querySelectorAll('button')].filter(b=>b.closest('dialog')===modal && !b.disabled && !b.hidden);
  const focused=event.target.closest?.('button');
  const chosen=arrowSelection.get(modal);
  const action=(chosen===focused && buttons.includes(chosen)?chosen:null) || buttons.find(b=>b.dataset.dialogDefault==='true') || buttons.find(b=>b.type==='submit') ||
   [...buttons].reverse().find(b=>/^(Save(?:.*)?|Confirm|Continue|Delete|Remove|Discard|Write|OK|Close)$/i.test(b.textContent.trim()));
  if(!action)return;event.preventDefault();event.stopPropagation();action.click();
 };
 root.addEventListener('keydown',handler);return ()=>root.removeEventListener('keydown',handler);
}
