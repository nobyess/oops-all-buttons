// An explicit saved choice wins; a new or missing choice starts at the top.
export function firstSelection(options,value){
 return options.some(([key])=>String(key)===String(value))?String(value):options.length?String(options[0][0]):'';
}
export function newRule({id,isEvent,isPage,isListbox,actions,visualActions}){
 return isEvent
  ? {id,tag:'',operator:'=',operand:{kind:'value',value:0},end_operand:{kind:'value',value:100},action:Object.keys(visualActions)[0],backColor:'#ffffff',foreColor:'#243247'}
  : {id,tag:'',trigger:isPage?'page_open':isListbox?'user_changed':'mouse_down',action:Object.keys(actions)[0],value:1};
}
