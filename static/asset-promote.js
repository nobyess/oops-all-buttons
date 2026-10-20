import {assetNode as node} from './asset-ui.js';
import {categoryInput} from './category-input.js';
export function promoteAsset(api,asset,{categories=[],builtins=[]}={}){return new Promise(resolve=>{
 const previous=document.activeElement,modal=node('dialog',null,document.body,{className:'designer-dialog asset-upload-dialog'});modal.setAttribute('aria-label','Make Built-in');
 const form=node('form',null,modal);node('h2','Make Built-in',form);
 const name=node('input',null,node('label','Name',form),{value:asset.name,required:true,maxLength:200});
 const category=categoryInput(form,{value:asset.category,categories});
 const destination=node('select',null,node('label','Destination',form));node('option','Create new built-in',destination,{value:''});
 for(const item of builtins.filter(item=>item.kind===asset.kind))node('option','Update '+item.name+' · '+item.category,destination,{value:item.id});
 destination.value=builtins.find(item=>item.kind===asset.kind&&item.name===asset.name&&item.category===asset.category)?.id||'';
 node('p','Copies this asset into the application’s built-in library. Your project copy and its references stay in place.',form,{className:'hint'});
 const status=node('p','',form,{role:'status'}),footer=node('div',null,form,{className:'row dialog-footer'});
 const cancel=node('button','Cancel',footer,{type:'button'}),confirm=node('button','Make Built-in',footer,{type:'submit'});confirm.dataset.dialogDefault='true';let done=false,busy=false;
 const finish=result=>{if(done)return;done=true;modal.close();modal.remove();if(previous?.isConnected)previous.focus({preventScroll:true});resolve(result);};
 cancel.onclick=()=>finish(null);modal.oncancel=event=>{event.preventDefault();finish(null);};modal.onclose=()=>finish(null);
 form.onsubmit=async event=>{event.preventDefault();if(busy||!form.reportValidity())return;busy=true;confirm.disabled=true;status.textContent='Saving built-in asset…';try{const result=await api('assets/promote',{id:asset.id,name:name.value.trim(),category:category.value.trim(),target:destination.value});finish(result);}catch(error){status.textContent=error.message;}finally{busy=false;confirm.disabled=false;}};
 modal.showModal();name.focus();
});}
