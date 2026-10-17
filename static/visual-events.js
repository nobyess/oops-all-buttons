// Presentation rules run only in open browser views, using received tag feedback.
export const visualActions=new Set(['show','hide','set_colors','set_content','close_popup','spin']);
export function eventTagIds(event) {
  return [event.tag,event.target,...[event.operand,event.end_operand].filter(value=>value?.kind==='tag').map(value=>value.tag)].filter(Boolean);
}
function numeric(value) {
  if(typeof value!=='number' && typeof value!=='boolean')throw new Error('Tag value is not numeric');
  value=Number(value);if(!Number.isFinite(value))throw new Error('Tag value must be finite');return value;
}
function tagValue(id,values) {
  const sample=values[id];if(!sample || sample.quality!=='good')throw new Error('Tag is unavailable');
  return numeric(sample.value);
}
function operandValue(operand,values) {
  if(operand.kind==='tag')return tagValue(operand.tag,values);
  if(operand.value==='' || operand.value===null)throw new Error('Comparison is incomplete');
  const value=Number(operand.value ?? 0);if(!Number.isFinite(value))throw new Error('Comparison must be finite');return value;
}
export function conditionMatches(event,values) {
  const value=tagValue(event.tag,values);
  const lower=operandValue(event.operand || {value:event.value ?? 0},values);
  switch(event.operator || '=') {
    case '=':return value===lower;
    case '!=':return value!==lower;
    case '<':return value<lower;
    case '>':return value>lower;
    case 'range':case 'within_range':case 'out_of_range': {
      const upper=operandValue(event.end_operand || {value:event.upper ?? lower},values);
      if(lower>upper)throw new Error('Range start exceeds range end');
      const within=value>=lower && value<=upper;
      return event.operator==='out_of_range'?!within:within;
    }
    default:throw new Error('Unknown comparison');
  }
}
export function evaluateControlEvents(control,values,previous=new Map(),onAction=()=>{}) {
  const appearance={};
  for(const event of control.events || []) {
    if(!event.id || !event.tag)continue;
    try {
      const current=conditionMatches(event,values),old=previous.get(event.id);
      previous.set(event.id,current);
      if(visualActions.has(event.action)) {
        if(event.action==='spin' && control.type==='symbol')appearance.spinRpm=current?Math.min(60,Math.max(0,Number(event.rpm ?? 10)||0)):0;
        if(!current)continue;
        if(event.action==='set_content' && ['label','button'].includes(control.type) && typeof event.content==='string') {
          appearance.contentOverride=event.content;
          if(event.contentRefs)appearance.contentRefs=event.contentRefs;else delete appearance.contentRefs;
          // Only presentation fields may be overridden; geometry and behavior stay on the control.
          for(const key of ['fontFamily','fontSize','bold','italic','textHorizontalAlignment','textVerticalAlignment','backColor','foreColor']) {
            if(Object.hasOwn(event.contentStyle || {},key))appearance[key]=event.contentStyle[key];
          }
        }
        if(event.action==='close_popup' && control.type==='page')appearance.closePopup=true;
        if(event.action==='show')appearance.visible=true;
        if(event.action==='hide')appearance.visible=false;
        if(event.action==='set_colors' && event.backColor && event.foreColor)Object.assign(appearance,{backColor:event.backColor,foreColor:event.foreColor});
        if(event.action==='set_colors' && control.type==='symbol' && typeof event.strokeWidth==='number' && Number.isFinite(event.strokeWidth) && event.strokeWidth>=0)appearance.strokeWidth=event.strokeWidth;
      } else if(old===false && current && event.target && ['toggle','set','increment','decrement'].includes(event.action)) {
        onAction({tag:event.target,action:event.action,value:event.amount ?? 1});
      }
    } catch {previous.delete(event.id);} // Incomplete/unavailable rules return to base appearance.
  }
  return appearance;
}
