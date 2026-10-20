import assert from 'node:assert/strict';
import {controls} from '../static/controls.js';
import {buttonIcons,buttonIcon} from '../static/button-icons.js';
class Element{
 constructor(){this.children=[];this.dataset={};this.style={};this.attributes={};}
 append(child){this.children.push(child);}
 replaceChildren(){this.children=[];}
 setAttribute(key,value){this.attributes[key]=value;}
 querySelector(selector){return this.children.find(c=>selector==='button'||'.'+c.className===selector);}
}
globalThis.document={createElement:()=>new Element(),createElementNS:()=>new Element()};
assert.equal(new Set(buttonIcons.map(i=>i.id)).size,buttonIcons.length);
assert(buttonIcons.length>=150);assert(new Set(buttonIcons.map(i=>i.category)).size>=14);
assert.equal(buttonIcon('missing'),null);
const host=new Element(),c={text:'Start',buttonDisplay:'both',icon:'play',iconSize:32};
controls.button.render(host,c,{editing:false});const button=host.children[0],text=button.querySelector('.button-text'),icon=button.querySelector('.button-icon'),svg=icon.children[0];
assert.equal(icon.hidden,false);assert.equal(text.hidden,false);assert.equal(icon.style.width,'32px');
controls.button.update(host,{...c,text:'Running',iconPosition:'above'},{editing:false});
assert.equal(host.children[0],button);assert.equal(icon.children[0],svg);assert.equal(text.textContent,'Running');assert.equal(button.dataset.iconPosition,'above');
controls.button.update(host,{...c,buttonDisplay:'icon',iconSize:999},{editing:false});assert.equal(text.hidden,true);assert.equal(icon.style.width,'128px');assert.equal(button.attributes['aria-label'],'Start');
controls.button.update(host,{...c,icon:''},{editing:false});assert.equal(icon.hidden,true);assert.equal(icon.children.length,0);
controls.button.update(host,{...c,icon:'invalid'},{editing:false});assert.equal(icon.hidden,true);
controls.button.update(host,{text:'Old button'},{editing:true});assert.equal(text.hidden,false);assert.equal(icon.hidden,true);assert.equal(button.disabled,true);
controls.button.update(host,{...c,contentOverride:'<script>literal</script>'},{editing:false});assert.equal(text.textContent,'<script>literal</script>');
controls.button.update(host,{...c,buttonArtworkKind:'image',image:'/api/images/test',imageName:'Photo'},{editing:false});const image=icon.children[0];assert.equal(image.src,'/api/images/test');
controls.button.update(host,{...c,buttonArtworkKind:'image',image:'/api/images/test'},{editing:false});assert.equal(icon.children[0],image);
controls.button.update(host,c,{editing:false});assert.equal(icon.children[0].attributes.viewBox,'0 0 24 24');assert.equal(host.children[0],button);
const coloredSvg=icon.children[0];controls.button.update(host,{...c,foreColor:'#123456',iconColor:'#ff000080'},{editing:false});assert.equal(icon.style.color,'#ff0000');assert.equal(icon.children[0],coloredSvg);assert.equal(text.textContent,'Start');
controls.button.update(host,c,{editing:false});assert.equal(icon.style.color,'inherit');
console.log('Button icons retain live DOM, preserve legacy text buttons, clamp size, and expose accessible labels.');
