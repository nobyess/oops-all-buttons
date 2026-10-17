export function clockText(date=new Date()){
 return date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})+' · '+date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
export function installClock(element){
 if(!element)return ()=>{};
 const update=()=>{const now=new Date();element.textContent=clockText(now);element.dateTime=now.toISOString();};
 update();const timer=setInterval(update,1000);return ()=>clearInterval(timer);
}
