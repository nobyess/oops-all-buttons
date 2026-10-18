// One default action for app dialogs; nested dialogs receive keys independently.
export function installDialogKeyboard(root){
 const handler=event=>{
  if(event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.metaKey || event.ctrlKey)return;
  const modal=event.target.closest?.('dialog[open]');if(!modal)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(modal.dispatchEvent(new Event('cancel',{cancelable:true})))modal.close();return;}
  if(event.key!=='Enter' || (event.shiftKey && event.target.tagName==='TEXTAREA'))return;
  const buttons=[...modal.querySelectorAll('button')].filter(b=>b.closest('dialog')===modal && !b.disabled && !b.hidden);
  const action=buttons.find(b=>b.dataset.dialogDefault==='true') || buttons.find(b=>b.type==='submit') ||
   [...buttons].reverse().find(b=>/^(Save(?:.*)?|Confirm|Continue|Delete|Remove|Discard|Write|OK|Close)$/i.test(b.textContent.trim()));
  if(!action)return;event.preventDefault();event.stopPropagation();action.click();
 };
 root.addEventListener('keydown',handler);return ()=>root.removeEventListener('keydown',handler);
}
