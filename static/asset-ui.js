import {imageFileData} from './clipboard-image.js';
import {trimSymbolData} from './symbol-import.js';
import {buildSymbol,styleSymbol} from './symbol.js';
import {loadSymbolPreview} from './symbol-preview.js';
import {buttonIcon} from './button-icons.js';
export const assetKinds={image:'Images',movie:'Movies',symbol:'Symbols',text:'Text'};
export const assetAccept={image:'.svg,.png,.jpg,.jpeg,.gif,.webp,.bmp',symbol:'.svg,.dxf',movie:'.mp4,.m4v,.webm',text:'.txt,.md,.csv,.json'};
export function assetNode(tag,text,parent,attrs={}){const el=document.createElement(tag);if(text!==null)el.textContent=text;Object.assign(el,attrs);parent?.append(el);return el;}
export function filterAssets(items,query='',category='',kind=''){query=query.trim().toLocaleLowerCase();return items.filter(item=>(!kind||item.kind===kind)&&(!category||item.category===category)&&`${item.name} ${item.filename} ${item.category}`.toLocaleLowerCase().includes(query));}
export function assetSize(size){return size>=1048576?(size/1048576).toFixed(1)+' MiB':Math.max(1,Math.round(size/1024))+' KiB';}
export async function saveAssetFile(api,file,kind,{id,name,category='General'}={}){
 const limit=(kind==='movie'?25:5)*1048576;
 if(!file.size||file.size>limit)throw Error(`Choose a nonempty file up to ${limit/1048576} MiB.`);
 let data=await imageFileData(file);
 if(kind==='symbol'){const prepared=await api('images',{name:file.name,data,symbol:true,prepare_only:true});data=await trimSymbolData(prepared.symbol);}
 return api('assets/save',{...(id?{id}:{}),kind,name:name||file.name.replace(/\.[^.]+$/,''),category,filename:file.name,data});
}
const symbolTrees=new Map();
export function assetPreview(host,item,{thumbnail=false}={}){
 host.replaceChildren();const abort=new AbortController();let video,alive=true;
 const valid=()=>alive&&host.isConnected;
 if(!item)return ()=>{};
 if(item.kind==='icon'){const icon=buttonIcon(item.id);if(icon)host.append(icon);}
 else if(item.kind==='image')assetNode('img',null,host,{src:item.url,alt:item.name,loading:'lazy',draggable:false});
 else if(item.kind==='symbol'){
  const promise=item.builtin?loadSymbolPreview(item.url):(()=>{
   if(!symbolTrees.has(item.url))symbolTrees.set(item.url,fetch(item.url.replace('/images/','/symbols/')).then(async response=>{if(!response.ok)throw Error('Symbol unavailable');return response.json();}).catch(error=>{symbolTrees.delete(item.url);throw error;}));
   return symbolTrees.get(item.url).then(tree=>{const svg=buildSymbol(tree);styleSymbol(svg,{foreColor:'var(--ui-text)',backColor:'var(--ui-panel)',strokeWidth:2});return svg;});
  })();
  promise.then(svg=>{if(valid())host.replaceChildren(svg);}).catch(()=>{if(valid())host.textContent='Preview unavailable';});
 }else if(item.kind==='movie'){
  if(thumbnail)assetNode('span','▶',host,{className:'asset-file-icon'});
  else video=assetNode('video',null,host,{src:item.url,controls:true,preload:'metadata'});
 }else if(thumbnail)assetNode('span','TXT',host,{className:'asset-file-icon'});
 else{const pre=assetNode('pre','Loading text…',host);fetch(item.url,{signal:abort.signal}).then(async response=>{if(!response.ok)throw Error('Text unavailable');return response.text();}).then(text=>{if(valid())pre.textContent=text.length>4000?text.slice(0,4000)+'\n…':text;}).catch(error=>{if(valid())pre.textContent=error.message;});}
 return ()=>{alive=false;abort.abort();if(video){video.pause();video.removeAttribute('src');video.load();}};
}
