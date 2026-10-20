import {assetNode as node,assetPreview} from './asset-ui.js';
import {closeIcon} from './close-icon.js';

export function contentField(parent,{kind,value='',name='',onPick,onClear,renderPreview,label}){
 const field=node('div',null,parent,{className:'content-field'});
 node('span',label||(kind==='symbol'?'Symbol':kind==='icon'?'Icon':'Image'),field,{className:'content-field-label'});
 const row=node('div',null,field,{className:'content-field-row tag-picker-field'});
 const pick=node('button',null,row,{type:'button',className:'content-field-pick'});
 pick.setAttribute('aria-label','Choose '+kind);
 const preview=node('span',null,pick,{className:'content-field-preview'});preview.setAttribute('aria-hidden','true');
 if(value&&renderPreview)renderPreview(preview);
 else if(value)assetPreview(preview,{kind,url:value,name},{thumbnail:true});
 else node('span','—',preview);
 node('span',value?(name||'Selected '+kind):'Select '+kind+'…',pick,{className:'content-field-name'});
 const clear=node('button',null,row,{type:'button',className:'content-field-clear tag-picker-clear',disabled:!value});
 clear.setAttribute('aria-label','Clear '+kind);clear.append(closeIcon());
 pick.onclick=onPick;clear.onclick=onClear;
 return field;
}
