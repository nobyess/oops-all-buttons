export function inputValue(text,{minimum=0,maximum=100,allowDecimal=false}) {
  const min=Number(minimum),max=Number(maximum);
  if(!Number.isFinite(min)||!Number.isFinite(max)||min>max)throw new Error('Invalid minimum or maximum.');
  const pattern=allowDecimal?/^-?(?:\d+(?:\.\d*)?|\.\d+)$/:/^-?\d+$/;
  if(!pattern.test(String(text)))throw new Error(allowDecimal?'Enter a number.':'Enter a whole number.');
  const value=Number(text);
  if(!Number.isFinite(value)||value<min||value>max)throw new Error(`Enter a value from ${min} to ${max}.`);
  return value;
}
export function openValueInput(settings,{name='',value,onSubmit}={}) {
  return new Promise(resolve=>{
    const previous=document.activeElement;
    function el(tag,text,parent,props={}){const e=document.createElement(tag);if(text!==null)e.textContent=text;Object.assign(e,props);parent?.append(e);return e;}
    const heading=String(settings.prompt || '').trim() || 'Enter Value';
    const prompt=String(settings.promptText || '').trim() || 'Value',unit=String(settings.unitText || '').trim();
    const modal=el('dialog',null,document.body,{className:'value-input-dialog designer-dialog'});modal.setAttribute('aria-label',heading);
    const form=el('form',null,modal),header=el('div',null,form,{className:'value-input-heading'});el('h2',heading,header);
    const close=el('button','×',header,{type:'button',className:'value-input-close'});close.setAttribute('aria-label','Close numeric keypad');
    const min=Number(settings.minimum ?? 0),max=Number(settings.maximum ?? 100);
    const label=el('div',null,form,{className:'value-input-field'});el('span',prompt,label);
    const entry=el('div',null,label,{className:'value-input-entry'}),display=el('div',null,entry,{className:'value-input-display',tabIndex:0});display.setAttribute('role','textbox');display.setAttribute('aria-label',prompt);display.setAttribute('aria-readonly','true');
    const before=el('span','',display),cursor=el('span','',display,{className:'value-input-caret'}),selected=el('span','',display,{className:'value-input-selected'}),after=el('span','',display);
    if(unit)el('span',unit,entry,{className:'value-input-unit'});
    const meta=el('div',null,form,{className:'value-input-meta'});
    el('span','Current value: '+(value===undefined?'—':String(value))+(unit?' '+unit:''),meta);
    if(name)el('span',name,meta,{className:'value-input-tag'});
    el('p',`Minimum: ${min} · Maximum: ${max}`,form,{className:'hint'});
    const tools=el('div',null,form,{className:'value-input-tools'}),clear=el('button','Clear',tools,{type:'button'}),backspace=el('button','⌫',tools,{type:'button'});backspace.setAttribute('aria-label','Backspace');
    const keys=el('div',null,form,{className:'value-input-keys'});keys.setAttribute('aria-label','Numeric keypad');
    const error=el('p','',form,{className:'value-input-error',role:'alert'});
    let draft='',anchor=0,caret=0,busy=false,finished=false;
    if(value!==undefined){try{inputValue(String(value),settings);draft=String(value);}catch{}}
    caret=draft.length;
    const validDraft=text=>(settings.allowDecimal?/^-?\d*(?:\.\d*)?$/:/^-?\d*$/).test(text) && (min<0 || !text.startsWith('-'));
    function render(){const from=Math.min(anchor,caret),to=Math.max(anchor,caret);before.textContent=draft.slice(0,from);selected.textContent=draft.slice(from,to);after.textContent=draft.slice(to);cursor.hidden=from!==to;display.setAttribute('aria-valuetext',draft || 'Empty');}
    function replace(from,to,text){const next=draft.slice(0,from)+text+draft.slice(to);if(!validDraft(next))return;draft=next;anchor=caret=from+text.length;error.textContent='';render();display.focus();}
    function press(key){if(busy)return;const from=Math.min(anchor,caret),to=Math.max(anchor,caret);
      if(key==='clear'){replace(0,draft.length,'');return;}
      if(key==='back'){if(from===to && from===0)return;replace(from===to?from-1:from,to,'');return;}
      if(key==='delete'){replace(from,to===from?Math.min(draft.length,to+1):to,'');return;}
      if(key==='±'){const next=draft.startsWith('-')?draft.slice(1):'-'+draft;if(validDraft(next)){draft=next;anchor=caret=next.length;error.textContent='';render();display.focus();}return;}
      replace(from,to,key);
    }
    display.onclick=()=>{if(!busy){anchor=0;caret=draft.length;render();display.focus();}};
    for(const key of ['7','8','9','4','5','6','1','2','3','±','0','.']){
      const button=el('button',key,keys,{type:'button'});button.disabled=key==='.'&&!settings.allowDecimal || key==='±'&&min>=0;
      if(key==='±')button.setAttribute('aria-label','Change sign');
      button.onpointerdown=event=>event.preventDefault();button.onclick=()=>press(key);
    }
    for(const [button,key] of [[clear,'clear'],[backspace,'back']]){button.onpointerdown=event=>event.preventDefault();button.onclick=()=>press(key);}
    const footer=el('div',null,form,{className:'row dialog-footer'}),cancel=el('button','Cancel',footer,{type:'button'}),enter=el('button','Enter',footer,{type:'submit'});
    function finish(result){if(finished)return;finished=true;modal.close();modal.remove();previous?.focus?.({preventScroll:true});resolve(result);}
    cancel.onclick=close.onclick=()=>{if(!busy)finish(null);};modal.oncancel=event=>{event.preventDefault();if(!busy)finish(null);};modal.onclose=()=>{if(!finished)finish(null);};
    function working(active){busy=active;clear.disabled=backspace.disabled=cancel.disabled=close.disabled=enter.disabled=active;for(const button of keys.children)button.disabled=active || button.textContent==='.'&&!settings.allowDecimal || button.textContent==='±'&&min>=0;display.setAttribute('aria-disabled',String(active));enter.textContent=active?'Writing…':'Enter';}
    form.onsubmit=async event=>{event.preventDefault();if(busy)return;let result;try{result=inputValue(draft,settings);}catch(e){error.textContent=e.message;display.focus();return;}
      if(!onSubmit){finish(result);return;}
      working(true);try{await onSubmit(result);finish(result);}catch(e){error.textContent=e.message || 'Write failed. Try again.';}finally{if(!finished){working(false);display.focus();anchor=0;caret=draft.length;render();}}
    };
    modal.onkeydown=event=>{
      if(event.isComposing)return;
      const key=event.key;
      if((event.ctrlKey || event.metaKey) && key.toLowerCase()==='a'){event.preventDefault();event.stopPropagation();if(!busy){anchor=0;caret=draft.length;render();}return;}
      if(event.ctrlKey || event.metaKey || event.altKey)return;
      const handled=/^[0-9]$/.test(key) || ['.','Decimal',',','-','Backspace','Delete','ArrowLeft','ArrowRight','Home','End','Enter','Escape'].includes(key);
      if(!handled)return;
      if(key==='Enter' && (event.target===cancel || event.target===close))return;
      event.preventDefault();event.stopPropagation();if(busy)return;
      if(key==='Escape'){finish(null);return;}
      if(key==='Enter'){form.requestSubmit();return;}
      if(['ArrowLeft','ArrowRight','Home','End'].includes(key)){
        const from=Math.min(anchor,caret),to=Math.max(anchor,caret);
        caret=key==='Home'?0:key==='End'?draft.length:key==='ArrowLeft'?(event.shiftKey?Math.max(0,caret-1):from!==to?from:Math.max(0,caret-1)):(event.shiftKey?Math.min(draft.length,caret+1):from!==to?to:Math.min(draft.length,caret+1));
        if(!event.shiftKey)anchor=caret;render();display.focus();return;
      }
      press(key==='Backspace'?'back':key==='Delete'?'delete':['Decimal',','].includes(key)?'.':key);
    };
    modal.onpaste=event=>{event.preventDefault();if(busy)return;const text=event.clipboardData?.getData('text/plain') || '';const from=Math.min(anchor,caret),to=Math.max(anchor,caret);if(validDraft(draft.slice(0,from)+text+draft.slice(to)))replace(from,to,text);else error.textContent='Paste a valid numeric value.';};
    render();modal.showModal();display.focus();
  });
}
