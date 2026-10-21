// Track same-document entries so cancelling Back/Forward does not rewrite them.
export function navigationHistory(win){
 const key='hmiEntry',floorKey='hmiBackFloor';let accepted=Number(win.history.state?.[key] ?? 0),floor=Number(win.history.state?.[floorKey] ?? 0),hash=win.location.hash,restoring=false;
 const stamp=index=>win.history.replaceState({...win.history.state,[key]:index,[floorKey]:floor},'',win.location.href);
 stamp(accepted);
 function index(){let value=win.history.state?.[key];if(!Number.isInteger(value) || (value===accepted && win.location.hash!==hash)){value=accepted+1;stamp(value);}return value;}
 return {
  accept(){accepted=index();floor=Math.min(floor,accepted);hash=win.location.hash;stamp(accepted);},
  reset(){const current=win.history.state?.[key];if(Number.isInteger(current))accepted=current;floor=accepted;hash=win.location.hash;restoring=false;stamp(accepted);},
  canBack(){return accepted>floor;},
  back(){if(accepted>floor)win.history.go(-1);},
  cancel(){const delta=accepted-index();if(delta){restoring=true;win.history.go(delta);}else win.history.replaceState({...win.history.state,[key]:accepted},'',hash || '#');},
  changed(){if(restoring && win.history.state?.[key]===accepted){restoring=false;return false;}return win.location.hash!==hash;}
 };
}
