// Small bundled outline set: no external fonts, requests, or timers.
import {extraButtonIcons} from './extra-button-icons.js';
export const buttonIcons=[
 ['play','Play','Media','M8 4l12 8-12 8z'],
 ['pause','Pause','Media','M7 4v16 M17 4v16'],
 ['stop','Stop','Media','M5 5h14v14H5z'],
 ['volume','Volume','Media','M3 9h4l5-5v16l-5-5H3z M16 8q6 4 0 8 M19 4q9 8 0 16'],
 ['home','Home','Navigation','M3 11l9-8 9 8 M5 10v11h5v-7h4v7h5V10'],
 ['back','Back','Navigation','M11 5l-7 7 7 7 M4 12h17'],
 ['forward','Forward','Navigation','M13 5l7 7-7 7 M4 12h16'],
 ['up','Up','Navigation','M5 11l7-7 7 7 M12 4v17'],
 ['down','Down','Navigation','M5 13l7 7 7-7 M12 3v17'],
 ['power','Power','Equipment','M12 3v9 M6 5a9 9 0 1 0 12 0'],
 ['alarm','Alarm','Equipment','M5 17h14l-2-4V9a5 5 0 0 0-10 0v4z M10 21h4'],
 ['settings','Settings','Equipment','M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0'],
 ['check','Check','Actions','M4 12l5 5L20 6'],
 ['close','Close','Actions','M5 5l14 14 M19 5L5 19'],
 ['plus','Plus','Actions','M12 4v16 M4 12h16'],
 ['minus','Minus','Actions','M4 12h16'],
 ['refresh','Refresh','Actions','M20 8a9 9 0 1 0 1 7 M20 3v6h-6'],
 ['save','Save','Actions','M4 3h13l3 3v15H4z M8 3v6h8V3 M8 21v-8h8v8']
].map(([id,name,category,path])=>({id,name,category,path})).concat(extraButtonIcons);
export function buttonIcon(id){
 const icon=buttonIcons.find(item=>item.id===id);if(!icon)return null;
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
 for(const [key,value]of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.8,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(key,String(value));
 path.setAttribute('d',icon.path);svg.append(path);return svg;
}
