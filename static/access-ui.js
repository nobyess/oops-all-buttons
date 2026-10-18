import {confirmMessage} from './message-dialog.js';
import {applyTheme} from './theme.js';
export function hasAccessRoles(user,required=[]){return Array.isArray(required) && Boolean(user) && (user.administrator || required.every(id=>user.roles?.includes(id)));}
function modalForm(title,build){
 const modal=document.createElement('dialog'),form=document.createElement('form');modal.className='access-dialog designer-dialog';modal.append(form);
 const heading=document.createElement('h2');heading.textContent=title;form.append(heading);
 const body=document.createElement('div');form.append(body);const error=document.createElement('p');error.className='error';error.setAttribute('role','alert');form.append(error);
 const footer=document.createElement('div');footer.className='row dialog-footer';form.append(footer);
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';footer.append(cancel);
 const save=document.createElement('button');save.type='submit';save.textContent='Save';footer.append(save);
 modal.onclose=()=>modal.remove();
 const finish=()=>{modal.close();modal.remove();};cancel.onclick=finish;modal.oncancel=event=>{event.preventDefault();finish();};
 const submit=build(body,finish);form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{await submit();finish();}catch(e){error.textContent=e.message;}finally{save.disabled=false;}};
 document.body.append(modal);modal.showModal();return modal;
}
function checkbox(parent,label,checked){const row=document.createElement('label');row.className='checkbox-row';const input=document.createElement('input');input.type='checkbox';input.checked=checked;row.append(document.createTextNode(label),input);parent.append(row);return input;}
function input(parent,label,value='',type='text'){const row=document.createElement('label');row.textContent=label;const field=document.createElement('input');field.type=type;field.value=value;row.append(field);parent.append(row);return field;}
function roleInputs(parent,roles,selected){return roles.map(role=>[role.id,checkbox(parent,role.name,selected.includes(role.id))]);}
export function pickAccessRoles(roles,selected){return new Promise(resolve=>{
 let finished=false;
 const modal=modalForm('Required Access Roles',(body,close)=>{
  const hint=document.createElement('p');hint.className='hint';hint.textContent='All selected roles are required. Leave empty for any signed-in user. Administrators bypass role requirements.';body.append(hint);
  const choices=roleInputs(body,roles,selected);
  if(!roles.length){const text=document.createElement('p');text.textContent='Create roles in Administration > Users and Access.';body.append(text);}
  for(const id of selected.filter(id=>!roles.some(role=>role.id===id)))choices.push([id,checkbox(body,'Missing role (remove this requirement)',true)]);
  return ()=>{finished=true;resolve(choices.filter(([,field])=>field.checked).map(([id])=>id));};
 });modal.addEventListener('close',()=>{if(!finished)resolve(null);},{once:true});
});}
export function mountAccessManager(parent,{node,button,api}){
 const area=node('div',null,parent,{className:'access-management'});let closed=false,userId='',roleId='';
 const error=node('p','',area,{className:'error',role:'alert'}),columns=node('div',null,area,{className:'access-columns'});
 async function refresh(){
  try{const [users,roles,pages]=await Promise.all([api('admin/users'),api('access/roles'),api('pages')]);if(closed || !area.isConnected)return;columns.replaceChildren();error.textContent='';
   const userPanel=node('section',null,columns),rolePanel=node('section',null,columns);
   node('h3','Users',userPanel);
   function editUser(user){modalForm(user?'Edit User':'Add User',body=>{
    const name=input(body,'Username',user?.username || '');name.required=true;name.maxLength=100;
    const password=input(body,user?'New password (leave blank to keep current)':'Password (8+ characters)','','password');password.autocomplete='new-password';password.required=!user;
    const administrator=checkbox(body,'Administrator',Boolean(user?.administrator));
    const kiosk=checkbox(body,'Kiosk Mode',Boolean(user?.kiosk));
    const themeLabel=document.createElement('label');themeLabel.textContent='Interface Theme';const theme=document.createElement('select');themeLabel.append(theme);body.append(themeLabel);
    for(const [value,text] of [['light','Light'],['dark','Dark'],['system','System']]){const option=document.createElement('option');option.value=value;option.textContent=text;theme.append(option);}theme.value=user?.theme || 'system';
    const startingLabel=document.createElement('label');startingLabel.textContent='Starting Page';const starting=document.createElement('select');startingLabel.append(starting);body.append(startingLabel);
    for(const page of [{id:'',name:'Default (first page)'},...pages]){const option=document.createElement('option');option.value=page.id;option.textContent=page.name;starting.append(option);}starting.value=user?.starting_page || '';
    const kioskHint=document.createElement('p');kioskHint.className='hint';kioskHint.textContent='Kiosk users have live views only, with username and Log Out. Page navigation must be provided by page actions.';body.append(kioskHint);
    const title=document.createElement('h3');title.textContent='Assigned Roles';body.append(title);const assigned=roleInputs(body,roles,user?.roles || []);
    return async()=>{await api('admin/users/save',{id:user?.id,username:name.value,password:password.value,administrator:administrator.checked,kiosk:kiosk.checked,theme:theme.value,starting_page:starting.value,roles:assigned.filter(([,field])=>field.checked).map(([id])=>id)});const status=await api('status');applyTheme(status.user?.theme || 'system',status.user?.app_background || '');await refresh();};
   });}
   if(!users.some(user=>user.id===userId))userId=users[0]?.id || '';
   if(!roles.some(role=>role.id===roleId))roleId=roles[0]?.id || '';
   const userList=node('select',null,userPanel,{size:7,className:'access-listbox','aria-label':'Users'});
   userList.setAttribute('aria-label','Users');
   for(const user of users)node('option',user.username,userList,{value:user.id});userList.value=userId;
   const userActions=node('div',null,userPanel,{className:'access-list-actions'});
   button('+ Add User',userActions,()=>editUser());
   const editUserButton=button('Edit',userActions,()=>editUser(users.find(user=>user.id===userId)));editUserButton.className='access-edit-button';
   const removeUserButton=button('Remove',userActions,async()=>{
    const user=users.find(user=>user.id===userId);if(!user || !await confirmMessage('Remove user '+user.username+'?',{title:'Remove User?',confirmText:'Remove'}))return;
    try{await api('admin/users/remove',{id:user.id});await refresh();}catch(e){error.textContent=e.message;}
   });
   const userDetails=node('div',null,userPanel,{className:'access-selection-details'});userDetails.setAttribute('aria-live','polite');
   node('h3','Access Roles',rolePanel);
   const roleList=node('select',null,rolePanel,{size:7,className:'access-listbox','aria-label':'Access Roles'});
   roleList.setAttribute('aria-label','Access Roles');
   for(const role of roles)node('option',role.name,roleList,{value:role.id});roleList.value=roleId;
   const roleActions=node('div',null,rolePanel,{className:'access-list-actions'});
   button('+ Add Role',roleActions,()=>editRole());
   const editRoleButton=button('Edit',roleActions,()=>editRole(roles.find(role=>role.id===roleId)));editRoleButton.className='access-edit-button';
   const removeRoleButton=button('Remove',roleActions,async()=>{
    const role=roles.find(role=>role.id===roleId);if(!role || !await confirmMessage('Remove role '+role.name+'?',{title:'Remove Role?',confirmText:'Remove'}))return;
    try{await api('admin/roles/remove',{id:role.id});await refresh();}catch(e){error.textContent=e.message;}
   });
   const roleDetails=node('div',null,rolePanel,{className:'access-selection-details'});roleDetails.setAttribute('aria-live','polite');
   function detail(parent,label,value){node('dt',label,parent);node('dd',value,parent);}
   function detailLink(parent,label,run){const link=button(label,parent,run);link.className='access-detail-link';}
   function showSelections(){
    userDetails.replaceChildren();roleDetails.replaceChildren();
    const user=users.find(user=>user.id===userId),role=roles.find(role=>role.id===roleId);
    editUserButton.disabled=removeUserButton.disabled=!user;editRoleButton.disabled=removeRoleButton.disabled=!role;
    if(user){
     node('h3',user.username,userDetails);const info=node('dl',null,userDetails,{className:'access-detail-grid'});
     detail(info,'Level',user.administrator?'Administrator':'Standard User');detail(info,'Kiosk Mode',user.kiosk?'Enabled':'Disabled');
     detail(info,'Starting Page',pages.find(page=>page.id===user.starting_page)?.name || 'Default (first page)');
     detail(info,'Theme',({system:'System',light:'Light',dark:'Dark'})[user.theme] || 'System');
     node('p','Assigned Roles',userDetails,{className:'hint'});const links=node('div',null,userDetails,{className:'access-detail-links'});
     for(const id of user.roles){const assigned=roles.find(role=>role.id===id);if(assigned)detailLink(links,assigned.name,()=>{roleId=id;roleList.value=id;showSelections();});}
     if(!user.roles.length)node('span','No roles assigned.',links);
    }else node('p','No users.',userDetails,{className:'hint'});
    if(role){
     node('h3',role.name,roleDetails);node('p','Users assigned to this role',roleDetails,{className:'hint'});
     const members=users.filter(user=>user.roles.includes(role.id)),links=node('div',null,roleDetails,{className:'access-detail-links'});
     for(const member of members)detailLink(links,member.username,()=>{userId=member.id;userList.value=userId;showSelections();});
     if(!members.length)node('span','No users assigned.',links);
    }else node('p','No access roles.',roleDetails,{className:'hint'});
   }
   userList.onchange=()=>{userId=userList.value;showSelections();};roleList.onchange=()=>{roleId=roleList.value;showSelections();};
   userList.ondblclick=()=>{const user=users.find(user=>user.id===userId);if(user)editUser(user);};
   roleList.ondblclick=()=>{const role=roles.find(role=>role.id===roleId);if(role)editRole(role);};
   showSelections();
   function editRole(role){modalForm(role?'Rename Role':'Add Role',body=>{const name=input(body,'Name',role?.name || '');name.required=true;name.maxLength=100;return async()=>{await api('admin/roles/save',{id:role?.id,name:name.value});await refresh();};});}

  }catch(e){if(!closed)error.textContent=e.message;}
 }
 refresh();return ()=>{closed=true;};
}
