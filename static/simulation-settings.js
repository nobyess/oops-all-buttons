import {confirmPageLeave} from './page-leave-dialog.js';
export function mountSimulation(parent,{node,button,api,onSimulationChanged}){
 const panel=node('section',null,parent,{className:'simulation-settings'});
 node('p','Practice with simulated equipment using normal tags, events, trends, and alarms. No physical device connection is made.',panel,{className:'hint'});
 const group=node('section',null,panel,{className:'settings-group'});
 const check=text=>{const label=node('label',null,group,{className:'simulation-check'});node('span',text,label);return node('input',null,label,{type:'checkbox'});};
 const enabled=check('Enable Simulation'),airHandler=check('Air Handler');
 const label=node('label',null,group);node('span','Simulation Speed',label);
 const speed=node('select',null,label);for(const value of [1,2,5,10,30,60])node('option',value+'×',speed,{value:String(value)});
 node('p','1× follows real time. Faster speeds also shorten fan proving and thermal delays.',group,{className:'hint'});
 const info=node('section',null,panel,{className:'settings-group'});node('h3','Air Handler',info);
 node('p','A moderate room with internal heat gain, 20% outdoor air, heating, and chilled-water cooling. Temperatures use °F; valve and burner outputs use 0–100%.',info);
 node('p','Tags appear under Simulation\\AirHandler in the tag picker. All values refresh every 0.5 seconds, even when no page is using them.',info,{className:'hint'});
 node('p','Writable inputs: UnitEnableSignal (0 or 1), DischargeAirSetpoint (35–120 °F), OutdoorAirTemperature (−40–130 °F), and RoomLoadWatts (0–15,000 W). Calculated outputs are read-only.',info);
 node('p','Starts with the unit off, a 60 °F discharge setpoint, 85 °F outdoor air, and a 74 °F room. Saving settings or restarting the server resets the model. Disabled tags remain available with bad quality.',info,{className:'hint'});
 const status=node('p','Loading…',panel,{role:'status'}),footer=node('div',null,panel,{className:'row dialog-footer'});
 let current,dirty=false,saving=false,closed=false;
 const revert=button('Revert',footer,()=>{dirty=false;render();status.textContent='';}),save=button('Save',footer,saveSettings);
 function controls(){save.disabled=revert.disabled=!dirty || saving;enabled.disabled=airHandler.disabled=speed.disabled=saving || !current;}
 function render(){if(current){enabled.checked=current.enabled;airHandler.checked=current.air_handler;speed.value=String(current.speed);}controls();}
 for(const input of [enabled,airHandler,speed])input.onchange=()=>{dirty=true;status.textContent='';controls();};
 async function saveSettings(){
  if(saving || !dirty)return false;saving=true;controls();
  try{current=await api('admin/simulation',{enabled:enabled.checked,air_handler:airHandler.checked,speed:Number(speed.value)});dirty=false;await onSimulationChanged?.();if(!closed){status.className='good';status.textContent='Simulation settings saved.';}return true;}
  catch(error){if(!closed){status.className='bad';status.textContent=error.message;}return false;}
  finally{saving=false;if(!closed)render();}
 }
 render();api('admin/simulation').then(data=>{if(closed)return;current=data;status.textContent='';render();}).catch(error=>{if(!closed){status.className='bad';status.textContent=error.message;}});
 const close=()=>{closed=true;};close.isDirty=()=>dirty;
 close.beforeLeave=async()=>{if(saving)return false;if(!dirty)return true;const choice=await confirmPageLeave('Simulation settings');if(choice==='save')return saveSettings();if(choice==='discard'){dirty=false;return true;}return false;};
 return close;
}
