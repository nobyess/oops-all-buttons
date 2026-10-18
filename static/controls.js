import {symbolDefinition} from './symbol.js';
import {levelDefinition} from './level-indicator.js';
import {listboxDefinition} from './listbox.js';
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
  level:levelDefinition(common),
  symbol:symbolDefinition(common),
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
      img.draggable=false;img.className='image-content';img.style.objectFit=c.fit || 'contain';el.append(img);
    },
    update(el,c,ctx) {
      const img=el.querySelector('img');
      if(!c.image) {el.replaceChildren();el.textContent=ctx.editing?'Choose image':'';return;}
      if(!img) {el.replaceChildren();controls.image.render(el,c,ctx);return;}
      if(img.getAttribute('src')!==c.image)img.src=c.image;
      img.alt=c.alt || '';img.style.objectFit=c.fit || 'contain';
    }
  },
  label: {
    label:'Label', props:{...common,roundedCorners:{label:'Rounded Corners',type:'checkbox'}},
    defaults:{text:'Label', width:160, height:44,roundedCorners:false},
    render(el, c) { el.textContent = c.contentOverride ?? c.text; }
  },
  numeric: {
    label:'Numeric Display', bindable:true,
    props:{valueTag:{label:'Tag',type:'binding'},displayDigits:{label:'Display Digits',type:'number',min:0,max:15,step:1},
      ...Object.fromEntries(Object.entries(common).filter(([key])=>key!=='text'))},
    defaults:{width:170,height:50,displayDigits:2},
    render(el,c,ctx) {el.textContent=numericDisplayValue(ctx.bindingValue,c.displayDigits ?? 2);}
  },
  button: {
    label:'Button', props:common,
    defaults:{text:'Press', width:140, height:48},
    render(el, c, ctx) {
      const button = document.createElement('button');
      const text = document.createElement('span');
      text.className = 'button-text';
      text.textContent = c.contentOverride ?? c.text;
      button.append(text);
      button.disabled = ctx.editing;
      el.append(button);
    },
    // Live updates must retain the button DOM node between mouse-down and mouse-up.
    update(el, c, ctx) {
      const button = el.querySelector('button');
      button.querySelector('.button-text').textContent = c.contentOverride ?? c.text;
      button.disabled = ctx.editing;
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
