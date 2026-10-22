import {mountBackupRestore} from './backup-restore.js';
export function mountFirstRun(parent,{node,button,field,onCreate,onRestore}){
 const card=node('section',null,parent,{className:'card first-run'});
 node('p','FIRST-RUN SETUP',card,{className:'first-run-eyebrow'});
 node('h2','Welcome to Oops! All Buttons',card);
 const intro=node('p','Before connecting equipment, review this safety information.',card,{className:'first-run-intro'});
 const notice=node('section',null,card),warning=node('div',null,notice,{className:'first-run-warning'});
 node('h3','⚠ Connected equipment can move unexpectedly',warning);
 node('p','This software can read from and write to PLCs and other controllers. A command, configuration error, or unexpected value could start machinery, move equipment, or change a process, causing serious injury, death, or property damage.',warning);
 const list=node('ul',null,warning);
 for(const text of ['Only qualified, authorized people should configure connections or operate connected equipment.','Test with simulated or safely isolated equipment before connecting to a live process.','Verify tag addresses, write actions, access permissions, and equipment state before use.','Keep emergency stops, interlocks, and other safety protections independent of this software. Do not rely on this HMI as a safety system.'])node('li',text,list);
 node('h3','Use only on a trusted network',warning);
 node('p','Keep this HMI and connected controllers on a trusted, access-controlled network. Do not expose the HMI server or device ports directly to the internet. For remote access, use a securely configured VPN and restrict access to authorized users.',warning);
 const responsibility=node('div',null,notice,{className:'first-run-responsibility'});node('h3','Your responsibility',responsibility);
 node('p','You are responsible for determining whether this software is suitable for your application, validating its configuration, and operating connected equipment safely.',responsibility);
 node('p','The software is provided “as is,” without warranties. To the extent permitted by applicable law, the developer assumes no responsibility or liability for injury, damage, loss, or other consequences arising from its use.',responsibility);
 const label=node('label',null,notice,{className:'first-run-ack'}),ack=node('input',null,label,{type:'checkbox'});
 node('span','I have read this notice and understand the equipment and network risks and my responsibility for safe configuration and operation.',label);
 const footer=node('div',null,notice,{className:'row dialog-footer'}),next=button('Continue to Access Setup',footer,()=>{if(!ack.checked)return;notice.hidden=true;form.hidden=false;intro.textContent='Choose how people access your HMI.';mode.focus();});next.disabled=true;
 const restoreButton=button('Restore from Backup',footer,()=>{if(!ack.checked)return;notice.hidden=true;restoreArea.hidden=false;intro.textContent='Restore an existing installation from a backup file.';});restoreButton.disabled=true;
 ack.onchange=()=>{next.disabled=restoreButton.disabled=!ack.checked;};
 const restoreArea=node('section',null,card,{hidden:true});
 mountBackupRestore(restoreArea,{node,button,firstRun:true,onRestore});
 button('Back',restoreArea,()=>{restoreArea.hidden=true;notice.hidden=false;intro.textContent='Before connecting equipment, review this safety information.';ack.focus();});
 const form=node('form',null,card,{hidden:true});node('h3','Access Setup',form);
 const modeLabel=node('label','Sign-In',form,{className:'asset-field'}),mode=node('select',null,modeLabel);
 node('option','Require sign-in',mode,{value:'required'});node('option','Run without sign-in',mode,{value:'automatic'});
 const automaticWarning=node('p','Anyone who can reach this server will have full administrator access, including configuration and device writes. Activity will be recorded as User.',form,{className:'hint',hidden:true});
 const credentials=node('div',null,form);

 const username=field('Username',credentials);username.required=true;username.autocomplete='username';
 const password=field('Password (8+ characters)',credentials,'password');password.required=true;password.minLength=8;password.autocomplete='new-password';
 const confirm=field('Confirm Password',credentials,'password');confirm.required=true;confirm.autocomplete='new-password';
 const error=node('p','',form,{className:'error',role:'alert'}),commands=node('div',null,form,{className:'row dialog-footer'});
 const back=button('Back',commands,()=>{form.hidden=true;notice.hidden=false;intro.textContent='Before connecting equipment, review this safety information.';ack.focus();});
 const create=node('button','Create Administrator',commands,{type:'submit'});
 mode.onchange=()=>{const automatic=mode.value==='automatic';credentials.hidden=automatic;automaticWarning.hidden=!automatic;username.required=password.required=confirm.required=!automatic;create.textContent=automatic?'Start without Sign-In':'Create Administrator';};
 form.onsubmit=async event=>{event.preventDefault();error.textContent='';if(!ack.checked){error.textContent='Acknowledge the safety notice before creating an administrator.';return;}if(mode.value!=='automatic'&&password.value!==confirm.value){error.textContent='Passwords must match.';confirm.focus();return;}if(!form.reportValidity())return;
  create.disabled=back.disabled=true;try{await onCreate({username:username.value,password:password.value,safety_acknowledged:true,sign_in_required:mode.value!=='automatic'});}catch(e){error.textContent=e.message;}finally{create.disabled=back.disabled=false;}
 };
}
