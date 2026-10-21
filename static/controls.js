import {textViewerDefinition} from './text-viewer.js';
import {positionArtwork} from './artwork-rotation.js';
import {symbolDefinition} from './symbol.js';
import {levelDefinition} from './level-indicator.js';
import {trendDefinition} from './live-trend.js';
import {listboxDefinition} from './listbox.js';
import {dropdownDefinition} from './dropdown.js';
import {updateButtonContent} from './button-content.js';
import {shapeDefinitions} from './shapes.js';
import {numericDisplayValue} from './value-format.js';
// Copy a definition to add a control. The editor builds its property panel from props.
// render(element, control, context) must use textContent for user-supplied text.
// Local font stacks always end with a generic family; no downloads are needed.
export const fonts = [
  {id:'default', label:'Default (System)', stack:'system-ui, sans-serif'},
  {id:'arial', label:'Arial / Helvetica', stack:'Arial, Helvetica, sans-serif'},
  {id:'verdana', label:'Verdana', stack:'Verdana, Geneva, sans-serif'},
  {id:'georgia', label:'Georgia', stack:'Georgia, "Times New Roman", serif'},
  {id:'times', label:'Times New Roman', stack:'"Times New Roman", Times, serif'},
  {id:'monospace', label:'Fixed Width', stack:'ui-monospace, Consolas, "Liberation Mono", "Courier New", monospace'}
];

const common = {
  text: {label:'Text', type:'text'},
  left: {label:'Left', type:'number'}, top: {label:'Top', type:'number'},
  width: {label:'Width', type:'number'}, height: {label:'Height', type:'number'},
  fontFamily: {label:'', type:'select', default:'default', options:fonts.map(font => [font.id, font.label])},
  fontSize: {label:'Size', type:'number'},
  bold: {label:'Bold', type:'checkbox'},
  italic: {label:'Italic', type:'checkbox'},
  textHorizontalAlignment: {label:'Horizontal Alignment', type:'alignment', axis:'horizontal', default:'center'},
  textVerticalAlignment: {label:'Vertical Alignment', type:'alignment', axis:'vertical', default:'center'},
  visible: {label:'Visible', type:'checkbox'},
  backColor: {label:'Back', type:'color'}, foreColor: {label:'Fore', type:'color'}
};

export const controls = {
  ...shapeDefinitions(common),
  listbox:listboxDefinition(common),
  dropdown:dropdownDefinition(common),
  level:levelDefinition(common),
  trend:trendDefinition(common),
  symbol:symbolDefinition(common),
  textviewer:textViewerDefinition(common),
  image: {
    label:'Image',
    props:{image:{label:'Image',type:'image'},
      fit:{label:'Fit',type:'select',default:'contain',options:[['contain','Fit (keep proportions)'],['cover','Fill (crop)'],['fill','Stretch'],['none','Original size']]},
      alt:{label:'Description',type:'text'},
      ...Object.fromEntries(Object.entries(common).filter(([key])=>['left','top','width','height','visible','backColor'].includes(key)))},
    defaults:{width:200,height:140,image:'',imageName:'',alt:'',fit:'contain',backColor:'#ffffff00'},
    render(el,c,ctx) {
      if(!c.image) {el.textContent=ctx.editing?'Choose image':'';return;}
      const img=document.createElement('img');img.src=c.image;img.alt=c.alt || '';
      img.draggable=false;img.className='image-content';img.style.objectFit=c.fit || 'contain';el.style.position='relative';positionArtwork(img,c);el.append(img);
    },
    update(el,c,ctx) {
      const img=el.querySelector('img');
      if(!c.image) {el.replaceChildren();el.textContent=ctx.editing?'Choose image':'';return;}
      if(!img) {el.replaceChildren();controls.image.render(el,c,ctx);return;}
      if(img.getAttribute('src')!==c.image)img.src=c.image;
      img.alt=c.alt || '';img.style.objectFit=c.fit || 'contain';positionArtwork(img,c);
    }
  },
  label: {
    label:'Label', props:{...common,roundedCorners:{label:'Rounded Corners',type:'checkbox'}},
    defaults:{text:'Label', width:160, height:44,roundedCorners:false,backColor:'#ffffff00'},
    render(el, c) { el.textContent = c.contentOverride ?? c.text; }
  },
  numeric: {
    label:'Numeric Display', bindable:true,
    props:{valueTag:{label:'Tag',type:'binding'},unitText:{label:'Unit Text',type:'text'},displayDigits:{label:'Display Digits',type:'number',min:0,max:15,step:1},
      ...Object.fromEntries(Object.entries(common).filter(([key])=>key!=='text'))},
    defaults:{width:170,height:50,displayDigits:2,unitText:'',backColor:'#ffffff00'},
    render(el,c,ctx) {el.textContent=numericDisplayValue(ctx.bindingValue,c.displayDigits ?? 2,c.unitText);}
  },
  button: {
    label:'Button', props:{text:common.text,buttonDisplay:{label:'Display',type:'select',default:'text',options:[['text','Text only'],['icon','Icon only'],['both','Icon and text']]},icon:{label:'Icon',type:'icon',visibleWhen:c=>c.buttonDisplay==='icon'||c.buttonDisplay==='both'},iconSize:{label:'Icon Size',type:'number',min:12,max:128,visibleWhen:c=>c.buttonDisplay==='icon'||c.buttonDisplay==='both'},iconPosition:{label:'Icon Position',type:'select',default:'before',options:[['before','Before text'],['after','After text'],['above','Above text'],['below','Below text']],visibleWhen:c=>c.buttonDisplay==='both'},iconColor:{label:'Icon Color',type:'color',visibleWhen:c=>(c.buttonDisplay==='icon'||c.buttonDisplay==='both')&&c.buttonArtworkKind!=='image'},...common},
    defaults:{text:'Press', width:140, height:48,buttonDisplay:'text',icon:'',iconSize:24,iconPosition:'before'},
    render(el, c, ctx) {
      const button = document.createElement('button');
      const text = document.createElement('span');
      text.className = 'button-text';
      text.textContent = c.contentOverride ?? c.text;
      button.append(text);
      button.disabled = ctx.editing;
      el.append(button);
      updateButtonContent(button,c,ctx);
    },
    // Live updates must retain the button DOM node between mouse-down and mouse-up.
    update(el, c, ctx) {
      const button = el.querySelector('button');
      button.querySelector('.button-text').textContent = c.contentOverride ?? c.text;
      button.disabled = ctx.editing;
      updateButtonContent(button,c,ctx);
    }
  },
  // Example custom control: no editor changes needed.
  indicator: {
    label:'Indicator', bindable:true, hidden:true,
    props:{...common, onColor:{label:'On Color', type:'color'}},
    defaults:{text:'Status', width:140, height:48, onColor:'#16a34a'},
    render(el, c, ctx) {
      el.textContent = c.contentOverride ?? c.text;
      el.style.borderRadius = '24px';
      const sample = ctx.bindingValue;
      el.style.background = ctx.appearance.backColor || (sample?.quality === 'good' && sample.value ? c.onColor : '#94a3b8');
    }
  }
};
