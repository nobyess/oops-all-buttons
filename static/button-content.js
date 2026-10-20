import {buttonIcon} from './button-icons.js';
import {symbolDefinition} from './symbol.js';
const symbolRenderer=symbolDefinition({});
export function updateButtonContent(button,c,ctx={}){
 const mode=['text','icon','both'].includes(c.buttonDisplay)?c.buttonDisplay:'text';
 const text=button.querySelector('.button-text');text.hidden=mode==='icon';
 let icon=button.querySelector('.button-icon');
 if(!icon){icon=document.createElement('span');icon.className='button-icon';button.append(icon);}
 const kind=c.buttonArtworkKind||'icon',signature=JSON.stringify([kind,kind==='icon'?c.icon:c.image]);
 if(icon.dataset.icon!==signature){
  icon.replaceChildren();icon.dataset.symbolImage='';
  if(kind==='image'&&c.image){const image=document.createElement('img');image.src=c.image;image.alt='';image.draggable=false;icon.append(image);}
  else if(kind==='icon'){const svg=buttonIcon(c.icon);if(svg)icon.append(svg);}
  icon.dataset.icon=signature;
 }
 const size=Math.max(12,Math.min(128,Number(c.iconSize)||24));
 icon.style.width=icon.style.height=size+'px';
 const iconColor=c.iconColor?.slice(0,7);
 icon.style.color=iconColor||'inherit';
 if(kind==='symbol')symbolRenderer.update(icon,{...c,foreColor:iconColor||c.foreColor,width:size,height:size,fit:'contain',strokeWidth:2,spinRpm:0},ctx);
 icon.hidden=mode==='text'||(kind==='icon'?!icon.children.length:!c.image);
 const position=['before','after','above','below'].includes(c.iconPosition)?c.iconPosition:'before';
 button.dataset.iconPosition=position;
 button.setAttribute('aria-label',String(c.contentOverride??c.text??c.name??'Button'));
}
