import {startingPage} from './starting-page.js';
import {openTextViewerEditor} from './text-viewer-editor.js';
import {disposeTextViewers,textViewerAppearance} from './text-viewer.js';
import {mountAssetCenter} from './asset-manager.js';
import {openContentPicker} from './content-picker.js';
import {contentField} from './content-field.js';
import {buttonIcons,buttonIcon} from './button-icons.js';
import {openInlineTagDialog} from './inline-tag-dialog.js';
import {firstSelection,newRule} from './selection-defaults.js';
import {rotateArtwork} from './artwork-rotation.js';
import {mountSymbolContent} from './symbol-content.js';
import {bindControlActions} from './control-actions.js';
import {trendSeries,trendColors} from './live-trend.js';
import {mountAlarmAttention} from './alarm-attention.js';
import {mountAlarms} from './alarms-manager.js';
import {mountControlPlacement} from './control-placement.js';
import {installDialogKeyboard} from './dialog-keyboard.js';
import {navigationHistory} from './navigation-history.js';
import {confirmMessage,showMessage} from './message-dialog.js';
import {mountFirstRun} from './first-run.js';
import {mountSheets} from './sheets-manager.js';
import {mountExplorerDrag} from './explorer-drag.js';
import {layerBlocks,paintOrder,addToGroup,removeFromGroups,pruneEmptyGroups,layerDrop,moveLayerTo} from './layers.js';
import {createGroup,groupBounds,groupMembers,groupDelta,ungroup,copyGroup,pasteGroup,memberVisible} from './groups.js';
import {trimSymbolData} from './symbol-import.js';
import {openAccountPopup,closeAccountPopup} from './account-popup.js';
import {installInteractionPolicy} from './interaction-policy.js';
import {installClock} from './header-clock.js';
import {toolboxIcon} from './toolbox-icons.js';
import {lightyakTagBrowser} from './lightyak-tag-browser.js';
import {modbusTagDialog} from './modbus-tag-dialog.js';
import {applyTheme} from './theme.js';
import {pickAccessRoles,hasAccessRoles} from './access-ui.js';
import {mountPolylineDrawing,polylinePagePoints,reshapePolyline,movePolyline} from './polyline-drawing.js';
import {mountEditorPanels,scrollableEditorList,saveEditorListScroll} from './editor-panels.js';
import {mqttTagBrowser} from './mqtt-tag-browser.js';
import {mountAdministration} from './administration.js';
import {mountLibrary} from './library-manager.js';
import {displayValue} from './value-format.js';
import {mountSourceManager,applySourceStatuses} from './source-manager.js';
import {randomId} from './uuid.js';
import {imageFileData,installClipboardImagePaste} from './clipboard-image.js';
import {confirmPageLeave} from './page-leave-dialog.js';
import {parameterTags,instantiatePage,renameParameterText,isParameter,PARAMETER_SOURCE} from './page-parameters.js';
import {configureParameters,connectParameters} from './parameter-dialog.js';
import {linePoints,editingPolyline,polylineSelection,selectedLinePoint} from './shapes.js';
import {renderInlineText,controlInlineTagIds} from './inline-text.js';
import {moveRule,duplicateRule} from './rule-edit.js';
import {PageLifecycles} from './page-lifecycle.js';
import {openValueInput} from './value-input.js';
import {openTextEditor,textFields,seedContentEvent} from './text-editor.js';
import {evaluateControlEvents,eventTagIds,blinkControlTypes} from './visual-events.js';
import {refreshPolicy} from './refresh-policy.js';
import {LiveSubscriptions,pageTagIds} from './live-subscriptions.js';
import { controls, fonts } from './controls.js';
import { tagPicker, openTagSelector, tagPath } from './tag-selector.js';
import { openSheetDialog, mountSheetGrid } from './sheet-ui.js';
import { installLauncher } from './launcher.js';
import { createNotifier } from './toast.js';
import { openPageWindow, closePageWindows } from './page-window.js';
import { editorView, viewStates, pagePoint, zoomLevels } from './editor-view.js';
import { colorPicker } from './color-picker.js';
import { alignmentPicker } from './alignment-picker.js';
import { contextMenu, closeContextMenu } from './context-menu.js';
import { cloneControl, orderControl, stepControl, explorerLabel, togglePinned } from './control-edit.js';
const collapsedGroups=new Set();
const explorerTypes=new Map();
let polylineDraft=null,pointEditingFocus=null;
let gridStyle='lines';
import { EditHistory } from './edit-history.js';
import { actionLabel, eventLabel } from './rule-labels.js';
import {bacnetTagBrowser} from './bacnet-tag-browser.js';
import { plcTagBrowser } from './plc-tag-browser.js';
installInteractionPolicy(document);
const pollingClient=randomId();
const runtimeOwners=new WeakMap();
let mainConnections={page:null,values:{}};
function runtimeOwner(canvas){return runtimeOwners.get(canvas) || pages.find(p=>p.id===canvas?.dataset.pageId);}
function liveOwners(){return [...document.querySelectorAll('.runtime .canvas')].map(runtimeOwner).filter(Boolean);}
function createRuntimeOwner(template,connections){const owner=instantiatePage(template,connections);owner.instanceId=randomId();return owner;}
const sheetInterests=new Map();
let pickerInterest='',lastInterest='',interestAt=0,refreshing=false;
let interestPending=null,interestRetryAt=0;
function sendInterest(){
  if(interestPending)return interestPending;
  if(Date.now()<interestRetryAt)return Promise.resolve();
  interestPending=sendInterestNow().catch(error=>{interestRetryAt=Date.now()+2000;throw error;}).finally(()=>{interestPending=null;});
  return interestPending;
}
async function sendInterestNow() {
  if(!csrf)return;
  const visible=document.visibilityState!=='hidden';
  const viewed=visible?[...new Set([...document.querySelectorAll('.runtime .canvas')].map(el=>el.dataset.pageId).filter(Boolean))]:[];
  const payload={client:pollingClient,pages:viewed.sort(),tags:visible?[...new Set([...liveOwners().flatMap(owner=>pageTagIds(owner,tags)),...(pickerInterest && !isParameter(pickerInterest)?[pickerInterest]:[])])].filter(id=>!isParameter(id)).sort():[],sheets:visible?[...sheetInterests.keys()].sort():[]};
  const signature=JSON.stringify(payload);
  if(signature!==lastInterest || Date.now()-interestAt>2000) {
    await api('polling/interest',payload);lastInterest=signature;interestAt=Date.now();
  }
}
const editHistory=new EditHistory();
function markChanged(group=null) {
  if(page)pruneEmptyGroups(page);
  dirty=true;editHistory.record(page,group);updateHistoryButtons();
}
function updateHistoryButtons() {
  const undo=document.querySelector('#undo-page'),redo=document.querySelector('#redo-page');
  if(undo)undo.disabled=!page || !editHistory.canUndo(page);
  if(redo)redo.disabled=!page || !editHistory.canRedo(page);
}
function restoreEdit(delta) {
  if(!editing || !page || !location.hash.startsWith('#editor'))return;
  const restored=editHistory.move(page,delta);if(!restored)return;
  polylineDraft=null;Object.assign(page,restored);dirty=true;ruleId=null;
  if(![...page.controls,...page.groups || []].some(c=>c.id===selected))selected=PAGE_SELECTION;
  
  route();
}
document.addEventListener('keydown',event=> {
  if(!location.hash.startsWith('#editor') || document.querySelector('dialog[open]'))return;
  const key=event.key.toLowerCase();
  if(key==='escape' && polylineDraft){event.preventDefault();polylineDraft=null;route();return;}
  if((event.ctrlKey || event.metaKey) && !event.altKey && key==='s') {
    event.preventDefault();if(!event.repeat)safe(saveEditorPage);return;
  }
  if(event.altKey || event.target.closest('input, textarea, [contenteditable="true"], [contenteditable=""]'))return;
  if(event.target.closest('select') && !event.target.closest('.control-selection'))return;
  if(key==='delete' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault();if(!event.repeat)deleteSelectedControl();return;
  }
  if(!(event.ctrlKey || event.metaKey))return;
  if(key==='z' || key==='y') {event.preventDefault();restoreEdit(key==='y' || event.shiftKey?1:-1);}
});
installClipboardImagePaste(document,{
  canPaste:()=>editing && page && location.hash.startsWith('#editor') && !document.querySelector('dialog[open]'),
  onPaste:async file=>{
    const destination=page;
    const data=await imageFileData(file);
    const asset=await api('images',{name:file.name || 'Clipboard image.png',data});
    if(page!==destination || !editing || !location.hash.startsWith('#editor'))return;
    addControl('image',40,40,{image:asset.url,imageName:asset.name});
  },
  onError:error=>notify(error.message)
});
async function deleteSelectedControl() {
  const targetPage=page;
  const group=page?.groups?.find(g=>g.id===selected);
  if(group){if(!await confirmMessage('Delete group '+group.name+' and all its controls?',{title:'Delete Group?',confirmText:'Delete'}) || page!==targetPage)return;page.controls=page.controls.filter(c=>c.groupId!==group.id);ungroup(page,group.id);selected=PAGE_SELECTION;markChanged();route();return;}
  const control=page?.controls.find(c=>c.id===selected);
  if(!control)return;
  if(!await confirmMessage(`Delete control "${control.name || control.text || control.type}"?`,{title:'Delete Control?',confirmText:'Delete'}) || page!==targetPage)return;
  page.controls=page.controls.filter(c=>c.id!==control.id);
  selected=PAGE_SELECTION;ruleId=null;markChanged();route();
}
let pendingSave;
async function saveEditorPage() {
  if(!page)return;
  // Commit a focused number/text property before serializing it.
  document.activeElement?.blur();
  if(pendingSave)return pendingSave;
  const savedPage=page,snapshot=structuredClone(page),signature=editHistory.serialize(page);
  pendingSave=(async()=> {
    const result=await api('pages',snapshot);
    if(page===savedPage && editHistory.serialize(page)===signature) {
      dirty=false;await reloadLists();
    }
    notify(result.warnings?.length?'Page saved. '+result.warnings.join('\n'):'Page saved.');
  })();
  try {await pendingSave;} finally {pendingSave=null;}
}
let copiedControl;
const PAGE_SELECTION = '@page';
const app=document.querySelector('#app'), message=document.querySelector('#message'), account=document.querySelector('#account');
const notify = createNotifier(message);
let lastNetworkError = '';
let controlStates = {};
let sourceManager,closeLibrary,closeEditorPanels;
let actionQueue = Promise.resolve();
let currentUser=null,accessRoles=[],siteLogo=false;
let csrf,catalog,sources=[],tags=[],pages=[],page,values= {
},selected,dirty=false,editing=true,grid=20,tab='Properties',ruleId,routedHash;
function node(tag,text,parent,attrs= {
})  {
  const el=document.createElement(tag);
  if(text!==null)el.textContent=text;
  Object.assign(el,attrs);
  parent?.append(el);
  return el;
}
function button(text,parent,fn)  {
  return node('button',text,parent, {
    type:'button',onclick:()=>safe(fn)
  });
}
function field(label,parent,type='text',value='')  {
  return node('input',null,node('label',label,parent), {
    type,value
  });
}
function select(label,parent,options,value,attrs= {
})  {
  const el=node('select',null,node('label',label,parent),attrs);
  for(const [key,title] of options)node('option',title,el, {
    value:key
  });
  el.value=firstSelection(options,value);
  return el;
}
let suspendedEditor=null,connectionNotice;
function sessionExpired(reason='expired') {
  if(!csrf)return;
  if(dirty && page)suspendedEditor={page,selected,tab,ruleId};
  csrf=null;catalog=null;subscriptions.close();pickerInterest='';lastInterest='';interestAt=0;
  for(const modal of document.querySelectorAll('dialog[open]'))modal.close();
  account.replaceChildren();node('span','Guest',account);
  button('Log in',account,()=>auth(false));
  auth(false);
  const disconnected=reason==='disconnected';
  connectionNotice=node('dialog',null,document.body,{className:'designer-dialog'});
  connectionNotice.setAttribute('aria-labelledby','connection-notice-title');
  node('h2',disconnected?'Server Disconnected':'Session Expired',connectionNotice,{id:'connection-notice-title'});
  node('p',disconnected?'The server could not be reached. It may have stopped or the network connection was lost. Start the server or restore your connection, then sign in again.':'Your login session has expired. Please sign in again to continue.',connectionNotice);
  if(suspendedEditor)node('p','Your unsaved page edits are being kept in this tab and will be restored after you sign in. Keep this tab open.',connectionNotice,{className:'hint'});
  const footer=node('div',null,connectionNotice,{className:'row dialog-footer'});
  const modal=connectionNotice;
  button('OK',footer,()=>modal.close());
  modal.onclose=()=>{modal.remove();if(connectionNotice===modal)connectionNotice=null;};
  modal.showModal();
}
async function api(path,data) {
  if(!csrf && !['status','setup','setup/restore','login'].includes(path))throw new Error('Please log in again.');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),['status','polling/interest','values/batch','sources','sources/status','admin/status'].includes(path)?10000:120000);
  let r,result;
  try {
    r=await fetch('/api/'+path,{signal:controller.signal,...(data===undefined?{}:{
      method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf||''},body:JSON.stringify(data)
    })});
    result=await r.json();
  }catch(error){
    sessionExpired('disconnected');
    throw new Error('Cannot reach the server. Check that it is running and try signing in again.');
  }finally{clearTimeout(timeout);}
  if(r.status===401 && path!=='login')sessionExpired();
  if(!r.ok){const error=new Error(result.error||'Request failed');error.status=r.status;throw error;}
  return result;
}
async function safe(fn)  {
  try {
    await fn();
  }
  catch(e) {
    notify(e.message);
  }
}
function dialog(title,build)  {
  const modal=node('dialog',null,document.body,{className:'designer-dialog'}),form=node('form',null,modal);
  node('h2',title,form);
  const body=node('div',null,form),footer=node('div',null,form, {
    className:'row dialog-footer'
  });
  button('Cancel',footer,()=>modal.close());
  const submit=node('button','Save',footer, {
    type:'submit'
  }),error=node('p','',form, {
    className:'error',role:'alert'
  });
  const save=build(body,submit);
  form.onsubmit=async e=> {
    e.preventDefault();
    try {
      await save();
      modal.close();
    }
    catch(e) {
      error.textContent=e.message;
    }
  };
  modal.onclose=()=>modal.remove();
  modal.showModal();
}
function confirmDialog(title,text,fn)  {
  dialog(title,(body,submit)=> {
    node('p',text,body);
    submit.textContent='Remove';
    return fn;
  });
}
async function reloadLists()  {
  [sources,tags]=await Promise.all(['sources','tags'].map(p=>api(p)));
}
function normalize(p) {
  Object.assign(p, {gridSize:p.gridSize ?? 20, gridStyle:p.gridStyle ?? 'lines', width:p.width ?? 1000, height:p.height ?? 640, backColor:p.backColor ?? '#ffffff', horizontalAlignment:p.horizontalAlignment ?? 'left', verticalAlignment:p.verticalAlignment ?? 'top'});
  p.actions ??= [];p.events ??= [];p.groups ??= [];
  for(const group of p.groups){group.type='group';group.events ??= [];group.visible ??= true;group.name ||= group.id;}
  for (const c of p.controls) {
    c.name=typeof c.name==='string' && c.name.trim()?c.name:c.id;
    c.actions ??= [];
    c.events ??= [];
    if(['label','button'].includes(c.type))for(const event of c.events)if(event.action==='set_colors'){
      seedContentEvent(event,c);event.contentStyle={...event.contentStyle,backColor:event.backColor || c.backColor,foreColor:event.foreColor || c.foreColor};event.action='set_content';
    }
  }
  return p;
}
async function start(afterLogin=false)  {
  closeAccountPopup();
  alarmAttention.setUser(null);
  document.querySelector('#exit-kiosk')?.remove();
  document.querySelector('#kiosk-home')?.remove();
  const status=await api('status');
  siteLogo=Boolean(status.site_logo);
  csrf=status.csrf;currentUser=status.user;applyTheme(currentUser?.theme || 'system',currentUser?.app_background || '');document.body.classList.toggle('kiosk-mode',Boolean(status.authenticated && currentUser?.kiosk));
  document.body.classList.toggle('logged-out',!status.authenticated);
  account.replaceChildren();
  if(!status.authenticated) {
    catalog=null;
    button('Log in',account,()=>auth(status.setup));
    return auth(status.setup);
  }
  if(currentUser?.administrator && currentUser?.kiosk){
    const exit=button('Exit Kiosk Mode',document.querySelector('.header-start'),async()=>{await api('session/kiosk/exit',{});await start();});
    exit.id='exit-kiosk';
  }
  const userButton=button('User: '+status.username,account,async()=>{
    userButton.disabled=true;
    try{
      const [profile,roles]=await Promise.all([api('status'),api('access/roles')]);
      if(!profile.user)return;
      userButton.textContent='User: '+profile.user.username;
      openAccountPopup({anchor:userButton,user:profile.user,roles,onLogout:async()=>{
        if(!(await allowLeave()))return false;
        await api('logout',{});dirty=false;csrf=null;await start();return true;
      }});
    }finally{userButton.disabled=false;}
  });
  userButton.setAttribute('aria-haspopup','dialog');userButton.setAttribute('aria-expanded','false');
  [catalog,sources,tags,pages,accessRoles]=await Promise.all(['catalog','sources','tags','pages','access/roles'].map(p=>api(p)));
  pages.forEach(normalize);
  if(currentUser?.kiosk){
    const homePage=startingPage(pages,currentUser);
    const home=button('Home',document.querySelector('.header-start'),()=>{
      if(!homePage)return;
      closeContextMenu();
  closePageWindows();
      location.hash='#runtime/'+homePage.id;
    });
    home.id='kiosk-home';
    home.disabled=!homePage;
    home.title=homePage?'Go to starting page: '+homePage.name:'No starting page available';
  }
  if(suspendedEditor && currentUser?.administrator && !currentUser?.kiosk){
    ({page,selected,tab,ruleId}=suspendedEditor);suspendedEditor=null;dirty=true;
  } else {page=pages.find(p=>p.id===page?.id)||pages[0];dirty=false;}
  if(afterLogin || !location.hash || currentUser?.kiosk && !location.hash.startsWith('#runtime/')){
    page=startingPage(pages,currentUser);
    if(page)history.replaceState(history.state,'','#runtime/'+page.id);
    else if(afterLogin || !location.hash)history.replaceState(history.state,'','#pages');
  }
  if(afterLogin)navigation.reset();
  route();
  alarmAttention.setUser(currentUser);
}
function auth(setup)  {
  alarmAttention.setUser(null);
  applyTheme('system');
  document.body.classList.add('logged-out');
  account.replaceChildren();
  closeAccountPopup();
  document.body.classList.remove('kiosk-mode');
  document.querySelector('#exit-kiosk')?.remove();
  document.querySelector('#kiosk-home')?.remove();
  navigation.accept();
  document.querySelector('#navigation-back').disabled=!navigation.canBack();
  closeContextMenu();
  closePageWindows();
  closeLibrary?.();closeLibrary=null;
  closeEditorPanels?.();closeEditorPanels=null;
  sourceManager=null;
  document.querySelector('#page-menu').replaceChildren();
  document.querySelector('#view-tools').replaceChildren();
  disposeTextViewers();
  app.replaceChildren();
  if(setup)return mountFirstRun(app,{node,button,field,onCreate:async data=>{await api('setup',data);await start(true);},onRestore:data=>api('setup/restore',data)});
  const card=node('form',null,app, {
    className:'card auth'
  });
  if(siteLogo)node('img',null,card,{src:'/api/site/logo',alt:'Site logo',className:'login-logo'});
  node('h2',setup?'Welcome — create your account':'Sign in',card);
  const credentials=node('div',null,card,{className:'login-credentials'});
  const username=field('Username',credentials);
  username.autocomplete='username';
  username.required=true;
  const password=field(setup?'Password (8+ characters)':'Password',credentials,'password');
  password.required=true;
  password.autocomplete=setup?'new-password':'current-password';
  node('button',setup?'Create account':'Log in',card, {
    type:'submit'
  });
  card.onsubmit=e=> {
    e.preventDefault();
    safe(async()=> {
      await api(setup?'setup':'login', {
        username:username.value,password:password.value
      });
      await start(true);
    });
  };
}
let leavePending=null;
async function allowLeave() {
  document.activeElement?.blur();
  if(!dirty)return true;
  if(leavePending)return leavePending;
  leavePending=(async()=>{
    const choice=await confirmPageLeave(page?.name);
    if(choice==='cancel')return false;
    try{
      if(choice==='save')await saveEditorPage();
      else {
        const id=page.id;editHistory.pages.delete(id);
        pages=(await api('pages')).map(normalize);page=pages.find(p=>p.id===id) || pages[0];dirty=false;
      }
      return true;
    }catch(error){notify(error.message);return false;}
  })();
  try{return await leavePending;}finally{leavePending=null;}
}
async function choosePage(id) {
  if(id===page?.id)return true;
  if(!(await allowLeave()))return false;
  page=pages.find(p=>p.id===id);
  selected=null;
  dirty=false;
  return true;
}
let routeDecision=false;
function route() {
  if(routeDecision)return;
  if(closeLibrary?.isDirty?.()){
    routeDecision=true;
    safe(async()=>{try{if(await closeLibrary.beforeLeave()){routeDecision=false;route();}else navigation.cancel();}finally{routeDecision=false;}});
    return;
  }
  closeContextMenu();
  const inspectorScroll=location.hash===routedHash ? app.querySelector('.inspector')?.scrollTop : undefined;
  if(!catalog)return;
  const [name,id,control]=location.hash.slice(1).split('/');
  if(currentUser?.kiosk && name!=='runtime'){location.hash='#runtime/'+(pages.find(p=>p.id===currentUser.starting_page)?.id || pages[0]?.id || '');return;}
  if(currentUser && !currentUser.administrator && !['runtime','pages','alarms'].includes(name)){location.hash='#runtime/'+(pages[0]?.id || '');return;}
  if(pointEditingFocus && (name!=='editor' || (id && id!==page?.id)))finishPointEditingFocus();
  if(polylineDraft && (name!=='editor' || (id && id!==polylineDraft.page)))polylineDraft=null;
  if (dirty && location.hash !== routedHash && (name !== 'editor' && name !== 'runtime' || id && id !== page?.id)) {
    routeDecision=true;
    safe(async()=>{try{if(await allowLeave()){routeDecision=false;route();}else navigation.cancel();}finally{routeDecision=false;}});
    return;
  }
  navigation.accept();
  document.querySelector('#navigation-back').disabled=!navigation.canBack();
  closeContextMenu();
  closePageWindows();
  closeLibrary?.();closeLibrary=null;
  closeEditorPanels?.();closeEditorPanels=null;
  sourceManager=null;
  document.querySelector('#page-menu').replaceChildren();
  document.querySelector('#view-tools').replaceChildren();
  app.replaceChildren();
  if(location.hash!==routedHash) {
    if(id&&page?.id!==id&&!dirty)page=pages.find(p=>p.id===id)||page;
    if(control)selected=decodeURIComponent(control);
    
    routedHash=location.hash;
  }
  if(name==='alarms')closeLibrary=mountAlarms(app,{node,button,api,canManage:currentUser.administrator,tagSelect,getTags:()=>tags,getRoles:()=>accessRoles,initialId:id});
  else if(name==='assets'){
    const card=node('section',null,app,{className:'card assets-page'});node('h2','Assets',card);
    closeLibrary=mountAssetCenter(card,{api,onChanged:async()=>{pages=(await api('pages')).map(normalize);page=pages.find(p=>p.id===page?.id)||pages[0];}});
  }
  else if(name==='administration')closeLibrary=mountAdministration(app,{node,button,api,onSimulationChanged:reloadLists});
  else if(name==='pages')safe(showPages);
  else if(name==='tags')showSources();
  else if(name==='sheets')showSheets();
  else if(name==='editor'||name==='runtime')showEditor(name==='editor');
  else showSources();
  if(inspectorScroll!==undefined) {
    const inspector=app.querySelector('.inspector');
    if(inspector)inspector.scrollTop=inspectorScroll;
  }
}
function usageList(parent,uses,objectsOnly=false) {
  const box=node('div',null,parent, {
    className:'usage',role:'cell'
  });
  if(!uses.length)node('span','No references.',box, {
    className:'hint'
  });
  for(const use of uses){
    const label=use.controlName || use.control;
    const path=use.page && use.control==='@page'?use.name:`${use.name}\\${label}`;
    node('a',objectsOnly?path:`${path} → ${use.tag}`,node('div',null,box),{
      title:path,href:use.alarm?`#alarms/${use.alarm}`:use.page?`#editor/${use.page}/${encodeURIComponent(use.control)}`:'#sheets'
    });
  }

}
function sourceDialog(existing,sheetOnly=false) {
  dialog(sheetOnly?(existing?'Edit sheet settings':'Add sheet'):(existing?'Edit data source':'Add data source'),(body,submit)=> {
    body.closest('dialog').classList.add('source-dialog');
    function group(parent,title){const box=node('section',null,parent,{className:'settings-group'});node('h3',title,box);return node('div',null,box,{className:'settings-group-fields'});}
    const identity=group(body,'Data source');
    const name=field('Name',identity,'text',existing?.name || existing?.id || '');name.required=true;
    const kind=sheetOnly?{value:'sheet'}:select('Driver',identity,catalog.drivers.filter(x=>x!=='sheet').map(x=>[x,x==='pycomm3'?'PyComm3':x==='database'?'Database (SQLite)':x==='memory'?'Memory':x==='bacnet'?'BACnet/IP (BAC0)':x==='mqtt'?'MQTT (Paho)':x==='lightyak'?'LightYak (Serial)':x==='modbus'?'Modbus TCP / RTU (PyModbus)':x]));
    if(existing){kind.value=existing.kind;kind.disabled=true;}
    const settings=node('div',null,body),footer=submit.parentElement;
    let inputs={},testToken='',version=0,status,modbusValues={...existing?.settings};
    const collect=()=>Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.type==='checkbox'?input.checked:input.value]));
    const test=button('Test Connection',footer,async()=> {
      const revision=version;test.disabled=true;status.textContent='Testing connection…';
      try {
        const result=await api('sources/test',{kind:kind.value,settings:collect()});
        if(revision===version){testToken=result.test_token;status.textContent=`Connected: ${result.message}${result.tag_count?' · '+result.tag_count+' tags':''}`;}
      } catch(error) {if(revision===version)status.textContent=error.message;}
      finally {test.disabled=false;}
    });
    footer.prepend(test);test.className='source-test-button';
    function changed() {testToken='';version++;if(status)status.textContent='Connection has not been tested with these settings.';}
    function renderFields() {
      const saved=kind.value==='modbus'?modbusValues:existing?.settings || {};
      settings.replaceChildren();inputs={};changed();test.hidden=!['pycomm3','bacnet','mqtt','modbus','lightyak'].includes(kind.value);
      if(kind.value==='database'){
        const storage=group(settings,'Storage'),polling=group(settings,'Polling');
        inputs.filename=field('Database filename',storage,'text',saved.filename || 'Tags.sqlite3');inputs.filename.required=true;inputs.filename.readOnly=Boolean(existing);
        const files=node('datalist',null,settings,{id:'database-files'});inputs.filename.setAttribute('list','database-files');
        api('database/files').then(names=>{for(const name of names)node('option',null,files,{value:name});}).catch(error=>notify(error.message));
        node('p','Select an existing file or enter a new filename. Stored on the server in data/databases. Values persist across restarts.',settings,{className:'hint'});
        inputs.live=field('Live polling (seconds)',polling,'number',saved.live ?? .5);inputs.live.min=.1;inputs.live.step='any';
        inputs.background=field('Background polling (seconds)',polling,'number',saved.background ?? 20);inputs.background.min=.1;inputs.background.step='any';return;
      }
      if(kind.value==='memory'){node('p','Simulation runs locally; no connection settings required.',settings,{className:'hint'});return;}
      if(kind.value==='sheet') {
        const storage=group(settings,'Storage'),polling=group(settings,'Polling');
        inputs.filename=field('Filename',storage,'text',saved.filename || 'Sheet.sheet.json');inputs.filename.required=true;
        node('p','Stored in data/sheets. Fixed size: A1:D15. Formulas use =A1+B1 or =TAG("Source\\Tag").',settings,{className:'hint'});
        for(const [key,label,value] of [['background','Background polling (seconds)',20],['live','Live polling (seconds)',.5]]) {
          const input=inputs[key]=field(label,polling,'number',saved[key] ?? value);input.min=.1;input.max=60;input.step='any';input.required=true;
        }
        return;
      }
      if(kind.value==='lightyak') {
        const rows=group(settings,'Serial connection'),polling=group(settings,'Polling & timing');
        inputs.serial_port=field('Serial port',rows,'text',saved.serial_port || '');inputs.serial_port.required=true;inputs.serial_port.placeholder='COM6 or /dev/ttyACM0';
        const ports=node('datalist',null,rows,{id:'lightyak-serial-ports'}),portInput=inputs.serial_port;portInput.setAttribute('list',ports.id);
        api('admin/serial-ports').then(items=>{if(portInput.isConnected)for(const item of items)node('option',item.description,ports,{value:item.port});}).catch(()=>{});
        inputs.parity=select('Parity',rows,[['N','None'],['E','Even'],['O','Odd']],saved.parity || 'N');
        inputs.stopbits=select('Stop bits',rows,[['1','1'],['2','2']],String(saved.stopbits ?? 1));
        for(const [key,label,value,min,max,step] of [['baudrate','Baud rate',115200,300,1000000,1],['timeout','Response timeout (seconds)',2,.1,60,'any'],['startup_delay','Startup delay after opening port (seconds)',2,0,60,'any'],['offline_retry','Offline retry delay (seconds)',5,1,300,'any'],['live','Live polling (seconds)',.5,.1,60,'any'],['background','Background polling (seconds)',20,.1,60,'any']]) {
          const input=inputs[key]=field(label,key==='baudrate'?rows:polling,'number',saved[key] ?? value);Object.assign(input,{min,max,step,required:true});
        }
        node('p','LightYak v1: one device per serial port, 8 data bits. Default 115200, no parity, 1 stop bit. Startup delay defaults to 2 seconds for devices that reset when connected. Sources sharing a port must use matching serial and timing settings.',settings,{className:'hint'});
        status=node('p','Connection has not been tested.',settings,{className:'hint'});
        for(const input of Object.values(inputs))input.addEventListener('input',changed);
        return;
      }
      if(kind.value==='modbus') {
        const rows=group(settings,'Connection'),polling=group(settings,'Polling & timing');
        inputs.transport=select('Transport',rows,[['tcp','TCP (Ethernet)'],['rtu','RTU (Serial / RS-485)']],saved.transport || 'tcp');
        const rtu=inputs.transport.value==='rtu';
        if(rtu){
          inputs.serial_port=field('Serial port',rows,'text',saved.serial_port || '');inputs.serial_port.required=true;
          const ports=node('datalist',null,rows,{id:'modbus-serial-ports'});inputs.serial_port.setAttribute('list',ports.id);
          const portInput=inputs.serial_port;
          api('admin/serial-ports').then(items=>{if(!portInput.isConnected)return;for(const item of items)node('option',item.description,ports,{value:item.port});}).catch(()=>{});
          inputs.baudrate=field('Baud rate',rows,'number',saved.baudrate ?? 19200);Object.assign(inputs.baudrate,{min:300,max:1000000,step:1,required:true});
          inputs.parity=select('Parity',rows,[['N','None'],['E','Even'],['O','Odd']],saved.parity || 'N');
          inputs.stopbits=select('Stop bits',rows,[['1','1'],['2','2']],String(saved.stopbits ?? 1));
          inputs.handle_local_echo=select('Adapter echoes transmitted data',rows,[['false','No'],['true','Yes']],String(saved.handle_local_echo ?? false));
        }else{
          inputs.host=field('Device host / IP address',rows,'text',saved.host || '');inputs.host.required=true;inputs.host.placeholder='192.168.1.10';
          inputs.port=field('TCP port',rows,'number',saved.port ?? 502);Object.assign(inputs.port,{min:1,max:65535,step:1,required:true});
        }
        for(const [key,label,value,min,max,step] of [['unit_id','Unit ID',1,rtu?1:0,rtu?247:255,1],['timeout','Response timeout (seconds)',rtu?.5:3,.1,60,'any'],['background','Background polling (seconds)',20,.1,60,'any'],['live','Live polling (seconds)',.5,.1,60,'any'],...(rtu?[['startup_delay','Startup delay after opening port (seconds)',0,0,60,'any'],['offline_retry','Offline retry delay (seconds)',5,1,300,'any']]:[])]){
          const input=inputs[key]=field(label,key==='unit_id'?rows:polling,'number',saved[key] ?? value);Object.assign(input,{min,max,step,required:true});
        }
        node('p',rtu?'One source per device Unit ID. Sources on the same serial port share one connection and take turns. Use identical baud rate, parity, stop bits, timeout and echo settings. Offline retry delays increase up to 60 seconds (or your initial delay if higher). Use an auto-direction RS-485 adapter; data bits are fixed at 8.':'Standard Modbus TCP. Tags use the register map supplied by the device manufacturer. Each source connects to one host and Unit ID.',settings,{className:'hint'});
        status=node('p','Connection has not been tested.',settings,{className:'hint'});
        for(const input of Object.values(inputs))input.addEventListener('input',changed);
        inputs.transport.onchange=()=>{const next=collect();if(Number(next.timeout)===(rtu?.5:3))next.timeout=next.transport==='rtu'?.5:3;modbusValues={...modbusValues,...next};render();};
        return;
      }
      if(kind.value==='mqtt') {
        const connection=group(settings,'Connection'),security=group(settings,'Security'),delivery=group(settings,'Delivery'),polling=group(settings,'Refresh & timing');
        for(const [key,label,type,value] of [['host','Broker host','text',''],['port','Port','number',1883],['client_id','Client ID (blank generates one)','text',''],['username','Username (optional)','text',''],['password','Password (optional)','password',''],['keepalive','Keep alive (seconds)','number',60],['timeout','Connection / publish timeout (seconds)','number',5],['background','Background refresh (seconds)','number',20],['live','Live refresh (seconds)','number',.5]]) {
          inputs[key]=field(label,['host','port','client_id'].includes(key)?connection:['username','password'].includes(key)?security:polling,type,saved[key] ?? value);
          if(type==='number'){inputs[key].min=.1;inputs[key].step='any';}
        }
        inputs.host.required=true;
        inputs.qos=select('QoS',delivery,[['0','0 - At most once'],['1','1 - At least once'],['2','2 - Exactly once']],String(saved.qos ?? 0));
        for(const [key,label] of [['tls','Use TLS (system trusted certificates)'],['retain','Retain published values']])inputs[key]=select(label,key==='tls'?security:delivery,[['false','No'],['true','Yes']],String(saved[key] ?? false));
        node('p','MQTT 3.1.1 over TCP. Typical ports: 1883, or 8883 with TLS. Tags use exact topics and scalar number, boolean, or text payloads.',settings,{className:'hint'});
        status=node('p','Connection has not been tested.',settings,{className:'hint'});
        for(const input of Object.values(inputs))input.addEventListener('input',changed);
        return;
      }
      const connection=group(settings,'Connection');
      const local=inputs.local_ip=select('Local network interface',connection,[['','Automatic (system routing)']]);
      if(saved.local_ip){node('option',saved.local_ip+' (saved interface)',local,{value:saved.local_ip});local.value=saved.local_ip;}
      api('network/interfaces').then(interfaces=> {
        if(!local.isConnected)return;
        const value=local.value;local.replaceChildren();node('option',kind.value==='bacnet'?'Choose BACnet interface…':'Automatic (system routing)',local,{value:''});
        for(const item of interfaces)node('option',`${item.name} — ${item.address}`,local,{value:item.address});
        if(value && !interfaces.some(item=>item.address===value))node('option',value+' (currently unavailable)',local,{value});
        local.value=value;
      }).catch(error=>notify(error.message));
      if(kind.value==='bacnet') {
        local.required=true;
        local.options[0].textContent='Choose BACnet interface…';
        inputs.target=field('Discovery target (optional)',connection,'text',saved.target || '');inputs.target.placeholder='Local broadcast, or 192.168.1.10:47808';
        const addressing=node('div',null,connection,{className:'source-rates'});
        for(const [key,label,value,min,max] of [['prefix','Subnet prefix',24,1,32],['port','UDP port',47808,1,65535],['device_id','Local device instance',3056177,1,4194302]]) {
          const input=inputs[key]=field(label,addressing,'number',saved[key] ?? value);input.min=min;input.max=max;input.required=true;
        }
        node('p','Use this computer’s interface and subnet prefix. Device names come from Object Name; reads use device/object identifiers.',connection,{className:'hint'});
        const rates=group(settings,'Polling & timing');
        for(const [key,label,value] of [['timeout','Request timeout (seconds)',5],['background','Background polling (seconds)',20],['live','Live polling (seconds)',.5]]) {
          const input=inputs[key]=field(label,rates,'number',saved[key] ?? value);input.min=.1;input.max=60;input.step='any';input.required=true;
        }
        const covGroup=group(settings,'Change of value (COV)');
        const cov=inputs.use_cov=field('Use COV when available',covGroup,'checkbox');cov.checked=saved.use_cov===true;
        cov.parentElement.classList.add('checkbox-row');
        const covOptions=node('div',null,covGroup,{className:'source-rates source-cov-options'});
        for(const [key,label,value,min,max] of [['cov_lifetime','COV subscription lifetime (seconds)',300,30,86400],['cov_verify','COV verification read (seconds)',30,1,3600]]){
          const input=inputs[key]=field(label,covOptions,'number',saved[key] ?? value);input.min=min;input.max=max;input.step=1;input.required=true;
        }
        const confirmed=inputs.cov_confirmed=field('Confirmed COV notifications',covOptions,'checkbox');confirmed.checked=saved.cov_confirmed===true;confirmed.parentElement.classList.add('checkbox-row');
        const covHint=node('p','Present Value uses COV where supported, with automatic renewal and periodic verification reads. Unsupported objects and other properties keep polling. Browser refresh intervals stay the same.',covGroup,{className:'hint'});
        const showCov=()=>{covOptions.hidden=!cov.checked;covHint.hidden=!cov.checked;for(const input of covOptions.querySelectorAll('input'))input.disabled=!cov.checked;};
        cov.onchange=showCov;showCov();
        const advanced=node('details',null,settings);node('summary','Discovery and write settings',advanced);
        const extra=group(advanced,'Discovery & writes');
        for(const [key,label,value,min,max,step] of [['discovery_min','Device instance minimum',0,0,4194302,1],['discovery_max','Device instance maximum',4194302,0,4194302,1],['discovery_timeout','Discovery wait (seconds)',3,.1,30,'any'],['write_priority','Write priority',16,1,16,1],['batch_size','Properties per request',20,1,50,1],['bbmd_ttl','BBMD registration TTL',900,30,65535,1]]) {
          const input=inputs[key]=field(label,extra,'number',saved[key] ?? value);input.min=min;input.max=max;input.step=step;input.required=true;
        }
        inputs.bbmd_address=field('BBMD address (optional)',extra,'text',saved.bbmd_address || '');inputs.bbmd_address.placeholder='192.168.1.2:47808';
        status=node('p',existing?.tested_at?'Connection previously tested.':'Connection has not been tested.',settings,{className:'hint'});
        for(const input of Object.values(inputs))input.addEventListener('input',changed);
        return;
      }
      inputs.path=field('Device network path',connection,'text',saved.path || '');inputs.path.required=true;inputs.path.placeholder='192.168.1.10/0';
      const typeRow=node('div',null,connection,{className:'source-type-row'});
      inputs.protocol=select('Mode',typeRow,[['logix','Logix'],['slc','SLC'],['cip','CIP']],saved.protocol || 'logix');
      const typeLocked=Boolean(existing && tags.some(tag=>tag.source===existing.id));
      inputs.protocol.disabled=typeLocked;
      inputs.protocol.title=typeLocked?'Mode is fixed while this source has tags':'';
      const auto=button('Auto Select',typeRow,async()=> {
        if(!inputs.path.value.trim()){await showMessage('Enter the device network path first.',{title:'Device Path Required'});return;}
        const revision=version;auto.disabled=true;submit.disabled=true;test.disabled=true;auto.textContent='Working...';
        try {
          const result=await api('sources/auto-select',{settings:collect()});
          if(revision!==version)return;
          inputs.protocol.value=result.protocol;updateTypeHint();changed();status.textContent=`Detected: ${result.message} · ${result.protocol.toUpperCase()}. Connection has not been tested.`;
        } catch(error) {await showMessage(error.message,{title:'Auto Select Failed'});}
        finally {auto.disabled=false;submit.disabled=false;test.disabled=false;auto.textContent='Auto Select';}
      });
      auto.hidden=typeLocked;
      const typeHint=node('p','',connection,{className:'hint'});
      function updateTypeHint() {
        typeHint.textContent={logix:'Logix: CompactLogix, ControlLogix, Micro800',slc:'SLC: SLC 500, MicroLogix',cip:'CIP: EtherNet/IP drives, meters, remote I/O, and other CIP devices'}[inputs.protocol.value];
      }
      inputs.protocol.onchange=updateTypeHint;updateTypeHint();
      const rates=group(settings,'Polling & timing');
      for(const [key,label,value] of [['timeout','Connection timeout (seconds)',5],['background','Background polling (seconds)',20],['live','Live polling (seconds)',0.5]]) {
        const input=inputs[key]=field(label,rates,'number',saved[key] ?? value);input.min=0.1;input.max=key==='timeout'?3600:60;input.step='any';input.required=true;
      }
      status=node('p',existing?.tested_at?'Connection previously tested.':'Connection has not been tested.',settings,{className:'hint'});
      for(const input of Object.values(inputs))input.addEventListener('input',changed);
    }
    let hintNumber=0;
    function addHint(input,text,placeholder){
      if(!input || !text)return;
      const label=input.parentElement;
      input.setAttribute('aria-label',label.firstChild.textContent);
      const hint=node('small',text,label,{className:'source-field-hint',id:'source-field-hint-'+(++hintNumber)});
      input.setAttribute('aria-describedby',hint.id);
      if(placeholder && input.tagName==='INPUT')input.placeholder=placeholder;
    }
    addHint(name,'Choose a recognizable name for this source.','Example: Main PLC');
    if(!sheetOnly)addHint(kind,'Choose the protocol or storage used by this source.');
    function render(){
      renderFields();
      const hints={
        filename:[kind.value==='sheet'?'Sheet filename on this server.':'SQLite filename on this server; values persist after restart.',kind.value==='sheet'?'Example: Sheet.sheet.json':'Example: Tags.sqlite3'],
        host:[kind.value==='mqtt'?'Broker hostname or IP address; enter the port separately.':'Device hostname or IP address; enter the port separately.','Example: 192.168.1.10'],
        port:[kind.value==='bacnet'?'Usual BACnet/IP port: UDP 47808.':kind.value==='mqtt'?'Usual MQTT ports: TCP 1883, or 8883 with TLS.':'Usual Modbus TCP port: 502.'],
        local_ip:[kind.value==='bacnet'?'Select this server’s interface on the BACnet network.':'Select this server’s interface, or let system routing choose.'],
        path:['PLC IP address and optional routing path.','Example: 192.168.1.10/0'],
        protocol:['Match the controller family, or use Auto Select.'],
        target:['Leave blank for local broadcast, or enter a device IP and optional port.','Example: 192.168.1.10:47808'],
        prefix:['Subnet prefix length; 24 corresponds to 255.255.255.0.'],
        device_id:['Unique BACnet device instance for this server on the network.'],
        unit_id:['Use the device address; RTU supports 1–247 (broadcast writes are not supported).'],
        transport:['Use TCP for Ethernet devices or RTU for a serial / RS-485 adapter.'],
        serial_port:['Port on the server, not the browser computer. Choose a detected port or type its name.','COM3 or /dev/ttyUSB0'],
        baudrate:[kind.value==='lightyak'?'Match the LightYak device; the reference configuration uses 115200 baud.':'Match every device on this serial bus; commonly 9600 or 19200 baud.'],
        parity:['Match every device on this serial bus.'],
        stopbits:['Match every device on this serial bus.'],
        handle_local_echo:['Enable only if the adapter sends your own transmitted bytes back to the receiver.'],
        startup_delay:[kind.value==='lightyak'?'Wait once after the shared serial port opens or reopens. Defaults to 2 seconds for Arduino startup; set to 0 if no delay is needed. Sources sharing a port must match.':'Wait once after the shared serial port opens or reopens. Leave at 0 for normal devices; try 2 seconds for an Arduino that resets on connection. Sources sharing a port must match.'],
        offline_retry:['Initial pause after a communication failure; repeated failures increase the delay.'],
        timeout:['Maximum time to wait for a device response, in seconds.'],
        live:[kind.value==='mqtt'?'Refresh interval while tags are in use; messages arrive by subscription.':'Polling interval while tags are actively used, in seconds.'],
        background:[kind.value==='mqtt'?'Background refresh interval; messages arrive by subscription.':'Polling interval when tags are not actively used, in seconds.'],
        client_id:['Leave blank to generate a client ID; explicit IDs must be unique.','Blank: automatic'],
        username:['Optional broker username.','Optional'],
        password:['Optional broker password.','Optional'],
        keepalive:['MQTT connection keep-alive interval, in seconds.'],
        qos:['Requested delivery quality for MQTT subscriptions and publishing.'],
        tls:['Use encrypted MQTT with a system-trusted server certificate.'],
        retain:['Ask the broker to retain values published by this source.'],
        use_cov:['Subscribe to changes where supported; other properties keep polling.'],
        cov_lifetime:['Subscription lifetime before renewal, in seconds.'],
        cov_verify:['Seconds between verification reads while COV is active.'],
        cov_confirmed:['Request notifications that require acknowledgement.'],
        discovery_min:['Lowest device instance included in discovery.'],
        discovery_max:['Highest device instance included in discovery.'],
        discovery_timeout:['Time to wait for discovery replies, in seconds.'],
        write_priority:['BACnet write priority, from 1 (highest) to 16 (lowest).'],
        batch_size:['Maximum properties grouped into one read request.'],
        bbmd_ttl:['Foreign-device registration lifetime, in seconds.'],
        bbmd_address:['Optional BBMD IP and port for routed BACnet networks.','Example: 192.168.1.2:47808']
      };
      for(const [key,input] of Object.entries(inputs))addHint(input,...(hints[key] || []));
    }
    kind.onchange=render;render();
    return async()=> {
      await api(existing?'sources/edit':'sources',{id:existing?.id,name:name.value,kind:kind.value,settings:collect(),test_token:testToken});
      await reloadLists();route();
    };
  });
}
function showSources() {
  const refreshSelection=async()=>{
    const tag=sourceManager?.selectedTag();if(!tag)return;
    const data=await api('values/batch',{source:tag.source,tags:[tag.id],pages:[]});Object.assign(values,data.values);sourceManager?.refresh();
  };
  sourceManager=mountSourceManager(app,{node,button,getSources:()=>sources,getTags:()=>tags,getValues:()=>values,usageList,
    onPauseSource:(source,paused)=>safe(async()=>{await api('sources/pause',{id:source.id,paused});applySourceStatuses(sources,await api('sources/status'));sourceManager?.refresh();await refreshSelection();}),
    onAddSource:()=>sourceDialog(),onEditSource:source=>sourceDialog(source),
    onRemoveSource:source=>confirmDialog('Remove source?',`Remove ${source.name || source.id} and its ${source.tags.length} unused tag(s)?`,async()=>{await api('sources/remove',{id:source.id});await reloadLists();route();}),
    onAddTag:source=>tagDialog(source),onEditTag:editTagDialog,
    onRemoveTag:tag=>confirmDialog('Remove tag?',`Remove ${tag.name || tag.id}?`,async()=>{await api('tags/remove',{id:tag.id});await reloadLists();route();}),
    onSelectTag:()=>safe(refreshSelection)
  });
  safe(refreshSelection);
}
function protocolTagDialog(source) {
  const slc=source.settings.protocol==='slc';
  dialog(`Add ${slc?'SLC':'CIP'} tag — ${source.name || source.id}`,body=> {
    const name=field('Tag name',body);name.required=true;
    let address,classCode,instance,attribute,dtype;
    if(slc) {
      address=field('Data-file address',body);address.required=true;address.placeholder='N7:0, F8:0, B3:0/0, T4:0.ACC';
      node('p','Enter one element or member. SLC/MicroLogix use data files rather than Logix symbolic tags.',body,{className:'hint'});
    } else {
      classCode=field('Class',body);classCode.required=true;classCode.placeholder='Decimal or 0x hexadecimal';
      instance=field('Instance',body,'text','1');instance.required=true;
      attribute=field('Attribute',body);attribute.required=true;
      dtype=select('Data type',body,['BOOL','SINT','INT','DINT','LINT','USINT','UINT','UDINT','ULINT','REAL','LREAL'].map(type=>[type,type]),'DINT');
      node('p','Use the device manual for class, instance, attribute and data type. Reads use Get Attribute Single; writes use Set Attribute Single. Structured or assembly data requires a device-specific adapter.',body,{className:'hint'});
    }
    return async()=> {
      const target=slc?address.value.trim().toUpperCase():`${classCode.value.trim()}/${instance.value.trim()}/${attribute.value.trim()}:${dtype.value}`;
      await api('tags',{name:name.value,source:source.id,address:target});
      await reloadLists();route();
    };
  });
}
async function tagDialog(chosenSource) {
  if(chosenSource?.kind==='lightyak')return lightyakTagBrowser({source:chosenSource,dialog,node,field,button,api,reload:reloadLists,onDone:route});
  if(chosenSource?.kind==='modbus')return modbusTagDialog({source:chosenSource,dialog,node,field,select,button,api,reload:reloadLists,onDone:route});
  if(chosenSource?.kind==='mqtt')return mqttTagBrowser({source:chosenSource,dialog,node,field,button,api,reload:reloadLists,onDone:route});
  if(chosenSource?.kind==='bacnet')return bacnetTagBrowser({source:chosenSource,dialog,node,field,button,api,reload:reloadLists,onDone:route});
  if(chosenSource?.kind==='sheet') {
    const address=await openSheetDialog({source:chosenSource,getSheet:getSheetData,onInterest:sheetInterest,readOnly:true});
    if(address){await ensureSheetTag(chosenSource,address);route();}return;
  }
  if(chosenSource?.kind==='pycomm3' && chosenSource.settings.protocol && chosenSource.settings.protocol!=='logix')return protocolTagDialog(chosenSource);
  if(chosenSource?.kind==='pycomm3')return plcTagBrowser({source:chosenSource,dialog,node,field,button,api,reload:reloadLists,onDone:route});
  dialog('Add tag',body=> {
    const name=field('Name',body);
    name.required=true;
    const source=select('Data source',body,sources.filter(s=>['memory','system','database'].includes(s.kind)).map(s=>[s.id,s.name || s.id]),chosenSource?.id);
    source.disabled=Boolean(chosenSource);
    source.required=true;
    if(chosenSource?.kind==='system')node('p','New System tags are created in Memory.',body,{className:'hint'});
    return async()=> {
      await api('tags', {
        name:name.value,source:source.value
      });
      await reloadLists();
      route();
    };
  });
}
function editTagDialog(tag) {
  const source=sources.find(s=>s.id===tag.source);
  if(source?.kind==='lightyak')return lightyakTagBrowser({source,tag,dialog,node,field,button,api,reload:reloadLists,onDone:route});
  if(source?.kind==='modbus')return modbusTagDialog({source,tag,dialog,node,field,select,button,api,reload:reloadLists,onDone:route});
  dialog('Edit tag',body=> {
    const name=field('Name',body,'text',tag.name || tag.id);name.required=true;name.readOnly=!(['memory','system','database'].includes(source.kind) || source.kind==='bacnet' || source.kind==='mqtt' || source.kind==='lightyak' || source.settings.protocol==='slc');
    if(source.kind==='bacnet')node('p','Saved inline tag references will continue to work with the old tag name. Use the new name for new references.',body,{className:'hint'});
    let address;
    if(!['memory','system','database','sheet'].includes(source.kind)) {
      address=field(source.kind==='mqtt'?'Topic':'Object / address',body,'text',tag.address);
      address.readOnly=source.kind!=='mqtt';
    }
    if(source.kind==='pycomm3' && (source.settings.protocol || 'logix')==='logix')node('p','PLC-reported access: '+(tag.reported_access || 'Unknown')+'. Informational only; the device accepts or rejects writes.',body,{className:'hint'});
    return async()=> {
      await api('tags/edit',{id:tag.id,name:name.value,...(source.kind==='mqtt'?{address:address.value}:{})});
      await reloadLists();route();
    };
  });
}
function downloadJson(data,filename) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=node('a',null,document.body,{href:url,download:filename});link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function importFile(kind) {
  const upload=node('input',null,document.body,{type:'file',accept:'.json',hidden:true});
  upload.onchange=()=>safe(async()=>{
    const file=upload.files[0];if(!file)return;
    try{
      if(file.size>15*1024*1024)throw new Error('Import files must be 15 MB or smaller');
      const payload=JSON.parse(await file.text());
      dialog('Import '+(kind==='pages'?'page':'sheet'),body=>{
        const name=field('Name',body,'text',(payload.name || payload.page?.name || 'Imported '+kind.slice(0,-1))+' Copy');name.required=true;
        let filename,background,live;
        if(kind==='sheets'){
          filename=field('Filename',body,'text',(payload.settings?.filename || file.name).replace(/(?:\.sheet)?\.json$/i,'')+'-copy.sheet.json');filename.required=true;
          background=field('Background polling (seconds)',body,'number',payload.settings?.background ?? 20);live=field('Live polling (seconds)',body,'number',payload.settings?.live ?? .5);
          for(const input of [background,live]){input.min=.1;input.max=60;input.step='any';input.required=true;}
        }
        node('p','Imports a new '+kind.slice(0,-1)+'. Existing items are not overwritten. Referenced tags and destination pages must already exist.',body,{className:'hint'});
        return async()=>{
          await api(kind+'/import',kind==='sheets'?{sheet:payload,name:name.value,settings:{filename:filename.value,background:background.value,live:live.value}}:{page:payload,name:name.value});
          await reloadLists();route();
        };
      });
    }finally{upload.remove();}
  });upload.oncancel=()=>upload.remove();upload.click();
}
function libraryReferences(parent,uses,showEmpty=true){
  const box=node('div',null,parent,{className:'library-references'});
  if(showEmpty && !uses.length)node('p','No references.',box,{className:'hint'});
  for(const use of uses)node('a',use.control==='@page'?use.name:use.name+'\\'+(use.controlName || use.control),box,{href:use.page?'#editor/'+use.page+'/'+encodeURIComponent(use.control):'#sheets'});
}
function showSheets() {
  closeLibrary=mountSheets(app,{items:sources.filter(s=>s.kind==='sheet'),node,button,
    getSheet:getSheetData,saveSheet:(source,cells)=>api('sheets/save',{source,cells,validate:true}),onInterest:sheetInterest,
    onTag:async()=>{const id=await openTagSelector(pickerProviders());const tag=tags.find(tag=>tag.id===id);return tag?tagPath(tag):null;},
    onAdd:()=>sourceDialog(null,true),onImport:()=>importFile('sheets'),onSettings:s=>sourceDialog(s,true),
    onExport:async s=>downloadJson(await api('sheets/export',{source:s.id}),s.settings.filename),
    onRemove:s=>confirmDialog('Delete sheet?',`Delete ${s.name}? Its file will be moved to data/sheets/.trash.`,async()=>{await api('sheets/remove',{source:s.id});await reloadLists();route();}),
    references:libraryReferences
  });
}
async function showPages() {
  if(currentUser && !currentUser.administrator){
    const card=node('section',null,app,{className:'card simple-pages'});node('h2','Pages',card);
    for(const saved of pages)button(saved.name,card,()=>{location.hash='#runtime/'+saved.id;});
    return;
  }
  pages=(await api('pages')).map(normalize);if(location.hash.split('/')[0]!=='#pages')return;
  page=pages.find(p=>p.id===page?.id)||pages[0];
  closeLibrary=mountLibrary(app,{kind:'pages',items:pages,node,button,
    describe:p=>`${p.width} × ${p.height} · ${p.controls.length} controls`,
    onAdd:()=>dialog('Add page',body=>{const name=field('Page name',body);name.required=true;return async()=>{await api('pages/add',{name:name.value});route();};}),
    onImport:()=>importFile('pages'),
    onSettings:p=>dialog('Rename page',body=>{const name=field('Name',body,'text',p.name);name.required=true;return async()=>{await api('pages',{...p,name:name.value});route();};}),
    canRemove:p=>!p.usage?.length,
    onRemove:p=>confirmDialog('Remove page?',`Remove ${p.name} and its controls?`,async()=>{await api('pages/remove',{id:p.id});dirty=false;route();}),
    onOpen:async p=>{if(!(await choosePage(p.id)))return;selected=PAGE_SELECTION;location.hash='#editor/'+p.id;route();},
    onView:async p=>{if(!(await choosePage(p.id)))return;location.hash='#runtime/'+p.id;},
    onExport:async p=>downloadJson(await api('pages/export',{id:p.id}),p.name.replace(/[<>:"/\\|?*]/g,'_')+'.page.json'),
    mountPreview:(parent,p)=>{
      parent.classList.remove('library-sheet-preview');
      const frame=node('div',null,parent,{className:'library-page-frame'}),canvas=node('div',null,frame,{className:'canvas library-page-canvas'});stylePage(canvas,p);
      for(const c of paintOrder(p)){const el=node('div',null,canvas,{className:'control'});paint(el,c,p,true);}
      const size=()=>{const scale=Math.min((parent.clientWidth-32)/p.width,(parent.clientHeight-32)/p.height);frame.style.width=p.width*scale+'px';frame.style.height=p.height*scale+'px';canvas.style.transform='scale('+scale+')';};
      const observer=new ResizeObserver(size);observer.observe(parent);size();return ()=>observer.disconnect();
    },
    showDetails:(parent,p,state,refresh)=>{
      node('strong',p.name,parent);node('p',`${p.width} × ${p.height} · ${p.controls.length} controls · ${(p.parameters || []).length} parameters`,parent,{className:'library-meta'});
      const tabs=node('div',null,parent,{className:'library-detail-tabs'});
      for(const key of ['references','parameters']){const b=button(key==='references'?`References (${p.usage?.length || 0})`:`Parameters (${p.parameters?.length || 0})`,tabs,()=>{state.tab=key;refresh();});b.setAttribute('aria-selected',String(state.tab===key));}
      if(state.tab==='parameters'){for(const parameter of p.parameters || []){const row=node('div',null,parent,{className:'library-parameter'});node('strong',parameter.name,row);node('span',parameter.description,row);}}
      else libraryReferences(parent,p.usage || [],false);
    }
  });
}

// Property edits keep the surrounding editor and Explorer DOM intact.
function refreshEditedControl(c,refreshInspector=false) {
  if(c.type==='group'){const box=app.querySelector('.group-bounds');if(box){box.dataset.groupName=c.name;box.setAttribute('aria-label','Move group '+c.name);}}
  for(const el of app.querySelectorAll('.editor .control'))if(el.dataset.controlId===c.id)paint(el,c);
  for(const option of app.querySelectorAll('.control-selection option'))if(option.value===c.id){
    const label=c.type==='group'?((explorerTypes.get(page.id) || 'all')==='group'?'':(explorerTypes.get(page.id) || 'all')!=='all'?'▾ ':collapsedGroups.has(c.id)?'▸ ':'▾ ')+c.name:(c.groupId?'\u00a0\u00a0\u00a0\u00a0↳ ':'')+explorerLabel(c);if(option.textContent!==label)option.textContent=label;
  }
  const panel=app.querySelector('.inspector');
  if(refreshInspector && panel){const scroll=panel.scrollTop;showInspector(panel);panel.scrollTop=scroll;}
  else {
    for(const field of panel?.querySelectorAll('[data-control-property]') || []){const key=field.dataset.controlProperty;if(['left','top','width','height'].includes(key))field.value=c[key];}
    const edges=panel?.querySelector('.layout-edges');
    if(edges)edges.textContent=`Right: ${c.left+c.width} \u00b7 Bottom: ${c.top+c.height}`;
  }
}
function refreshEditorGrid(){
  const canvas=app.querySelector('.editor .canvas');if(!canvas)return;
  canvas.style.setProperty('--grid-size',grid+'px');
  canvas.classList.toggle('grid',Boolean(grid) && gridStyle==='lines');
  canvas.classList.toggle('grid-dots',Boolean(grid) && gridStyle==='dots');
}
function refreshEditedPage() {
  const canvas=app.querySelector('.editor .canvas');
  if(canvas){stylePage(canvas,page);viewport?.updateSize();}
}

function showPageProperties(panel) {
  if (tab !== 'Properties') return void node('p', 'Select a control to edit its actions or events.', panel, {className:'hint'});
  button('Configure Parameters',panel,async()=>{
    const previous=structuredClone(page.parameters || []),next=await configureParameters(previous);
    if(next!==null){page.parameters=next;renameParameterText(page,previous);markChanged();route();}
  });
  node('hr',null,panel,{className:'sidebar-divider'});
  node('h3','Layout',panel);
  const border=field('Show Border',panel,'checkbox');border.checked=page.showBorder!==false;
  border.parentElement.classList.add('checkbox-row');
  border.onchange=()=>{page.showBorder=border.checked;markChanged();refreshEditedPage();};
  const background=field('Show Background',panel,'checkbox');background.checked=page.showBackground!==false;
  background.parentElement.classList.add('checkbox-row');
  background.onchange=()=>{page.showBackground=background.checked;markChanged();refreshEditedPage();};
  const sizeFields=node('div',null,panel,{className:'designer-field-grid'});
  for (const [key,title] of [['width','Width'],['height','Height']]) {
    const input=field(title,sizeFields,'number',page[key]); input.min=20; input.max=10000;
    input.onchange=()=>{page[key]=Math.min(10000,Math.max(20,Number(input.value)||20));input.value=page[key];markChanged();refreshEditedPage();};
  }
  for (const [key,title,options] of [
    ['horizontalAlignment','Horizontal Alignment',['left','center','right']],
    ['verticalAlignment','Vertical Alignment',['top','center','bottom']]]) {
    alignmentPicker(title,panel,key==='horizontalAlignment'?'horizontal':'vertical',page[key],value=>{page[key]=value;markChanged();});
  }
  node('hr',null,panel,{className:'sidebar-divider'});
  node('h3','Colors',panel);
  const row=node('div',null,panel,{className:'color-picker-row'});
  colorPicker('Back',row,page.backColor,value=>{page.backColor=value;markChanged();refreshEditedPage();});
}

function stylePage(canvas, owner) {
  canvas.dataset.pageId=owner.id;
  canvas.classList.toggle('page-border',owner.showBorder!==false);
  canvas.style.width=owner.width+'px'; canvas.style.height=owner.height+'px';
  canvas.style.backgroundColor=owner.showBackground===false?'transparent':owner.backColor;
}
function alignPageSurface(surface, owner) {
  const align={left:'start',top:'start',center:'safe center',right:'safe end',bottom:'safe end'};
  surface.style.justifyItems=align[owner.horizontalAlignment];
  surface.style.alignItems=align[owner.verticalAlignment];
}
function renderPopupPage(container, owner) {
  const canvas=node('div',null,container,{className:'canvas'});stylePage(canvas,owner);runtimeOwners.set(canvas,owner);
  for(const c of paintOrder(owner))renderControl(canvas,c,owner,false);
}
async function executeAction(action, point, control) {
  if(action._access){
    const reference=action._access;
    try{action={...await api('actions/authorize',{_access:reference}),_access:reference};}
    catch(error){if(error.status===403){notify(error.message);return;}throw error;}
  }
  if(action.action==='value_input') {
    const tag=tags.find(tag=>tag.id===action.tag),sample=values[action.tag];
    const defaults=control?.type==='numeric'?control:{};
    await openValueInput({...action,promptText:action.promptText || '',unitText:action.unitText || defaults.unitText || ''},{name:tag?tagPath(tag):'',value:sample?.quality==='good'?sample.value:undefined,onSubmit:value=>api('action',{...action,value})});
    return;
  }
  if (!['navigate','popup'].includes(action.action)) return api('action',action);
  const destination=pages.find(p=>p.id===action.page);
  if (!destination) throw new Error('Destination page no longer exists');
  if (action.action==='navigate') {
    mainConnections={page:destination.id,values:action.parameters || {}};
    page=destination;selected=PAGE_SELECTION;dirty=false;
    const hash='#runtime/'+destination.id;if(location.hash===hash)route();else location.hash=hash;
  } else openPageWindow({page:createRuntimeOwner(destination,action.parameters || {}),position:action.position||'centered',point,render:renderPopupPage});
}

function showEditor(isEditing) {
  editing = isEditing;
  grid=page?.gridSize ?? 20;gridStyle=page?.gridStyle ?? 'lines';
  if(editing && page) {
    const state=editHistory.ensure(page);
    if(!dirty && editHistory.serialize(page)!==state.items[state.index])editHistory.reset(page);
  }
  let viewport;
  const wrap = node('section', null, app, {className: 'workspace'});
  const toolbar = document.querySelector('#page-menu');
  toolbar.replaceChildren();
  const viewToolbar=document.querySelector('#view-tools');viewToolbar.replaceChildren();
  const divider=(parent=toolbar)=> {
    const rule=node('span',null,parent,{className:'toolbar-divider'});
    rule.setAttribute('role','separator');rule.setAttribute('aria-orientation','vertical');
  };
  if (editing) {
    const view = button('Save & View', toolbar, async () => {
      if (!page) return;
      if (dirty) {
        const result=await api('pages', page);
        if(result.warnings?.length)notify('Page saved. '+result.warnings.join('\n'));
        dirty = false;
        await reloadLists();
      }
      location.hash = '#runtime/' + page.id;
    });
    view.disabled = !page;
    view.title = 'Save changes and view the selected page';
    const save=button('Save',toolbar,saveEditorPage);save.disabled=!page;save.title='Save Page (Ctrl+S)';
    view.prepend(toolboxIcon('play'));view.classList.add('toolbar-primary');save.prepend(toolboxIcon('save'));
    divider();
    const undo=button('Undo',toolbar,()=>restoreEdit(-1));undo.id='undo-page';undo.title='Undo (Ctrl+Z)';
    const redo=button('Redo',toolbar,()=>restoreEdit(1));redo.id='redo-page';redo.title='Redo (Ctrl+Y / Ctrl+Shift+Z)';
    undo.setAttribute('aria-label','Undo');redo.setAttribute('aria-label','Redo');undo.replaceChildren(toolboxIcon('undo'));redo.replaceChildren(toolboxIcon('redo'));
    updateHistoryButtons();
    const gridPicker = select('Grid', viewToolbar,
      [['0', 'Off'], ...[5, 10, 20].map(n => [String(n), String(n)])], String(grid));
    gridPicker.onchange = () => {page.gridSize=grid=Number(gridPicker.value);markChanged();if(polylineDraft)route();else refreshEditorGrid();};
    const gridAppearance=select('Style',viewToolbar,[['hide','Hide'],['lines','Lines'],['dots','Dots']],gridStyle);
    gridAppearance.setAttribute('aria-label','Grid style');
    gridAppearance.onchange=()=>{page.gridStyle=gridStyle=gridAppearance.value;markChanged();if(polylineDraft)route();else refreshEditorGrid();};
    divider(viewToolbar);
    const zoomPicker = select('Zoom', viewToolbar,
      zoomLevels.map(n => [String(n), Math.round(n*100) + '%']),
      String(viewStates.get(page?.id)?.zoom || 1));
    zoomPicker.id='editor-zoom';
    zoomPicker.onchange = () => viewport?.setZoom(Number(zoomPicker.value));
  } else if(!currentUser?.kiosk && currentUser?.administrator) {
    button('Edit Page', toolbar, () => {location.hash = '#editor/' + (page?.id || '');});
  }
  const layout=node('div',null,wrap, {
    className:editing?'editor':'runtime'
  });
  if(editing) {
    const left=node('aside',null,layout, {
      className:'sidebar'
    });
    left.classList.add('toolbox-sidebar');
    for(const [category,title] of [['controls','Controls'],['shapes','Shapes']]) {
      if(category==='shapes')node('hr',null,left,{className:'sidebar-divider'});
      node('h3',title,left);
      const tools=node('div',null,left,{className:'toolbox-icons'});
      for(const [type,def] of Object.entries(controls).filter(([,def])=>!def.hidden && (def.category || 'controls')===category)) {
        const add=button(null,tools,()=>{beginControlPlacement(type);});add.draggable=true;add.title=def.label;add.setAttribute('aria-label',def.label);add.append(toolboxIcon(type));
        add.ondragstart=e=>e.dataTransfer.setData('text/plain',type);
      }
    }
    node('hr', null, left, {className: 'sidebar-divider'});
    node('h3', 'Explorer', left);
    const typeOptions=[...new Set([...Object.entries(controls).filter(([,definition])=>!definition.hidden).map(([type])=>type),...page.controls.map(c=>c.type),'group'])].map(type=>[type,type==='group'?'Group':controls[type]?.label || type]).sort((a,b)=>a[1].localeCompare(b[1]));
    const typeFilter=select('',left,[['all','Everything'],...typeOptions],explorerTypes.get(page.id) || 'all',{className:'explorer-type-filter'});
    typeFilter.setAttribute('aria-label','Filter Explorer by type');
    const controlList = node('select', null, left, {size: 12, className: 'listbox control-selection'});
    scrollableEditorList(controlList,true,JSON.stringify([page.id,'explorer']));
    controlList.setAttribute('aria-label', 'Select page or control');
    function refreshExplorerOptions(){
      const top=controlList.scrollTop,left=controlList.scrollLeft;
      controlList.replaceChildren();
    if (page) node('option', page.name + ' (this page)', controlList, {value: PAGE_SELECTION});
    const optionFor=(c,indent=false)=>node('option',(indent?'\u00a0\u00a0\u00a0\u00a0↳ ':'')+explorerLabel(c),controlList,{value:c.id});
    const type=typeFilter.value,listedGroups=new Set(),matches=c=>type==='all' || c.type===type;
    function groupOption(group,members){
      listedGroups.add(group.id);const matching=members.filter(matches);
      if(type!=='all' && type!=='group' && !matching.length)return;
      const expanded=type!=='all' || !collapsedGroups.has(group.id);
      node('option',(type==='group'?'':expanded?'▾ ':'▸ ')+group.name,controlList,{value:group.id});
      if(expanded && type!=='group')for(const c of matching)optionFor(c,true);
    }
    for(const layer of layerBlocks(page)){if(layer.group)groupOption(layer.group,layer.controls);else if(matches(layer.controls[0]))optionFor(layer.controls[0]);}
    for(const group of page?.groups || [])if(!listedGroups.has(group.id))groupOption(group,[]);
    controlList.value=selected || PAGE_SELECTION;
      controlList.scrollTop=top;controlList.scrollLeft=left;
    }
    refreshExplorerOptions();
    typeFilter.onchange=()=>{explorerTypes.set(page.id,typeFilter.value);refreshExplorerOptions();controlList.scrollTop=0;controlList.scrollLeft=0;explorerHint.textContent=typeFilter.value==='all'?'Drag to change order. Double-click a group to collapse or expand.':'Drag to change order.';};
    let clickedOption;
    controlList.onpointerdown=event=>{clickedOption=event.target.closest('option')?.value;};
    controlList.onchange=()=> {
      const wasDrawing=Boolean(polylineDraft);polylineDraft=null;const chosen=[...controlList.selectedOptions].map(o=>o.value);
      selected=chosen.includes(clickedOption)?clickedOption:chosen.at(-1) || PAGE_SELECTION;
      ruleId=null;
      if(wasDrawing){route();return;}
      updateEditorSelection([...page.controls,...page.groups].find(control=>control.id===selected));
    };
    controlList.ondblclick=event=>{if(typeFilter.value!=='all')return;const id=event.target.closest('option')?.value;if(page.groups.some(g=>g.id===id)){if(collapsedGroups.has(id))collapsedGroups.delete(id);else collapsedGroups.add(id);selected=id;refreshExplorerOptions();updateEditorSelection(page.groups.find(group=>group.id===id));}};
    mountExplorerDrag(controlList,{
      select:(id,changed)=>{if(changed){clickedOption=id;controlList.onchange();}},
      describeDrop:(source,target,after)=>layerDrop(page,source,target,after),
      drop:plan=>{
        if(!moveLayerTo(page,plan.sourceId,plan.targetId,plan.after))return;
        markChanged();refreshExplorerOptions();
        const elements=new Map([...canvas.querySelectorAll('.control')].map(el=>[el.dataset.controlId,el]));
        for(const control of paintOrder(page)){const el=elements.get(control.id);if(el)canvas.append(el);}
        const bounds=canvas.querySelector('.group-bounds');if(bounds)canvas.append(bounds);
      }
    });
    const explorerHint=node('p',typeFilter.value==='all'?'Drag to change order. Double-click a group to collapse or expand.':'Drag to change order.',left,{className:'hint'});
    controlList.oncontextmenu=event=>{
      const option=event.target.closest('option') || [...controlList.options].find(option=>{
        const rect=option.getBoundingClientRect();
        return event.clientX>=rect.left && event.clientX<=rect.right && event.clientY>=rect.top && event.clientY<=rect.bottom;
      });
      const id=option?.value || controlList.value;
      openControlMenu(event,[...page.controls,...page.groups].find(control=>control.id===id),true);
    };
    const remove=button('Delete Control',left,deleteSelectedControl);
    remove.title='Delete selected control (Delete)';
    remove.id='delete-control';
    remove.disabled=![...page?.controls || [],...page?.groups || []].some(c=>c.id===selected);
    if(page?.groups.some(g=>g.id===selected))remove.textContent='Delete Group';
  }
  const surface=node('div',null,layout, {
    className:'surface'
  }),canvas=node('div',null,surface, {
    className:'canvas'+(editing&&grid&&gridStyle!=='hide'?(gridStyle==='dots'?' grid-dots':' grid'):'')
  });
  const renderOwner=editing?page:(page?createRuntimeOwner(page,mainConnections.page===page.id?mainConnections.values:{}):null);
  if(renderOwner){stylePage(canvas,renderOwner);if(!editing)runtimeOwners.set(canvas,renderOwner);}
  if (editing && page) viewport = editorView(surface, canvas, page,zoom=>{const picker=document.querySelector('#editor-zoom');if(picker)picker.value=String(zoom);});
  if (!editing && page) alignPageSurface(surface, page);
  canvas.style.setProperty('--grid-size', grid + 'px');
  canvas.ondragover=e=>e.preventDefault();
  canvas.ondrop=e=> {
    e.preventDefault();
    if(!editing)return;
    const rect=canvas.getBoundingClientRect(),type=e.dataTransfer.getData('text/plain');
    const point=pagePoint(e.clientX,e.clientY,rect,viewport?.state.zoom || 1);
    if(controls[type] && !controls[type].hidden)beginControlPlacement(type,[Math.max(0,Math.min(page.width,snap(point.x))),Math.max(0,Math.min(page.height,snap(point.y)))]);
  };
  for(const c of renderOwner?paintOrder(renderOwner):[])renderControl(canvas,c,renderOwner,editing);
  if(editing && page)renderGroupBounds(canvas,page,selected,event=>openControlMenu(event,page.groups.find(g=>g.id===selected),true));
  canvas.refreshSelection=updateEditorSelection;
  canvas.selectGroup=(event,group)=>{openControlMenu(event,group,true,true);return canvas.querySelector('.group-bounds');};
  if(editing && page)surface.oncontextmenu=event=> {
    // Use the browser's hit target: pinned controls have pointer-events:none,
    // so both left and right clicks naturally reach the control underneath.
    const id=event.target.closest('.control')?.dataset.controlId;
    let control=page.controls.find(c=>c.id===id && !c.pinned);
    if(control?.groupId && selected!==control.id)control=page.groups.find(g=>g.id===control.groupId) || control;
    openControlMenu(event,control);
  };
  function updateEditorSelection(control){
    selected=control?.id || PAGE_SELECTION;ruleId=null;
    showInspector(app.querySelector('.inspector'));
    for(const el of canvas.querySelectorAll('.control')){
      const wasSelected=el.classList.contains('selected'),isSelected=selected===el.dataset.controlId;
      el.classList.toggle('selected',isSelected);
      if(wasSelected || isSelected)paint(el,page.controls.find(c=>c.id===el.dataset.controlId));
    }
    canvas.querySelector('.group-bounds')?.remove();
    if(control?.type==='group')renderGroupBounds(canvas,page,control.id,event=>openControlMenu(event,control,true));
    canvas.classList.toggle('page-selected',!control);
    canvas.querySelectorAll('.page-handle').forEach(el=>el.remove());
    if(!control)renderPageHandles();
    const list=app.querySelector('.control-selection'),scrollTop=list.scrollTop,scrollLeft=list.scrollLeft;
    if(list.value!==selected)list.value=selected;
    list.scrollTop=scrollTop;list.scrollLeft=scrollLeft;
    app.querySelector('#delete-control').disabled=!control;
    app.querySelector('#delete-control').textContent=control?.type==='group'?'Delete Group':'Delete Control';
  }
  function openControlMenu(event,control,fromExplorer=false,selectOnly=false) {
    event.preventDefault();event.stopPropagation();
    const id=control?.id;
    if(control && (fromExplorer || !control.pinned))updateEditorSelection(control);
    if(selectOnly)return;
    const bounds=control?.type==='group'?groupBounds(page,control.id):control;
    const point=fromExplorer?{x:bounds?bounds.left+20:40,y:bounds?bounds.top+20:40}:pagePoint(event.clientX,event.clientY,canvas.getBoundingClientRect(),viewport.state.zoom);
    const commit=()=>{markChanged();route();};
    const paste=(source,position)=> {
      if(source.kind==='group'){const copy=pasteGroup(page,source,position,grid);selected=copy.id;}
      else{const copy=cloneControl(source,page,position,grid);page.controls.push(copy);selected=copy.id;}
      ruleId=null;commit();
    };
    contextMenu({x:event.clientX,y:event.clientY},[
      ...(control?.type==='group'?['Events']:['Actions','Events']).map(name=>({label:name,run:()=>{
        if(!control){selected=PAGE_SELECTION;ruleId=null;}
        tab=name;updateEditorSelection(control);
      }})),
      {separator:true},
      ...(control?.type==='group'?[
        {label:'Ungroup',run:()=>{ungroup(page,id);selected=PAGE_SELECTION;commit();}},
        {label:'Delete Group',run:()=>deleteSelectedControl()}
      ]:control?[
        control.groupId?{label:'Remove from Group',run:()=>{removeFromGroups(page,[id]);commit();}}:
        {label:'Add to Group',run:()=>dialog('Add to Group',(body,submit)=>{
          submit.textContent='Add';
          const picker=node('select',null,body,{className:'listbox',size:Math.max(2,Math.min(8,page.groups.length))});
          picker.setAttribute('aria-label','Group');
          for(const group of page.groups)node('option',group.name,picker,{value:group.id});
          node('p','— or —',body,{className:'group-choice-divider'});
          const name=field('',body);name.placeholder='Name a new group…';name.setAttribute('aria-label','New group name');
          const update=()=>{submit.textContent=name.value.trim()?'Create & Add':'Add';submit.disabled=!name.value.trim() && !picker.value;};
          name.oninput=()=>{if(name.value.trim())picker.selectedIndex=-1;update();};
          picker.onchange=()=>{name.value='';update();};
          picker.ondblclick=event=>{if(event.target.closest('option') && picker.value){name.value='';update();submit.form.requestSubmit(submit);}};
          update();
          return ()=>{
            if(name.value.trim()){
              const group=createGroup(page,[id],randomId,{name:name.value.trim(),minMembers:1});
              if(!group)throw new Error('The control is no longer available.');
            }else{
              if(!picker.value)throw new Error('Select a group or enter a new group name.');
              addToGroup(page,[id],picker.value);
            }
            commit();
          };
        })}
      ]:[]),
      ...(control?[
        {separator:true},
        {label:'Order',buttons:[
          {label:'Send to Back',icon:'⇊',run:()=>{orderControl(page,id,false);commit();}},
          {label:'Move Backward',icon:'↓',run:()=>{stepControl(page,id,false);commit();}},
          {label:'Move Forward',icon:'↑',run:()=>{stepControl(page,id,true);commit();}},
          {label:'Bring to Front',icon:'⇈',run:()=>{orderControl(page,id,true);commit();}}]},
        {separator:true},
      ]:[]),
      ...(control?.type==='group'?[
        {label:'Cut',run:()=>{copiedControl=copyGroup(page,id);page.controls=page.controls.filter(c=>c.groupId!==id);ungroup(page,id);selected=PAGE_SELECTION;commit();}},
        {label:'Copy',run:()=>{copiedControl=copyGroup(page,id);}},
        {label:'Duplicate',run:()=>paste(copyGroup(page,id),{x:(bounds?.left || 0)+20,y:(bounds?.top || 0)+20})}
      ]:control?[
        {label:control.pinned?'Unpin':'Pin',run:()=>{togglePinned(control);commit();}},
        {label:'Cut',run:()=>{copiedControl=structuredClone(control);page.controls=page.controls.filter(c=>c.id!==id);selected=PAGE_SELECTION;commit();}},
        {label:'Copy',run:()=>{copiedControl=structuredClone(control);}},
        {label:'Duplicate',run:()=>paste(control,{x:control.left+20,y:control.top+20})}
      ]:[]),
      {label:'Paste',disabled:!copiedControl,run:()=>paste(copiedControl,point)}
    ]);
  }
  if (editing && page) {
    const selectPage = () => {tab='Properties';updateEditorSelection();};
    surface.addEventListener('click', event => {
      if (event.target.closest('.control, .page-handle, .group-bounds')) return;
      selectPage();
    });
    if (!selected || selected===PAGE_SELECTION)renderPageHandles();
  }
  function renderPageHandles(){
      canvas.classList.add('page-selected');
      // The design origin stays fixed; these handles change width and height.
      for (const direction of ['e','s','se']) {
        const handle=node('span',null,canvas,{className:'handle page-handle '+direction});
        handle.title=direction==='e'?'Resize page width':direction==='s'?'Resize page height':'Resize page';
        handle.onpointerdown=event=> {
          if(event.button!==0)return;
          event.preventDefault();event.stopPropagation();
          handle.setPointerCapture(event.pointerId);
          const x=event.clientX,y=event.clientY,width=page.width,height=page.height;
          handle.onpointermove=move=> {
            const zoom=viewport.state.zoom;
            if(direction.includes('e'))page.width=Math.max(20,Math.min(10000,snap(width+(move.clientX-x)/zoom)));
            if(direction.includes('s'))page.height=Math.max(20,Math.min(10000,snap(height+(move.clientY-y)/zoom)));
            dirty=true;stylePage(canvas,page);viewport.updateSize();
          };
          handle.onpointerup=handle.onpointercancel=()=> {handle.onpointermove=null;markChanged();refreshEditedPage();const panel=app.querySelector('.inspector'),scroll=panel.scrollTop;showInspector(panel);panel.scrollTop=scroll;};
        };
        handle.onclick=event=>event.stopPropagation();
      }
  }
  if(editing)showInspector(node('aside',null,layout, {
    className:'sidebar inspector'
  }));
  if(editing)closeEditorPanels=mountEditorPanels(layout);
  if(editing && polylineDraft?.page===page?.id && (!polylineDraft.type || polylineDraft.type==='polyline'))mountPolylineDrawing({canvas,panel:layout.querySelector('.inspector'),page,zoom:()=>viewport.state.zoom,grid,draft:polylineDraft,node,button,
    onComplete:geometry=>{
      const draft=polylineDraft;polylineDraft=null;
      if(draft.control){const control=page.controls.find(c=>c.id===draft.control);if(control){if(draft.reverse)geometry.points.reverse();Object.assign(control,geometry);polylineSelection.set(control.id,draft.reverse?0:control.points.length-1);selected=control.id;markChanged();route();}}
      else addControl('polyline',geometry.left,geometry.top,geometry);
    },onCancel:()=>{polylineDraft=null;route();}});
  if(editing && polylineDraft?.page===page?.id && polylineDraft.type && polylineDraft.type!=='polyline')mountControlPlacement({canvas,panel:layout.querySelector('.inspector'),page,zoom:()=>viewport.state.zoom,grid,draft:polylineDraft,label:controls[polylineDraft.type].label,node,button,
    onComplete:bounds=>{const type=polylineDraft.type;addControl(type,bounds.left,bounds.top,bounds);},onCancel:()=>{polylineDraft=null;route();}});
  if(polylineDraft?.control)for(const el of canvas.querySelectorAll('.control'))if(el.dataset.controlId===polylineDraft.control)el.style.visibility='hidden';
}
function beginControlPlacement(type,first=null){
  if(!page)return;
  polylineDraft={page:page.id,type,...(type==='polyline'?{points:first?[first]:[]}:{first})};
  selected=PAGE_SELECTION;tab='Properties';ruleId=null;route();
}
const snap = n => grid ? Math.round(n / grid) * grid : n;
function addControl(type,x=40,y=40,properties={}) {
  if(!page)return;
  polylineDraft=null;
  const c= {
    id:type+'_'+randomId().slice(0,8),type,left:snap(x),top:snap(y),fontSize:16,backColor:'#ffffff',foreColor:'#243247',...controls[type].defaults,...properties,actions:[],events:[]
  };
  c.name=typeof c.name==='string' && c.name.trim()?c.name:c.id;
  if(!properties.points && properties.width===undefined && properties.height===undefined){c.width=Math.max(20,snap(c.width));c.height=Math.max(20,snap(c.height));}
  page.controls.push(c);
  
  selected=c.id;
  markChanged();
  route();
}
function renderGroupBounds(canvas,owner,id,onContext){
  const group=owner.groups?.find(g=>g.id===id);if(!group)return;
  if(pointEditingFocus)finishPointEditingFocus();
  const bounds=groupBounds(owner,id);if(!bounds)return;
  const box=node('div',null,canvas,{className:'group-bounds'});
  Object.assign(box.style,{left:bounds.left+'px',top:bounds.top+'px',width:bounds.width+'px',height:bounds.height+'px'});
  box.setAttribute('aria-label','Move group '+group.name);box.dataset.groupName=group.name;box.oncontextmenu=onContext;
  {
    const border=box;border.title='Drag anywhere inside to move '+group.name;
    border.onpointerdown=event=>{
      if(event.button!==0)return;event.preventDefault();event.stopPropagation();border.setPointerCapture(event.pointerId);
      const x=event.clientX,y=event.clientY,start=groupBounds(owner,id),members=groupMembers(owner,id).map(c=>({control:c,left:c.left,top:c.top}));
      border.onpointermove=move=>{
        const zoom=viewStates.get(owner.id)?.zoom || 1,delta=groupDelta(start,(move.clientX-x)/zoom,(move.clientY-y)/zoom,owner,grid);
        for(const member of members){member.control.left=member.left+delta.x;member.control.top=member.top+delta.y;const el=[...canvas.querySelectorAll('.control')].find(el=>el.dataset.controlId===member.control.id);if(el)geometry(el,member.control);}
        box.style.left=start.left+delta.x+'px';box.style.top=start.top+delta.y+'px';dirty=true;
      };
      border.onpointerup=border.onpointercancel=()=>{border.onpointermove=null;markChanged();canvas.refreshSelection(group);};
    };
    border.onclick=event=>event.stopPropagation();
  }
}
function renderControl(canvas,c,owner=page,isEditing=editing) {
  const el=node('div',null,canvas, {
    className:'control'+(isEditing&&(selected===c.id)?' selected':'')
  });
  el.dataset.controlId=c.id;
  el.dataset.pageId=owner.id;
  el.dataset.controlType=c.type;
  paint(el,c,owner,isEditing);
  if(!isEditing)return;
  el.onpointerdown=e=> {
    if(e.button!==0 || c.pinned)return;
    // An Explorer-selected member remains individually editable until selection changes.
    const group=owner.groups?.find(group=>group.id===c.groupId);
    if(group && selected!==c.id){
      const box=canvas.selectGroup(e,group);
      box?.onpointerdown(e);
      return;
    }
    
    canvas.querySelector('.group-bounds')?.remove();
    e.preventDefault();
    e.stopPropagation();
    selected=c.id;
    const handle=e.target.dataset.handle,x=e.clientX,y=e.clientY,start= {
      left:c.left,top:c.top,width:c.width,height:c.height
    };
    canvas.querySelectorAll('.selected').forEach(n=>{n.classList.remove('selected');if(n!==el)paint(n,owner.controls.find(control=>control.id===n.dataset.controlId),owner,true);});
    el.classList.add('selected');
    el.setPointerCapture(e.pointerId);
    el.onpointermove=move=> {
      const zoom=viewStates.get(owner.id)?.zoom || 1;
      const dx=(move.clientX-x)/zoom,dy=(move.clientY-y)/zoom;
      if(!handle && c.type==='polyline')Object.assign(c,movePolyline(start,dx,dy,owner,grid));
      else if(!handle) {
        c.left=Math.max(0,Math.min(owner.width-c.width,snap(start.left+dx)));
        c.top=Math.max(0,Math.min(owner.height-c.height,snap(start.top+dy)));
      }
      else  {
        let l=start.left,t=start.top,r=l+start.width,b=t+start.height;
        if(handle.includes('w'))l=Math.max(0,Math.min(r-20,snap(start.left+dx)));
        if(handle.includes('e'))r=Math.min(owner.width,Math.max(l+20,snap(start.left+start.width+dx)));
        if(handle.includes('n'))t=Math.max(0,Math.min(b-20,snap(start.top+dy)));
        if(handle.includes('s'))b=Math.min(owner.height,Math.max(t+20,snap(start.top+start.height+dy)));
        Object.assign(c, {
          left:l,top:t,width:r-l,height:b-t
        });
      }
      dirty=true;
      geometry(el,c);
      if(controls[c.type]?.category==='shapes' || c.type==='level'){
        controls[c.type].update(el.querySelector('.control-content'),c,{editing:true,values,bindingValue:values[c.binding?.tag]});
      }
    };
    el.onpointerup=el.onpointercancel=()=> {
      el.onpointermove=null;
      markChanged();canvas.refreshSelection(c);
    };
  };
}
function geometry(el,c) {
  const horizontal=c.textHorizontalAlignment || 'center',vertical=c.textVerticalAlignment || 'center';
  el.style.setProperty('--text-horizontal',({left:'flex-start',right:'flex-end',justify:'flex-start'})[horizontal] || 'center');
  el.style.setProperty('--text-vertical',({top:'flex-start',bottom:'flex-end'})[vertical] || 'center');
  el.style.setProperty('--text-align',horizontal);
  el.style.setProperty('--control-back-color', c.backColor || '#ffffff');
  Object.assign(el.style, {
    left:c.left+'px',top:c.top+'px',width:c.width+'px',height:c.height+'px',fontSize:c.fontSize+'px',background:c.backColor,color:c.foreColor,
    fontFamily:(fonts.find(font => font.id === c.fontFamily) || fonts[0]).stack,
    fontWeight:c.bold ? '700' : '400', fontStyle:c.italic ? 'italic' : 'normal',
    borderRadius:c.type==='label' && c.roundedCorners?'8px':''
  });
  if(controls[c.type]?.category==='shapes' || ['level','symbol'].includes(c.type))el.style.background='transparent';
  if(c.type==='textviewer')Object.assign(el.style,textViewerAppearance(c));
}
async function pickInlineTag(initial={}) {
  const tag=pickerTags().find(tag=>tag.id===initial.tag || tagPath(tag).toLowerCase()===String(initial.path || '').toLowerCase());
  return openInlineTagDialog(pickerProviders(),{initial:{...initial,tag:tag?.id || ''},
    getSample:async id=>isParameter(id)?null:(await api('values/batch',{tags:[id],pages:[]})).values[id]});
}
function paint(el, c, owner=page, isEditing=editing) {
  const appearance = isEditing ? {} : (controlStates[owner?.instanceId || owner?.id]?.[c.id] || {});
  const effective = {...c, ...appearance};
  if(!isEditing) {
    effective.text=renderInlineText(c.text,c.textRefs,tags,values);
    if(appearance.contentOverride!==undefined)effective.contentOverride=renderInlineText(appearance.contentOverride,appearance.contentRefs,tags,values);
  }
  geometry(el, effective);
  el.classList.toggle('control-blink',!isEditing && blinkControlTypes.has(c.type) && Boolean(appearance.controlBlink));
  el.classList.toggle('content-blink',!isEditing && !appearance.controlBlink && ['label','button'].includes(c.type) && Boolean(effective.blink));
  el.style.pointerEvents=isEditing && c.pinned?'none':'';
  // The inner button paints its own background; avoid applying alpha twice.
  if (!isEditing && c.type==='button') el.style.background='transparent';
  el.style.display = !isEditing && (effective.visible === false || !memberVisible(c,owner,controlStates[owner?.instanceId || owner?.id])) ? 'none' : 'flex';
  el.style.opacity = isEditing && c.visible === false ? '.5' : '1';
  // Keep pressed elements alive during live updates; mouse-up/click must not be lost.
  let content = el.querySelector('.control-content');
  if (!content) content = node('div', null, el, {className: 'control-content'});
  const context = {
    editing:isEditing, values, appearance,
    canInteract:hasAccessRoles(currentUser,c.requiredRoles || []),
    bindingValue: values[c.binding?.tag],
    tagLabel:id=>{const tag=tags.find(t=>t.id===id);return tag?tagPath(tag):id;},
    changeIndex: index => {
      if(!c.binding?.tag || !context.canInteract)return;
      context.execute(c,'user_changed',null,()=>api('actions/listbox',{page:owner.id,control:c.id,value:index,bindings:owner.accessBindings || {}}));
    },
    execute: (control, trigger = 'click', point, before) => {
      const actions = (c.actions || []).filter(action => (action.trigger || 'click') === trigger);
      // Preserve browser gesture order even if a device write takes time.
      actionQueue = actionQueue.catch(() => {}).then(async () => {
        if(before)await before();
        for (const action of actions) {
          // Draft rules are saved freely and skipped until complete.
          try {await api('rules/validate',{kind:'actions',item:action});}
          catch {continue;}
          await executeAction(action, point, c);
        }
      });
      actionQueue.catch(error => {notify(error.message);});
      return actionQueue;
    }
  };
  // Keep stored trigger names while supporting mouse, touch, and pen equally.
  bindControlActions(el,{enabled:!isEditing && !['listbox','dropdown'].includes(c.type),execute:(trigger,point)=>context.execute(c,trigger,point)});
  const definition = controls[c.type];
  if (definition?.update && content.dataset.rendered) definition.update(content, effective, context);
  else {
    content.replaceChildren();
    definition?.render(content, effective, context);
    content.dataset.rendered = 'true';
  }
  el.querySelectorAll('.handle').forEach(handle => handle.remove());
  if (isEditing && selected === c.id && !c.pinned) {
    if(editingPolyline(c)){
      renderLineHandles(el,c,owner);
      return;
    }
    for (const direction of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      const handle = node('span', null, el, {className: 'handle ' + direction});
      handle.dataset.handle = direction;
    }
  }
}


function renderLineHandles(el,c,owner) {
  const points=linePoints(c);
  points.forEach(([px,py],index)=>{
    const handle=node('span',null,el,{className:'handle line-point'});
    handle.dataset.pointIndex=String(index);
    handle.title=`Point ${index+1} — drag to reshape`;
    handle.setAttribute('aria-label',`Polyline point ${index+1}`);
    if(polylineSelection.get(c.id)===index)handle.classList.add('active-point');
    const position=()=>{
      const stroke=Math.min(c.width,c.height,Math.max(0,Number(c.strokeWidth)||0));
      handle.style.left=(stroke/2+c.points[index][0]*(c.width-stroke))+'px';
      handle.style.top=(stroke/2+c.points[index][1]*(c.height-stroke))+'px';
    };
    // Copy defaults instead of mutating a shared control definition.
    if(!c.points)c.points=points.map(point=>[...point]);
    position();
    handle.onpointerdown=event=>{
      if(event.button!==0)return;
      event.preventDefault();event.stopPropagation();polylineSelection.set(c.id,index);
      el.querySelectorAll('.line-point').forEach(point=>point.classList.remove('active-point'));
      handle.classList.add('active-point');handle.setPointerCapture(event.pointerId);
      const original=polylinePagePoints(c),start=original[index],x=event.clientX,y=event.clientY;
      handle.onpointermove=move=>{
        const zoom=viewStates.get(owner.id)?.zoom || 1;
        const next=original.map(point=>[...point]);
        next[index]=[Math.max(0,Math.min(owner.width,snap(start[0]+(move.clientX-x)/zoom))),Math.max(0,Math.min(owner.height,snap(start[1]+(move.clientY-y)/zoom)))];
        const last=original.length-1;
        if(original.length>2 && original[0][0]===original[last][0] && original[0][1]===original[last][1]){
          if(index===0)next[last]=[...next[0]];else if(index===last)next[0]=[...next[last]];
        }
        reshapePolyline(c,next);geometry(el,c);
        controls.polyline.update(el.querySelector('.control-content'),c);
        const stroke=Math.min(c.width,c.height,Math.max(0,Number(c.strokeWidth)||0));
        for(const point of el.querySelectorAll('.line-point')){
          const [px,py]=c.points[Number(point.dataset.pointIndex)];
          point.style.left=(stroke/2+px*(c.width-stroke))+'px';point.style.top=(stroke/2+py*(c.height-stroke))+'px';
        }
        dirty=true;
      };
      handle.onpointerup=handle.onpointercancel=()=>{handle.onpointermove=null;markChanged();refreshEditedControl(c,true);};
    };
  });
}

// All editor tag fields use this shared component; other pages can import it too.
function sheetInterest(source, active) {
  const count=(sheetInterests.get(source) || 0)+(active?1:-1);
  if(count>0)sheetInterests.set(source,count);else sheetInterests.delete(source);
  safe(sendInterest);
}
function getSheetData(source){return api('sheets/get',{source});}
async function ensureSheetTag(source,address) {
  let tag=tags.find(tag=>tag.source===source.id && tag.address===address);
  if(!tag){await api('tags',{source:source.id,name:address,address});await reloadLists();tag=tags.find(tag=>tag.source===source.id && tag.address===address);}
  return tag.id;
}
function pickerTags(){return [...tags,...(location.hash.startsWith('#editor')?parameterTags(page):[])];}
function pickerSources(){return location.hash.startsWith('#editor') && page?.parameters?.length?[{id:PARAMETER_SOURCE,name:'Parameters',kind:'parameters'},...sources]:sources;}
function pickerProviders() {
  return {getSources:pickerSources,getTags:pickerTags,
    getValues:async()=>pickerInterest && document.visibilityState!=='hidden'?(await api('values/batch',{tags:[pickerInterest],pages:[]})).values:{},
    onInterest:tag=>{pickerInterest=isParameter(tag)?'':tag;safe(sendInterest);},
    getSheet:getSheetData,onSheetInterest:sheetInterest,ensureSheetTag};
}
async function editSheet(source) {
  await openSheetDialog({source,getSheet:getSheetData,saveSheet:(source,cells)=>api('sheets/save',{source,cells,validate:true}),onInterest:sheetInterest,
    onTag:async()=>{const id=await openTagSelector(pickerProviders());const tag=tags.find(tag=>tag.id===id);return tag?tagPath(tag):null;}});
  await reloadLists();route();
}
function tagSelect(label, parent, value, onChange) {
  return tagPicker(parent,{label,value,onChange,...pickerProviders()});
}

function finishPointEditingFocus(){
  const control=pointEditingFocus;pointEditingFocus=null;
  if(!control || !editingPolyline(control))return;
  const before=JSON.stringify(control);
  controls.polyline.props.pointEditing.onClick(control);
  if(page?.controls.includes(control) && JSON.stringify(control)!==before)markChanged();
  for(const el of app.querySelectorAll('.editor .control'))if(el.dataset.controlId===control.id)paint(el,control);
}
function showInspector(panel) {
  const focused=[...page?.controls || [],...page?.groups || []].find(control=>control.id===selected);
  if(pointEditingFocus && pointEditingFocus!==focused)finishPointEditingFocus();
  pointEditingFocus=focused && editingPolyline(focused)?focused:null;
  if(focused?.type==='group' && tab==='Actions')tab='Properties';
  saveEditorListScroll(panel);
  panel.replaceChildren();
  const isPage=page && (!selected || selected===PAGE_SELECTION);
  const c=isPage?page:focused;
  const isGroup=c?.type==='group';
  if(c){
    const nameSection=node('div',null,panel,{className:'inspector-name'});
    const name=field(isPage?'Page Name':isGroup?'Group Name':'Control Name',nameSection,'text',c.name || c.id);
    name.setAttribute('aria-label',isPage?'Page Name':isGroup?'Group Name':'Control Name');
    node('small','Type: '+(isPage?'Page':isGroup?'Group':controls[c.type]?.label || c.type),name.parentElement,{className:'inspector-type'});
    name.required=true;
    if(isPage)name.oninput=()=>{
      page.name=name.value;markChanged('page-name');
      const option=app.querySelector('.control-selection option');
      if(option)option.textContent=page.name+' (this page)';
    };
    else name.onchange=()=>{c.name=name.value.trim() || c.id;name.value=c.name;markChanged();refreshEditedControl(c);};
    node('hr',null,panel,{className:'sidebar-divider'});
  }
  const tabs = node('div', null, panel, {className: 'tabs'});
  for (const name of (focused?.type==='group'?['Properties','Events']:['Properties','Actions','Events'])) {
    const b = button(name, tabs, () => {tab = name; ruleId = null; showInspector(panel);});
    b.classList.toggle('active', name === tab);
  }
  node('hr',null,panel,{className:'sidebar-divider'});
  if(isPage && tab==='Properties')return showPageProperties(panel);
  if(isGroup && tab==='Actions')tab='Properties';
  if (!c) return void node('p', 'Select a control.', panel);
  if (tab === 'Properties') {
    let colorRow,layoutFields,iconSettings,iconGroup;
    const props=isGroup?{visible:{label:'Visible',type:'checkbox'}}:controls[c.type]?.props || {};
    const entries=Object.entries(props).filter(([key])=>!['visible','roundedCorners','showBorder','showBackground'].includes(key));
    if(c.type==='button'){
      const order=['buttonDisplay','icon','iconSize','iconColor','iconPosition','text'];
      entries.sort(([a],[b])=>(order.includes(a)?order.indexOf(a):order.length)-(order.includes(b)?order.indexOf(b):order.length));
    }
    if(props.visible)entries.splice(Math.max(0,entries.findIndex(([key])=>key==='left')),0,['visible',props.visible],...(props.roundedCorners?[['roundedCorners',props.roundedCorners]]:[]),...['showBorder','showBackground'].filter(key=>props[key]).map(key=>[key,props[key]]));
    for (const [propertyIndex, [key, prop]] of entries.entries()) {
      if(prop.visibleWhen && !prop.visibleWhen(c))continue;
      if(c.type==='button'&&key==='text'&&c.buttonDisplay==='icon')continue;
      if (key === 'tag') continue;
      if(props.text && textFields.includes(key) && key!=='text' && !((controls[c.type]?.category==='shapes'||c.type==='button'&&c.buttonDisplay==='icon') && ['backColor','foreColor'].includes(key)))continue;
      const sections = {textAsset:'Content',trendSeries:'Content',valueTag:'Content',elements:'Elements',strokeWidth:'Shape',...(c.type==='button'?{buttonDisplay:'Content'}:{text:'Content'}), [props.visible?'visible':'left']: 'Layout', fontFamily: 'Font', [props.backColor?'backColor':'foreColor']: 'Colors'};
      if (sections[key]) {
        if (key !== 'text' && propertyIndex>0) node('hr', null, panel, {className: 'sidebar-divider'});
        node('h3', sections[key], panel);
      }
      if(key==='text'){
        const host=c.type==='button'?node('div',null,panel,{className:'button-text-settings'}):panel;
        if(c.type==='button')node('span','Text',host,{className:'content-field-label'});
        const edit=button('Edit',host,async()=>{const changed=await openTextEditor(c, {onInsertTag:pickInlineTag,previewBackground:page.showBackground===false || (page.backColor?.length===9 && page.backColor.endsWith('00'))?getComputedStyle(document.body).backgroundColor:page.backColor});if(changed){Object.assign(c,changed);markChanged();refreshEditedControl(c,true);}});
        edit.setAttribute('aria-label','Edit text');continue;
      }
      if (key === 'backColor') colorRow = node('div', null, panel, {className: 'color-picker-row'});
      const propertyParent = ['left','top','width','height'].includes(key)
        ? (layoutFields ||= node('div',null,panel,{className:'designer-field-grid'}))
        : ['iconSize','iconColor','iconPosition'].includes(key)&&iconSettings?iconSettings
        : (key === 'backColor' || key === 'foreColor') && colorRow ? colorRow : panel;
      if(prop.type==='accessRoles'){
        const roles=c[key] || [];
        const choose=button(prop.label+': '+(roles.length?roles.map(id=>accessRoles.find(role=>role.id===id)?.name || 'Missing role').join(', '):'Any signed-in user'),propertyParent,async()=>{
          accessRoles=await api('access/roles');const next=await pickAccessRoles(accessRoles,c[key] || []);
          if(next!==null){c[key]=next;markChanged();refreshEditedControl(c,true);}
        });
        choose.title='All selected roles are required to change the index. Administrators bypass this restriction.';
        continue;
      }
      if(prop.type==='trendSeries'){
        const seriesBox=node('div',null,propertyParent,{className:'trend-series-editor'});
        const store=series=>{c.series=series;delete c.binding;markChanged();refreshEditedControl(c);};
        function drawSeries(){
          seriesBox.replaceChildren();const series=trendSeries(c);
          series.forEach((item,index)=>{
            const row=node('div',null,seriesBox,{className:'trend-series-row'});
            const fields=node('div',null,row,{className:'trend-series-fields'});
            const tagBox=tagSelect('Tag '+(index+1),fields,item.tag,value=>{tagBox.title=tagBox.textContent;store(trendSeries(c).map(s=>s.id===item.id?{...s,tag:value}:s));});
            tagBox.title=tagBox.textContent;
            const color=field('Line Color',fields,'color',item.color);
            color.onchange=()=>store(trendSeries(c).map(s=>s.id===item.id?{...s,color:color.value}:s));
            const limits=node('div',null,row,{className:'designer-field-grid trend-series-limits'});
            for(const [key,label] of [['minimum','Min'],['maximum','Max']]){
              const input=field(label,limits,'number',item[key]);input.step='any';
              input.onchange=()=>{const value=input.value===''?NaN:Number(input.value),current=trendSeries(c).find(s=>s.id===item.id);const next={...current,[key]:value};
                if(!Number.isFinite(value) || next.maximum<=next.minimum){input.value=current[key];input.setCustomValidity('Max must be greater than Min.');input.reportValidity();return;}
                input.setCustomValidity('');store(trendSeries(c).map(s=>s.id===item.id?next:s));
              };
            }
            button('Remove',row,()=>{store(trendSeries(c).filter(s=>s.id!==item.id));drawSeries();});
          });
          const add=button('+ Add Tag',seriesBox,()=>{const series=trendSeries(c);store([...series,{id:randomId(),tag:'',color:trendColors[series.length%trendColors.length],minimum:0,maximum:100}]);drawSeries();});add.disabled=series.length>=16;
        }
        drawSeries();continue;
      }
      if(prop.type==='elements') {
        const label=node('label',prop.label,propertyParent);
        const input=node('textarea',null,label,{rows:8,value:(c.elements || []).join('\n')});
        input.onchange=()=>{c.elements=input.value===''?[]:input.value.split(/\r?\n/);markChanged();refreshEditedControl(c);};
        node('p','First element = 0, second = 1, and so on.',propertyParent,{className:'hint'});
        continue;
      }
      if(prop.type==='binding') {
        tagSelect(prop.label,propertyParent,c.binding?.tag || '',value=>{c.binding={tag:value};markChanged();refreshEditedControl(c);});
        continue;
      }
      if(prop.type==='button') {
        button(typeof prop.label==='function'?prop.label(c):prop.label,propertyParent,()=>{
          if(prop.command==='continuePolyline'){
            const points=polylinePagePoints(c),reverse=selectedLinePoint(c)===0;
            if(reverse)points.reverse();
            polylineDraft={page:page.id,control:c.id,points,reverse,minimumPoints:points.length,strokeWidth:c.strokeWidth,foreColor:c.foreColor};route();
          }else{prop.onClick(c);markChanged();refreshEditedControl(c,true);}
        });
        continue;
      }
      if(prop.type==='textAsset'){
        const edit=button('Edit',propertyParent,()=>safe(async()=>{
          const result=await openTextViewerEditor(c,{api});
          if(result){Object.assign(c,result);markChanged();refreshEditedControl(c,true);}
        }));edit.setAttribute('aria-label','Edit text viewer content');continue;
      }
      if(prop.type==='image' || prop.type==='symbol') {
        const symbol=prop.type==='symbol';
        node('h3',symbol?'Content':'Image',propertyParent);
        contentField(propertyParent,{kind:symbol?'symbol':'image',value:c.image||'',name:c.imageName||'',onPick:()=>safe(async()=>{
          const asset=await openContentPicker({api,kind:symbol?'symbol':'image',value:c.image || ''});
          if(asset){c.image=asset.url;c.imageName=asset.name;markChanged();refreshEditedControl(c,true);}
        }),onClear:()=>{c.image='';c.imageName='';markChanged();refreshEditedControl(c,true);}});
        button('Rotate 90°',propertyParent,()=>{rotateArtwork(c);markChanged();refreshEditedControl(c,true);});
        continue;
      }
      if(prop.type==='icon'){
        const kind=c.buttonArtworkKind||'icon';
        const group=contentField(propertyParent,{label:'Icon',kind,value:kind==='icon'?c.icon||'':c.image||'',name:kind==='icon'?buttonIcons.find(icon=>icon.id===c.icon)?.name||'':c.imageName||'',...(kind==='icon'?{renderPreview:host=>{host.style.color=c.iconColor?.slice(0,7)||'var(--ui-text)';const svg=buttonIcon(c.icon);if(svg)host.append(svg);}}:{}),onPick:()=>safe(async()=>{
          const asset=await openContentPicker({api,kind,kinds:['icon','image','symbol'],value:kind==='icon'?c.icon||'':c.image||''});
          if(asset){c.buttonArtworkKind=asset.kind;c.icon=asset.kind==='icon'?asset.id:'';c.image=asset.kind==='icon'?'':asset.url;c.imageName=asset.kind==='icon'?'':asset.name;markChanged();refreshEditedControl(c,true);}
        }),onClear:()=>{c.icon='';c.image='';c.imageName='';markChanged();refreshEditedControl(c,true);}});
        group.classList.add('button-icon-group');iconGroup=group;iconSettings=node('div',null,group,{className:'button-icon-settings'});
        continue;
      }
      if(prop.type==='alignment') {
        alignmentPicker(prop.label,propertyParent,prop.axis,c[key] || prop.default,value=>{
          c[key]=value;markChanged();
          for(const el of app.querySelectorAll('.editor .control')) {
            if(el.dataset.controlId===c.id)geometry(el,c);
          }
        });
        continue;
      }
      if(prop.type==='color') {
        colorPicker(prop.label,propertyParent,c[key] || (key==='iconColor'?c.foreColor||'#243247':'#ffffff'),value=>{c[key]=value;if(key==='iconColor'&&iconGroup){const preview=iconGroup.querySelector('.content-field-preview');if(preview)preview.style.color=value;}markChanged();refreshEditedControl(c);},{opacity:key!=='iconColor'});
        continue;
      }
      const input = prop.type === 'tag'
        ? tagSelect(prop.label, propertyParent, c[key], value => {c[key] = value; markChanged();refreshEditedControl(c);})
        : prop.type === 'select'
          ? select(prop.label, propertyParent, prop.options, c[key] ?? prop.default)
          : field(prop.label, propertyParent, prop.type, c[key]);
      if(prop.min!==undefined)input.min=prop.min;
      if(prop.max!==undefined)input.max=prop.max;
      if(prop.step!==undefined)input.step=prop.step;
      if (key === 'fontFamily') input.setAttribute('aria-label', 'Font face');
      if (prop.type === 'checkbox') {
        input.checked = key === 'visible' ? c[key] !== false : Boolean(c[key] ?? prop.default);
        input.parentElement.classList.add('checkbox-row');
      }
      input.dataset.controlProperty=key;
      if (prop.type !== 'tag') input.onchange = () => {
        const fixedPoints=key==='strokeWidth' && c.type==='polyline'?polylinePagePoints({...c,points:linePoints(c)}):null;
        c[key] = prop.type === 'checkbox' ? input.checked : prop.type === 'number' ? Number(input.value) : input.value;
        if(prop.min!==undefined)c[key]=Math.max(prop.min,c[key]);
        if(prop.max!==undefined)c[key]=Math.min(prop.max,c[key]);
        if(fixedPoints)reshapePolyline(c,fixedPoints);
        if(key==='displayDigits')c[key]=Math.trunc(c[key]);
        if (['width', 'height', 'fontSize'].includes(key)) c[key] = Math.max(1, c[key]);
        markChanged();
        if(prop.type==='number')input.value=c[key];
        refreshEditedControl(c,key==='buttonDisplay');
      };
      if (key === 'height') node('p', `Right: ${c.left + c.width} · Bottom: ${c.top + c.height}`, panel, {className: 'hint layout-edges'});
    }
    if(isGroup)node('p','Drag anywhere inside the group box to move all members. Select a member in Explorer to edit it individually.',panel,{className:'hint'});
    return;
  }
  const isEvent = tab === 'Events';
  if (isEvent && !['numeric','listbox','dropdown','level','trend'].includes(c.type) && (controls[c.type]?.bindable || c.binding?.tag)) {
    node('h3', 'Display binding (optional)', panel);
    tagSelect('Display Source Tag', panel, c.binding?.tag || '', value => {
      c.binding = {tag: value}; markChanged();
    });
    node('hr', null, panel, {className: 'sidebar-divider'});
  }
  const items = isEvent ? c.events : c.actions;
  if(!items.some(item=>item.id===ruleId))ruleId=items[0]?.id || null;
  node('p', isEvent ? 'Change this control appearance or content when a condition is true.' : (isPage?'Complete actions run when this page opens or closes. Incomplete actions are skipped.':'Complete actions run on their mouse event. Incomplete actions are skipped.'), panel, {className: 'hint'});
  const actionLabels = isGroup?{show:'Show',hide:'Hide'}:isPage?{close_popup:'Close (Popup Only)',set_colors:'Set Colors'}:{show: 'Show', hide: 'Hide', set_colors: 'Set Colors'};
  if(c.type==='symbol')actionLabels.spin='Spin';
  if(blinkControlTypes.has(c.type))actionLabels.blink='Blink';
  if(['label','button'].includes(c.type))delete actionLabels.set_colors;
  if (controls[c.type]?.props.text) actionLabels.set_content = 'Set Content';
  const displayTag=id=>{const tag=pickerTags().find(tag=>tag.id===id);return tag?tagPath(tag):id;};
  const displayRule=item=>({...item,tag:displayTag(item.tag),target:displayTag(item.target),
    operand:item.operand?.kind==='tag'?{...item.operand,tag:displayTag(item.operand.tag)}:item.operand,
    end_operand:item.end_operand?.kind==='tag'?{...item.end_operand,tag:displayTag(item.end_operand.tag)}:item.end_operand});
  const describe = item => isEvent ? eventLabel(displayRule(item)) : actionLabel(displayRule(item),pages);
  const list = select(tab, panel, items.map(item => [item.id, describe(item)]), ruleId, {size: 6, className: 'listbox'});
  list.parentElement.classList.add('designer-rule-list');
  scrollableEditorList(list,false,JSON.stringify([page.id,c.id,tab]));
  for(const option of list.options)option.title=option.textContent;
  list.onchange = () => {ruleId = list.value; showInspector(panel);};
  const row = node('div', null, panel, {className: 'row compact'});
  button('+', row, () => {
    const item=newRule({id:randomId(),isEvent,isPage,isListbox:['listbox','dropdown'].includes(c.type),actions:catalog.actions,visualActions:actionLabels});
    items.push(item); ruleId = item.id; markChanged(); showInspector(panel);
  });
  button('−', row, () => {
    const index = items.findIndex(i => i.id === ruleId);
    if (index >= 0) items.splice(index, 1);
    ruleId = null; markChanged(); showInspector(panel);
  });
  {
    const kind=isEvent?'Event':'Action';
    const index=items.findIndex(item=>item.id===ruleId);
    function refreshRules(){const scroll=panel.scrollTop;markChanged();showInspector(panel);panel.scrollTop=scroll;}
    const icons={up:'M12 20V4 M5 11l7-7 7 7',down:'M12 4v16 M5 13l7 7 7-7',duplicate:'M8 8h12v12H8z M4 16V4h12'};
    function command(title,icon,disabled,run) {
      const b=button(null,row,run);b.title=title;b.setAttribute('aria-label',title);b.disabled=disabled;
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',icons[icon]);svg.append(path);b.append(svg);
      b.classList.add('rule-icon');
    }
    row.classList.add('event-commands');
    command('Move '+kind+' Up','up',index<=0,()=>{if(moveRule(items,ruleId,-1))refreshRules();});
    command('Move '+kind+' Down','down',index<0 || index===items.length-1,()=>{if(moveRule(items,ruleId,1))refreshRules();});
    command('Duplicate '+kind,'duplicate',index<0,()=>{const copy=duplicateRule(items,ruleId);if(copy){ruleId=copy.id;refreshRules();}});
  }
  const item = items.find(i => i.id === ruleId);
  if (!item) return;
  node('hr', null, panel, {className: 'sidebar-divider'});
  node('h3', isEvent ? 'Event settings' : 'Action settings', panel);
  function change(key, value, rerender = false) {
    item[key] = value;
    if(isEvent && key==='action' && value==='set_content')seedContentEvent(item,c);
    if(isEvent && key==='action' && value==='spin')item.rpm ??= 10;
    markChanged();
    for (const option of list.options) if (option.value === item.id) {option.textContent = describe(item);option.title=option.textContent;}
    if (rerender) showInspector(panel);
  }
  if (isEvent) tagSelect('Source Tag', panel, item.tag, value => change('tag', value));
  if (!isEvent) {
    const required=item.requiredRoles || [];
    const rolesButton=button('Access Roles: '+(required.length?required.map(id=>accessRoles.find(role=>role.id===id)?.name || 'Missing role').join(', '):'Any signed-in user'),panel,async()=>{
      const roles=await api('access/roles');accessRoles=roles;
      const next=await pickAccessRoles(roles,item.requiredRoles || []);
      if(next!==null)change('requiredRoles',next,true);
    });
    rolesButton.title='All selected roles are required. Administrators can run any action.';
    rolesButton.classList.add('action-access-button');
    const trigger = select(isPage?'Page event':'Mouse event', panel,
      isPage?[['page_open','Page Open'],['page_close','Page Close']]:['listbox','dropdown'].includes(c.type)?[['user_changed','User Changed']]:[['mouse_down', 'Mouse Down'], ['mouse_up', 'Mouse Up'], ['click', 'Click']], item.trigger);
    trigger.onchange = () => change('trigger', trigger.value);
    const pageActionUnavailable=isPage && ['navigate','popup'].includes(item.action);
    const actionGroup=node('div',null,panel,{className:'event-condition-group event-action-group',role:'group','aria-label':'Action details'});
    const action = select('Action', actionGroup, [...(pageActionUnavailable?[['','Select an action…']]:[]), ...Object.entries(catalog.actions).map(([key, a]) => [key, a.label]), ['value_input','Value Input'], ...(!isPage?[['navigate','Navigate to Page'], ['popup','Popup Page']]:[])], pageActionUnavailable?'':item.action);
    action.onchange = () => change('action', action.value, true);
    if(!['navigate','popup'].includes(item.action))tagSelect('Tag', actionGroup, item.tag, value=>change('tag',value));
    if(item.action==='value_input') {
      item.minimum ??= 0;item.maximum ??= 100;item.allowDecimal ??= false;
      for(const [key,label] of [['promptText','Prompt Text'],['unitText','Unit Text']]){
        const input=field(label,actionGroup,'text',item[key] || '');input.placeholder=key==='promptText'?(item.prompt || 'Value'):(c.unitText || '');input.onchange=()=>change(key,input.value);
      }
      for(const [key,label] of [['minimum','Minimum'],['maximum','Maximum']]) {
        const input=field(label,actionGroup,'number',item[key]);input.step='any';
        input.onchange=()=>change(key,input.value===''?'':Number(input.value));
      }
      const decimal=field('Allow Decimal',actionGroup,'checkbox');decimal.checked=item.allowDecimal;
      decimal.parentElement.classList.add('checkbox-row');decimal.onchange=()=>change('allowDecimal',decimal.checked);
    }
    if (!isPage && ['navigate', 'popup'].includes(item.action)) {
      const destination = select('Page', actionGroup, [['','Select page…'], ...pages.map(p => [p.id,p.name])], item.page || '');
      destination.onchange = () => {item.parameters={};change('page', destination.value,true);};
      const editDestination=button('Edit Page',actionGroup,async()=>{
        const id=item.page;if(!(await choosePage(id)))return;
        selected=PAGE_SELECTION;tab='Properties';location.hash='#editor/'+id;route();
      });
      editDestination.disabled=!pages.some(p=>p.id===item.page);
      const connections=button('Connect Parameters',actionGroup,async()=>{
        const target=pages.find(p=>p.id===item.page);if(!target)return;
        const result=await connectParameters(target,item.parameters || {},(parent,name,value,onChange)=>tagPicker(parent,{label:'Tag for '+name,hideLabel:true,value,onChange,...pickerProviders()}));
        if(result!==null)change('parameters',result);
      });
      connections.disabled=!pages.some(p=>p.id===item.page);
      if (item.action === 'popup') {
        const position = select('Placement', actionGroup, [['centered','Centered'], ['mouse','Mouse Location']], item.position || 'centered');
        position.onchange = () => change('position', position.value);
      }
    }
    if (catalog.actions[item.action]?.needs_value) {
      const value = field('Action value', actionGroup, 'number', item.value);
      value.onchange = () => change('value', Number(value.value));
    }
    return;
  }
  const conditionGroup=node('div',null,panel,{className:'event-condition-group',role:'group','aria-label':'Event condition'});
  const comparison = select('Comparison', conditionGroup,
    [['=', 'Equals'], ['!=', 'Not Equal'], ['<', 'Less Than'], ['>', 'Greater Than'],
     ['within_range', 'Within Range'], ['out_of_range', 'Out Of Range']], item.operator);
  comparison.onchange = () => change('operator', comparison.value, true);
  function operandEditor(label, key) {
    const group=node('div',null,conditionGroup,{className:'event-operand-group',role:'group','aria-label':label});
    const operand = item[key] ??= {kind: 'value', value: 0};
    const mode = select(label + ' type', group, [['value', 'Value'], ['tag', 'Tag']], operand.kind || 'value');
    mode.onchange = () => change(key,{...operand,kind:mode.value},true);
    if (operand.kind === 'tag') tagSelect(label, group, operand.tag || '', value => change(key,{...operand,tag:value}));
    else {
      const value = field(label, group, 'number', operand.value ?? 0); value.step = 'any';
      value.onchange = () => change(key,{...operand,value:Number(value.value)});
    }
  }
  const range = ['within_range', 'out_of_range'].includes(item.operator);
  operandEditor(range ? 'Range Start' : 'Compare To', 'operand');
  if (range) operandEditor('Range End', 'end_operand');
  const options = Object.entries(actionLabels);
  // Existing v2 tag-write events remain runnable/editable; new events are visual.
  if (!actionLabels[item.action]) options.push([item.action, 'Legacy: ' + catalog.actions[item.action]?.label]);
  const action = select('Action', panel, options, item.action);
  action.onchange = () => change('action', action.value, true);
  if(item.action==='spin') {
    const rpm=field('Revolutions per minute',panel,'number',item.rpm ?? 10);rpm.min=0;rpm.max=60;rpm.step='any';
    rpm.onchange=()=>{const speed=Math.min(60,Math.max(0,Number(rpm.value)||0));rpm.value=speed;change('rpm',speed);};
    node('p','Spins clockwise while this condition is true. Stops at its current angle when false or unavailable. Maximum 60 RPM.',panel,{className:'hint'});
  } else if (item.action === 'set_colors') {
    item.backColor ??= '#ffffff';
    item.foreColor ??= '#243247';
    if(c.type==='symbol'){
      const stroke=field('Stroke Width',panel,'number',item.strokeWidth ?? c.strokeWidth ?? 2);stroke.min=0;stroke.step='any';
      stroke.onchange=()=>change('strokeWidth',Math.max(0,Number(stroke.value)||0));
    }
    const colorRow = node('div', null, panel, {className: 'color-picker-row'});
    for (const [key, title] of [['backColor', 'Back'], ['foreColor', 'Fore']]) {
      colorPicker(title, colorRow, item[key] || (key === 'backColor' ? '#ffffff' : '#243247'), value => change(key, value));
    }
  } else if (item.action === 'set_content') {
    button('Edit Content', panel, async () => {
      const draft = {...c, ...item.contentStyle, text: item.content ?? c.text ?? ''};
      const changed = await openTextEditor(draft, {onInsertTag:pickInlineTag,previewBackground:page.showBackground===false || (page.backColor?.length===9 && page.backColor.endsWith('00'))?getComputedStyle(document.body).backgroundColor:page.backColor});
      if (changed) {
        const {text, ...style} = changed;
        item.contentStyle = style;
        change('content', text, true);
      }
    });
    node('p', 'Text, font, alignment, and colors apply together while this condition is true.', panel, {className:'hint'});
  } else if (!actionLabels[item.action]) {
    tagSelect('Legacy target tag', panel, item.target || '', value => change('target', value));
    const amount = field('Action value', panel, 'number', item.amount ?? 1);
    amount.onchange = () => change('amount', Number(amount.value));
  }
  if(item.action!=='spin')node('p', 'Visual rules apply while true. Otherwise the control returns to its normal appearance. Later matching rules take precedence.', panel, {className: 'hint'});
}
function paintRuntime(updated=null) {
  for (const el of document.querySelectorAll('.runtime [data-control-id]')) {
    const owner=runtimeOwner(el.closest('.canvas'));
    const control=owner?.controls.find(c=>c.id===el.dataset.controlId);
    const group=owner?.groups?.find(g=>g.id===control?.groupId);
    if(control && (!updated || (group?.events || []).some(event=>eventTagIds(event).some(id=>updated.has(id))) || updated.has(control.binding?.tag) || (control.type==='trend' && trendSeries(control).some(s=>updated.has(s.tag))) || controlInlineTagIds(control,tags).some(id=>updated.has(id)) || (control.events || []).some(event=>eventTagIds(event).some(id=>updated.has(id)))))paint(el,control,owner,false);
  }
}
const viewEventStates=new Map();
let activeViewIds=[];
const pageLifecycles=new PageLifecycles((owner,trigger)=>{
  const actions=(owner.actions || []).filter(action=>action.trigger===trigger && !['navigate','popup'].includes(action.action));
  if(!actions.length)return;
  actionQueue=actionQueue.catch(()=>{}).then(async()=>{
    for(const action of actions) {
      try{await api('rules/validate',{kind:'actions',item:action});}catch{continue;}
      await executeAction(action);
    }
  });
  actionQueue.catch(error=>notify(error.message));
});
function syncPageLifecycles() {
  const entries=[...document.querySelectorAll('.runtime .canvas')].map(key=>({key,owner:runtimeOwner(key)})).filter(entry=>entry.owner);
  if(pageLifecycles.sync(entries)){evaluateViews();paintRuntime();}
}
function evaluatePageViews(updated=null) {
  for(const [canvas,view] of pageLifecycles.views) {
    if(!canvas.isConnected)continue;
    if(updated && !(view.owner.events || []).some(event=>eventTagIds(event).some(id=>updated.has(id))))continue;
    const appearance=evaluateControlEvents({...view.owner,type:'page'},values,view.states);
    stylePage(canvas,{...view.owner,...appearance});
    canvas.style.color=appearance.foreColor || view.owner.foreColor || '';
    if(appearance.closePopup)canvas.closest('.page-window')?.querySelector('.page-window-caption button')?.click();
  }
}
function evaluateViews(updated=null) {
  evaluatePageViews(updated);
  for(const [canvas,view] of pageLifecycles.views) {
    if(!canvas.isConnected)continue;
    const owner=view.owner,id=owner.instanceId || owner.id;
    controlStates[id] ??= {};
    for(const control of [...owner.groups || [],...owner.controls]) {
      if(updated && !(control.events || []).some(event=>eventTagIds(event).some(id=>updated.has(id))))continue;
      const key=id+'/'+control.id;
      if(!viewEventStates.has(key))viewEventStates.set(key,new Map());
      controlStates[id][control.id]=evaluateControlEvents(control,values,viewEventStates.get(key),action=> {
        actionQueue=actionQueue.catch(()=>{}).then(async()=> {
          try {await api('rules/validate',{kind:'actions',item:action});}catch{return;}
          await api('action',action);
        });
        actionQueue.catch(error=>notify(error.message));
      });
    }
  }
}
const subscriptions=new LiveSubscriptions({
  fetchBatch:job=>api('values/batch',{source:job.source,tags:job.tags,pages:job.pages}),
  onData:(data,job)=> {
    for(const [id,sample] of Object.entries(data.values))if(!values[id]?.timestamp || !sample.timestamp || sample.timestamp>=values[id].timestamp)values[id]=sample;
    const updated=new Set(Object.keys(data.values));
    evaluateViews(updated);paintRuntime(updated);
  },
  onError:error=>{if(error.message!==lastNetworkError)notify(error.message);lastNetworkError=error.message;}
});
async function syncLiveViews() {
  if(csrf)syncPageLifecycles();
  if(!csrf){pageLifecycles.views.clear();subscriptions.close();return;}
  const interest=sendInterest();
  const visible=document.visibilityState!=='hidden';
  const ids=visible?[...new Set([...document.querySelectorAll('.runtime .canvas')].map(el=>el.dataset.pageId).filter(Boolean))].sort():[];
  if(JSON.stringify(ids)!==JSON.stringify(activeViewIds)) {
    const removed=activeViewIds.filter(id=>!ids.includes(id));
    for(const id of removed){delete controlStates[id];for(const key of viewEventStates.keys())if(key.startsWith(id+'/'))viewEventStates.delete(key);}
    activeViewIds=ids;evaluateViews();paintRuntime();
  }
  const wanted=new Set((visible?liveOwners():[]).flatMap(owner=>pageTagIds(owner,tags)));
  const instances=new Set(liveOwners().map(owner=>owner.instanceId || owner.id));
  for(const id of Object.keys(controlStates))if(!instances.has(id)){delete controlStates[id];for(const key of viewEventStates.keys())if(key.startsWith(id+'/'))viewEventStates.delete(key);}
  const groups=[];
  for(const source of sources) {
    const selected=tags.filter(tag=>tag.source===source.id && wanted.has(tag.id)).map(tag=>tag.id).sort();
    if(selected.length)groups.push({source:source.id,tags:selected,pages:ids,interval:Number(source.settings.live)>0?Number(source.settings.live)*1000:refreshPolicy.defaultLive});
  }
  subscriptions.update(groups);
  await interest;
}
async function managementRefresh() {
  if(!csrf)return;
  await syncLiveViews();
  if(sourceManager) {
    const statuses=await api('sources/status');
    applySourceStatuses(sources,statuses);
    const tag=sourceManager?.selectedTag();
    if(tag){const data=await api('values/batch',{source:tag.source,tags:[tag.id],pages:[]});Object.assign(values,data.values);}
    sourceManager?.refresh();
  }

}
const navigation=navigationHistory(window);
document.querySelector('#navigation-back').onclick=()=>navigation.back();
installDialogKeyboard(document);
window.addEventListener('hashchange',()=>{if(navigation.changed())route();});
window.addEventListener('beforeunload',e=> {
  if(dirty) {
    e.preventDefault();
    e.returnValue='';
  }
});
setInterval(()=> {
  if(refreshing)return;refreshing=true;
  managementRefresh().catch(error=>{if(error.message!==lastNetworkError)notify(error.message);lastNetworkError=error.message;}).finally(()=>{refreshing=false;});
},refreshPolicy.management);
let viewSyncQueued=false;
const viewObserver=new MutationObserver(records=> {
  const touchesView=records.some(record=>[...record.addedNodes,...record.removedNodes].some(el=>
    el.nodeType===1 && (el.matches('.runtime, .runtime .canvas') || el.querySelector('.runtime, .runtime .canvas'))));
  if(!touchesView || viewSyncQueued)return;viewSyncQueued=true;
  queueMicrotask(()=>{viewSyncQueued=false;safe(syncLiveViews);});
});
viewObserver.observe(document.body,{childList:true,subtree:true});
document.addEventListener('visibilitychange',()=>safe(syncLiveViews));
window.addEventListener('pagehide',()=>subscriptions.close());
const alarmAttention=mountAlarmAttention({before:account,api});
safe(start);

// Join the three editor panels directly to the menu, including when it wraps.
installLauncher(document.querySelector('#launcher-button'),{canManage:()=>Boolean(currentUser?.administrator && !currentUser?.kiosk)});
function measureChrome() {
  const header = document.querySelector('header');
  document.documentElement.style.setProperty('--header-height', header.getBoundingClientRect().height + 'px');
}
const chromeObserver = new ResizeObserver(measureChrome);
chromeObserver.observe(document.querySelector('header'));
measureChrome();

let lastSessionActivity=0;
function sessionActivity(event){
  if(!event.isTrusted || !csrf || Date.now()-lastSessionActivity<5000)return;
  lastSessionActivity=Date.now();safe(()=>api('session/activity',{}));
}
for(const type of ['pointerdown','keydown','wheel'])document.addEventListener(type,sessionActivity,{passive:true});

installClock(document.querySelector('#header-clock'));
