import assert from 'node:assert/strict';
import {installLauncher} from '../static/launcher.js';
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.attributes={};}
 append(...children){this.children.push(...children);}
 setAttribute(key,value){this.attributes[key]=value;}
 showModal(){this.open=true;}close(){this.open=false;this.onclose?.();}remove(){}focus(){}
}
globalThis.document={body:new Element('body'),createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
globalThis.window={location:{hash:''}};
const button=new Element('button');installLauncher(button,{canManage:()=>true});button.onclick();
let popup=document.body.children.at(-1),links=popup.children.find(el=>el.tagName==='nav').children;
const assets=links.find(link=>link.href==='#assets');assert(assets);assert.equal(assets.children[1].textContent,'Assets');assert.equal(assets.children[0].tagName,'svg');
assets.onclick({preventDefault(){}});assert.equal(window.location.hash,'#assets');assert.equal(button.attributes['aria-expanded'],'false');
installLauncher(button,{canManage:()=>false});button.onclick();popup=document.body.children.at(-1);links=popup.children.find(el=>el.tagName==='nav').children;
assert(!links.some(link=>link.href==='#assets'),'Asset management remains restricted to administrators');
console.log('Assets launcher destination, icon, navigation and permissions passed');
