let active;
export function closeAccountPopup(){active?.();}
export function accountProfile(user,roles){
 return {username:user.username,level:user.administrator?'Administrator':'Standard User',roles:(user.roles || []).map(id=>roles.find(role=>role.id===id)?.name || 'Unknown role')};
}
export function openAccountPopup({anchor,user,roles,onLogout}){
 closeAccountPopup();
 const profile=accountProfile(user,roles),modal=document.createElement('dialog');modal.className='account-popup';modal.setAttribute('aria-label','User account');
 const add=(tag,text,parent=modal)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;parent.append(el);return el;};
 add('h2','Account');const info=add('dl');
 for(const [label,value] of [['User',profile.username],['Level',profile.level]]){add('dt',label,info);add('dd',value,info);}
 add('h3','Roles');
 if(profile.roles.length){const list=add('ul');for(const role of profile.roles)add('li',role,list);}
 else add('p','No roles assigned.').className='hint';
 const error=add('p','');error.className='error';error.setAttribute('role','alert');
 const footer=add('div');footer.className='row dialog-footer';
 const close=()=>{if(modal.open)modal.close();else modal.remove();};
 const dismiss=add('button','Close',footer);dismiss.type='button';dismiss.onclick=close;
 const logout=add('button','Log Out',footer);logout.type='button';
 logout.onclick=async()=>{logout.disabled=true;try{if(await onLogout()!==false)close();}catch(e){error.textContent=e.message;}finally{logout.disabled=false;}};
 modal.onclose=()=>{modal.remove();anchor.setAttribute('aria-expanded','false');if(active===close)active=null;if(anchor.isConnected)anchor.focus({preventScroll:true});};
 modal.onpointerdown=event=>{if(event.target!==modal)return;const r=modal.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)close();};
 document.body.append(modal);active=close;anchor.setAttribute('aria-expanded','true');modal.showModal();return modal;
}
