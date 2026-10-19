import assert from 'node:assert/strict';
import {filterSymbols,libraryAssetURL,mountSymbolContent} from '../static/symbol-content.js';
const symbols=[{id:'b',name:'Valve',category:'Valves',file:'assets/b.svg'},{id:'a',name:'Pump',category:'Pumps',file:'assets/a.svg'}];
assert.equal(libraryAssetURL('assets/a.svg'),'/symbols/assets/a.svg');
for(const file of ['../x.svg','assets/../x.svg','https://bad/x.svg','assets/a.svg?x','assets/a.png'])assert.throws(()=>libraryAssetURL(file));
assert.deepEqual(filterSymbols(symbols,'PUMP'),[symbols[1]]);
assert.deepEqual(filterSymbols(symbols,'','Valves'),[symbols[0]]);
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.isConnected=true;this.classList={toggle(){}};this.attrs={};}
 append(el){this.children.push(el);}
 replaceChildren(...children){this.children=children;}
 setAttribute(k,v){this.attrs[k]=v;}
 querySelectorAll(tag){return this.children.flatMap(el=>[...(el.tag===tag?[el]:[]),...el.querySelectorAll(tag)]);}
 focus(){document.activeElement=this;}
 click(){this.onclick?.();}
}
globalThis.document={createElement:tag=>new Element(tag)};
let requests=[];
globalThis.fetch=async url=>{requests.push(url);return {ok:true,json:async()=>({version:1,symbols}),blob:async()=>new Blob(['<svg/>'])};};
globalThis.FileReader=class{readAsDataURL(){this.result='data:image/svg+xml;base64,PHN2Zy8+';this.onload();}};
const root=new Element('section'),control={image:'/api/images/existing',imageName:'Existing'};
let imported,cleared=false,rotated=false;
const safe=async fn=>await fn();
mountSymbolContent(root,{control,importSymbol:async(...args)=>imported=args,clear:()=>cleared=true,rotate:()=>rotated=true,safe});
await new Promise(resolve=>setTimeout(resolve,0));
const picker=root.children[0],tabs=picker.children[0],library=picker.children[1],files=picker.children[2];
assert.equal(library.hidden,false);assert.equal(files.hidden,true);
tabs.children[1].click();assert.equal(library.hidden,true);assert.equal(files.hidden,false);
tabs.children[0].click();
assert.deepEqual(requests,['/symbols/index.json']);
const viewport=library.children[2];
assert.equal(viewport.querySelectorAll('button').length,2);
assert.equal(library.children[3].hidden,true,'Hide routine count/status when symbols are available');
assert(!picker.querySelectorAll('button').some(b=>b.textContent==='Reload Library'));
assert(!picker.children.some(el=>el.textContent==='Existing'));
await viewport.querySelectorAll('button')[0].onclick();
assert.equal(imported[0],'Pump.svg');assert.equal(imported[1],'PHN2Zy8+');
library.children[0].value='Valve';library.children[0].oninput();
assert.equal(viewport.querySelectorAll('button').length,1);
picker.children.find(b=>b.textContent==='Clear image').click();assert(cleared);
picker.children.find(b=>b.textContent==='Rotate 90°').click();assert(rotated);
const upload=files.children[0].children[0];upload.files=[new File(['<svg/>'],'Custom.svg')];await upload.onchange();assert.equal(imported[0],'Custom.svg');assert.equal(upload.disabled,false);
console.log('Symbol Content tabs, filtering, safe library paths, library import, file import, and clear passed.');
