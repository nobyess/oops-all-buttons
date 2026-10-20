export function closeIcon(){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
 for(const [key,value]of Object.entries({viewBox:'0 0 16 16',width:16,height:16,'aria-hidden':'true'}))svg.setAttribute(key,String(value));
 for(const [key,value]of Object.entries({d:'M4 4L12 12M12 4L4 12',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round'}))path.setAttribute(key,String(value));
 svg.append(path);return svg;
}
