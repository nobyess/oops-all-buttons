import {parseInlineToken,inlineToken} from './inline-format.js';
import {fonts} from './controls.js';
import {alignmentPicker} from './alignment-picker.js';
import {colorPicker} from './color-picker.js';
export const textFields=['text','fontFamily','fontSize','bold','italic','textHorizontalAlignment','textVerticalAlignment','backColor','foreColor','blink'];
function el(tag,text,parent,attributes={}) {
  const node=document.createElement(tag);if(text!==null)node.textContent=text;Object.assign(node,attributes);parent?.append(node);return node;
}
export function seedContentEvent(event,control){
  if(event.content!==undefined)return;
  event.content=control.text ?? '';
  event.contentStyle=Object.fromEntries(textFields.filter(key=>key!=='text' && control[key]!==undefined).map(key=>[key,structuredClone(control[key])]));
  if(control.textRefs)event.contentRefs=structuredClone(control.textRefs);
}
export function openTextEditor(control, {onInsertTag,previewBackground='#ffffff'} = {}) {
  return new Promise(resolve=>{
    const draft={text:control.text || '',fontFamily:control.fontFamily || 'default',fontSize:control.fontSize ?? 16,
      bold:Boolean(control.bold),italic:Boolean(control.italic),blink:Boolean(control.blink),textHorizontalAlignment:control.textHorizontalAlignment || 'center',
      textVerticalAlignment:control.textVerticalAlignment || 'center',backColor:control.backColor || '#ffffff',foreColor:control.foreColor || '#243247'};
    const modal=el('dialog',null,document.body,{className:'text-editor designer-dialog'});modal.setAttribute('aria-label','Text Editor');
    const form=el('form',null,modal),header=el('div',null,form,{className:'text-editor-header'});el('h2','Text Editor',header);
    const insert=onInsertTag?el('button','Insert Tag',header,{type:'button'}):null;
    const previewSurface=el('div',null,form,{className:'text-editor-preview'});previewSurface.style.backgroundColor=previewBackground;
    const text=el('textarea',null,previewSurface,{value:draft.text,rows:8,className:'text-editor-input'});text.setAttribute('aria-label','Text');
    if(insert) {
      insert.onclick=async()=>{
        let start=text.selectionStart ?? text.value.length,end=text.selectionEnd ?? start;
        const existing=[...text.value.matchAll(/@\{([^{}\r\n]+)\}/g)].find(match=>start>=match.index && start<match.index+match[0].length && end<=match.index+match[0].length);
        let initial={};if(existing){const raw=existing[1];initial={...parseInlineToken(raw),tag:control.textRefs?.[raw]};start=existing.index;end=start+existing[0].length;}
        insert.disabled=true;
        try {
          const result=await onInsertTag(initial);
          if(result) {
            const token=typeof result==='string'?inlineToken(result):inlineToken(result.path,result.format);
            text.value=text.value.slice(0,start)+token+text.value.slice(end);
            text.setSelectionRange(start+token.length,start+token.length);
          }
        } finally {insert.disabled=false;text.focus();}
      };
    }
    const alignments=el('div',null,form,{className:'text-editor-columns text-editor-alignments'});
    alignmentPicker('Horizontal Alignment',alignments,'horizontal',draft.textHorizontalAlignment,value=>{draft.textHorizontalAlignment=value;preview();});
    alignmentPicker('Vertical Alignment',alignments,'vertical',draft.textVerticalAlignment,value=>{draft.textVerticalAlignment=value;});
    const columns=el('div',null,form,{className:'text-editor-columns'}),font=el('section',null,columns),colors=el('section',null,columns);
    el('h3','Font',font);
    const face=el('select',null,font);face.setAttribute('aria-label','Font face');
    for(const item of fonts)el('option',item.label,face,{value:item.id});face.value=draft.fontFamily;
    const sizeLabel=el('label','Size',font),size=el('input',null,sizeLabel,{type:'number',min:1,step:1,value:draft.fontSize,required:true});
    for(const [key,title] of [['bold','Bold'],['italic','Italic']]) {
      const label=el('label',title,font,{className:'checkbox-row'}),checkbox=el('input',null,label,{type:'checkbox',checked:draft[key]});
      checkbox.onchange=()=>{draft[key]=checkbox.checked;preview();};
    }
    el('h3','Appearance',colors);const row=el('div',null,colors,{className:'color-picker-row'});
    colorPicker('Back',row,draft.backColor,value=>{draft.backColor=value;preview();});
    colorPicker('Fore',row,draft.foreColor,value=>{draft.foreColor=value;preview();});
    const blinkLabel=el('label','Blink',colors,{className:'checkbox-row'}),blink=el('input',null,blinkLabel,{type:'checkbox',checked:draft.blink});
    blink.onchange=()=>{draft.blink=blink.checked;};
    function preview(){Object.assign(text.style,{fontFamily:(fonts.find(item=>item.id===draft.fontFamily)||fonts[0]).stack,
      fontSize:draft.fontSize+'px',fontWeight:draft.bold?'700':'400',fontStyle:draft.italic?'italic':'normal',
      textAlign:draft.textHorizontalAlignment,backgroundColor:draft.backColor,color:draft.foreColor});}
    face.onchange=()=>{draft.fontFamily=face.value;preview();};
    size.oninput=()=>{const value=Number(size.value);if(Number.isFinite(value)&&value>=1){draft.fontSize=value;preview();}};
    const footer=el('div',null,form,{className:'row dialog-footer'}),cancel=el('button','Cancel',footer,{type:'button'});
    el('button','Save',footer,{type:'submit'});
    function finish(value){modal.close();modal.remove();resolve(value);}
    cancel.onclick=()=>finish(null);modal.oncancel=event=>{event.preventDefault();finish(null);};
    form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;draft.text=text.value;draft.fontSize=Number(size.value);finish({...draft});};
    preview();modal.showModal();text.focus();
  });
}
