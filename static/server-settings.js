import {mountSignInSettings} from './sign-in-settings.js';
export function mountServerSettings(parent,{node,api,onChange=()=>{}}){
 let closed=false,loaded=false,initial=8080,available=false;
 const panel=node('section',null,parent,{className:'server-settings'});node('h3','Server Settings',panel);
 const field=node('label','Port',panel,{className:'server-port-field'});
 const port=node('input',null,field,{type:'number',min:1,max:65535,step:1,value:8080,disabled:true});
 node('p','Changing the port requires a server restart when you save.',panel,{className:'hint'});
 const status=node('p','Loading server settings…',panel,{role:'status',className:'hint'});
 const signIn=mountSignInSettings(panel,{node,api,onChange});port.oninput=onChange;
 const close=()=>{closed=true;signIn();};
 close.isDirty=()=>loaded&&String(port.value)!==String(initial)||signIn.isDirty();
 close.data=()=>{const result={};if(loaded&&String(port.value)!==String(initial)){const value=Number(port.value);if(!Number.isInteger(value)||value<1||value>65535)throw Error('Enter a port from 1 to 65535.');if(!available)throw Error('Server restart is unavailable.');result.port=value;}
  const mode=signIn.data();if(mode)result.sign_in=mode;return result;};
 close.revert=()=>{port.value=initial;signIn.revert();onChange();};
 close.setDisabled=value=>{port.disabled=value||!available;signIn.setDisabled(value);};
 close.committed=data=>{if(data.port!==undefined)initial=data.port;signIn.committed(data.sign_in);};
 api('admin/server-settings').then(data=>{if(closed)return;loaded=true;initial=data.port;port.value=data.port;available=data.can_restart&&!data.pending;port.disabled=!available;status.textContent=data.pending?'Server restart is pending.':data.can_restart?'':'Server restart is unavailable in this environment.';onChange();}).catch(error=>{if(!closed){status.textContent=error.message;status.className='bad';}});
 return close;
}
