export function mountSignInSettings(parent,{node,api,onChange=()=>{}}){
 let closed=false,loaded=false,initial=true,hasAdministrator=false;
 const section=node('div',null,parent),label=node('label','Sign-In',section,{className:'asset-field server-port-field'}),mode=node('select',null,label,{disabled:true});
 node('option','Require sign-in',mode,{value:'required'});node('option','Run without sign-in',mode,{value:'automatic'});
 node('p','Without sign-in, anyone who can reach this server has full administrator access, including configuration and device writes. Activity is recorded as User.',section,{className:'hint'});
 const credentials=node('div',null,section,{hidden:true});
 const field=(title,type)=>{const label=node('label',title,credentials,{className:'asset-field server-port-field'});return node('input',null,label,{type,autocomplete:type==='password'?'new-password':'username'});};
 const username=field('Administrator Username','text'),password=field('Password (8+ characters)','password'),confirm=field('Confirm Password','password');
 const status=node('p','Loading sign-in settings…',section,{role:'status',className:'hint'});
 function update(){credentials.hidden=mode.value!=='required'||hasAdministrator;onChange();}
 mode.onchange=update;for(const input of [username,password,confirm])input.oninput=onChange;
 const close=()=>{closed=true;};
 close.isDirty=()=>loaded&&((mode.value==='required')!==initial||Boolean(username.value||password.value||confirm.value));
 close.data=()=>{if(!loaded)throw Error('Wait for sign-in settings to load.');if((mode.value==='required')===initial)return null;
  if(mode.value==='required'&&!hasAdministrator&&(!username.value.trim()||password.value.length<8||password.value!==confirm.value))throw Error('Enter an administrator username and matching passwords of at least 8 characters.');
  return {required:mode.value==='required',username:username.value,password:password.value};};
 close.committed=data=>{if(data){initial=data.required;if(data.required)hasAdministrator=true;}close.revert();};
 close.revert=()=>{mode.value=initial?'required':'automatic';username.value=password.value=confirm.value='';update();};
 close.setDisabled=value=>{mode.disabled=value||!loaded;for(const input of [username,password,confirm])input.disabled=value;};
 api('admin/sign-in').then(data=>{if(closed)return;loaded=true;initial=data.required;hasAdministrator=data.has_administrator;mode.value=initial?'required':'automatic';mode.disabled=false;status.textContent='Changing this setting signs out all open sessions. Existing accounts are retained.';update();}).catch(error=>{if(!closed)status.textContent=error.message;});
 return close;
}
