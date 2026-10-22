import {assetNode as node} from './asset-ui.js';
import {markdownEditor} from './markdown-editor.js';
import {mountAssetSelection} from './asset-selection.js';
import {closeIcon} from './close-icon.js';
import {makeDialogMovable} from './movable-dialog.js';

let nextEditor=0;
export function openTextViewerEditor(control,{api}){return new Promise(resolve=>{
 const previous=document.activeElement,prefix='text-viewer-editor-'+(++nextEditor);
 let done=false,stopMoving=()=>{},cleanupAssets=()=>{},mode=control.textSource || (control.image?'asset':'inline');
 let asset={url:control.image || '',name:control.imageName || '',markdown:Boolean(control.textMarkdown)};
 const modal=node('dialog',null,document.body,{className:'designer-dialog text-editor text-viewer-editor'});
 modal.setAttribute('aria-label','Text Viewer Content');
 const caption=node('div',null,modal,{className:'text-editor-caption floating-window-caption'});
 node('h2','Text Viewer Content',caption);
 const close=node('button',null,caption,{type:'button'});close.setAttribute('aria-label','Close');close.append(closeIcon());
 const form=node('form',null,modal),tabs=node('div',null,form,{className:'tabs'});
 tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Text content source');
 const markdownTab=node('button','Markdown',tabs,{type:'button'}),assetTab=node('button','Assets',tabs,{type:'button'});
 const markdownPanel=node('div',null,form),assetPanel=node('div',null,form);
 for(const [tab,panel,key] of [[markdownTab,markdownPanel,'markdown'],[assetTab,assetPanel,'assets']]){tab.id=prefix+'-'+key;panel.id=tab.id+'-panel';tab.setAttribute('aria-controls',panel.id);panel.setAttribute('aria-labelledby',tab.id);}
 const editor=markdownEditor(markdownPanel,{api,value:control.markdownText || ''});
 const error=node('p','',form,{className:'error',role:'alert'});
 const footer=node('div',null,form,{className:'row dialog-footer'});
 const cancel=node('button','Cancel',footer,{type:'button'}),save=node('button','Save',footer,{type:'submit'});save.dataset.dialogDefault='true';
 function paint(){markdownPanel.hidden=mode!=='inline';assetPanel.hidden=mode!=='asset';markdownTab.classList.toggle('active',mode==='inline');assetTab.classList.toggle('active',mode==='asset');for(const [tab,panel,active] of [[markdownTab,markdownPanel,mode==='inline'],[assetTab,assetPanel,mode==='asset']]){tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;panel.setAttribute('role','tabpanel');}error.textContent='';stopMoving.reposition?.();}
 markdownTab.onclick=()=>{mode='inline';paint();};assetTab.onclick=()=>{mode='asset';paint();};
 tabs.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();mode=event.key==='Home'?'inline':event.key==='End'?'asset':mode==='inline'?'asset':'inline';paint();(mode==='inline'?markdownTab:assetTab).focus();};
 const finish=result=>{if(done)return;done=true;cleanupAssets();stopMoving();modal.close();modal.remove();if(previous?.isConnected)previous.focus({preventScroll:true});resolve(result);};
 close.onclick=cancel.onclick=()=>finish(null);modal.oncancel=e=>{e.preventDefault();finish(null);};modal.onclose=()=>finish(null);
 form.onsubmit=e=>{e.preventDefault();if(mode==='asset'&&!asset.url){error.textContent='Select a text asset.';return;}finish({textSource:mode,markdownText:editor.value,image:mode==='asset'?asset.url:'',imageName:mode==='asset'?asset.name:'',textMarkdown:mode==='inline'||asset.markdown});};
 cleanupAssets=mountAssetSelection(assetPanel,{api,kind:'text',value:asset.url,onSelect:item=>{asset={url:item.url,name:item.name,markdown:/\.md$/i.test(item.filename)};error.textContent='';},onConfirm:()=>{if(mode==='asset')form.requestSubmit();}});
 paint();modal.showModal();stopMoving=makeDialogMovable(modal,caption);
});}
