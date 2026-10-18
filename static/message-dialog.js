let pendingConfirmation;
export function confirmMessage(message,{title='Confirm',confirmText='Continue',cancelText='Cancel'}={}){
 if(pendingConfirmation)return Promise.resolve(false);
 return new Promise(resolve=>{
  const previous=document.activeElement,modal=document.createElement('dialog');modal.className='designer-dialog message-dialog';modal.setAttribute('aria-label',title);
  const heading=document.createElement('h2');heading.textContent=title;modal.append(heading);
  const text=document.createElement('p');text.textContent=message;modal.append(text);
  const footer=document.createElement('div');footer.className='row dialog-footer';modal.append(footer);
  let finished=false;function finish(value){if(finished)return;finished=true;pendingConfirmation=null;if(modal.open)modal.close();modal.remove();if(previous?.isConnected)previous.focus({preventScroll:true});resolve(value);}
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent=cancelText;cancel.onclick=()=>finish(false);footer.append(cancel);
  const confirm=document.createElement('button');confirm.type='button';confirm.textContent=confirmText;confirm.onclick=()=>finish(true);footer.append(confirm);
  modal.oncancel=e=>{e.preventDefault();finish(false);};modal.onclose=()=>finish(false);
  pendingConfirmation=modal;document.body.append(modal);modal.showModal();cancel.focus();
 });
}
export function showMessage(message,{title='Notice'}={}){
 return new Promise(resolve=>{
  const previous=document.activeElement,modal=document.createElement('dialog');modal.className='designer-dialog message-dialog';modal.setAttribute('aria-label',title);
  const heading=document.createElement('h2');heading.textContent=title;modal.append(heading);const text=document.createElement('p');text.textContent=message;modal.append(text);
  const footer=document.createElement('div');footer.className='row dialog-footer';modal.append(footer);const ok=document.createElement('button');ok.type='button';ok.textContent='OK';ok.onclick=()=>modal.close();footer.append(ok);
  modal.onclose=()=>{modal.remove();if(previous?.isConnected)previous.focus({preventScroll:true});resolve();};document.body.append(modal);modal.showModal();ok.focus();
 });
}
