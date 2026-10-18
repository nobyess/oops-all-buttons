// Track same-document entries so cancelling Back/Forward does not rewrite them.
export function navigationHistory(win){
 const key='hmiEntry';let accepted=Number(win.history.state?.[key] ?? 0),hash=win.location.hash,restoring=false;
 const stamp=index=>win.history.replaceState({...win.history.state,[key]:index},'',win.location.href);
 stamp(accepted);
 function index(){let value=win.history.state?.[key];if(!Number.isInteger(value) || (value===accepted && win.location.hash!==hash)){value=accepted+1;stamp(value);}return value;}
 return {
  accept(){accepted=index();hash=win.location.hash;},
  cancel(){const delta=accepted-index();if(delta){restoring=true;win.history.go(delta);}else win.history.replaceState({...win.history.state,[key]:accepted},'',hash || '#');},
  changed(){if(restoring && win.history.state?.[key]===accepted){restoring=false;return false;}return win.location.hash!==hash;}
 };
}
