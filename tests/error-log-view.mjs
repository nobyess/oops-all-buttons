import assert from 'node:assert/strict';
import {updateErrorLog} from '../static/error-log-view.js';
let writes=0,creates=0,moves=0;
class Element{
 constructor(){this.children=[];this.scrollTop=0;this.text='';}
 set textContent(value){writes++;this.text=value;}
 get textContent(){return this.text;}
 insertBefore(child,before){moves++;child.remove();const index=before?this.children.indexOf(before):this.children.length;this.children.splice(index,0,child);child.parent=this;}
 remove(){if(this.parent){const index=this.parent.children.indexOf(this);this.parent.children.splice(index,1);this.parent=null;}}
}
function node(tag,text,parent){creates++;const el=new Element();if(text!==null)el.textContent=text;parent.insertBefore(el,null);return el;}
const parent=new Element(),entry={origin:'Polling: PLC',message:'No reply',count:1,first:100,last:100};
updateErrorLog(parent,[entry],node);
const row=parent.children[0],details=row.children[2];parent.scrollTop=52;
const baseline=[writes,creates,moves];
updateErrorLog(parent,[{...entry}],node);
assert.deepEqual([writes,creates,moves],baseline);assert.equal(parent.scrollTop,52);
updateErrorLog(parent,[{...entry,count:2,last:101}],node);
assert.equal(parent.children[0],row);assert.equal(row.children[2],details);assert.equal(creates,baseline[1]);assert.match(details.textContent,/Count: 2/);
const newer={...entry,origin:'HTTP 404 GET /missing'};
updateErrorLog(parent,[newer,entry],node);assert.equal(parent.children[1],row);assert.equal(parent.scrollTop,52);
updateErrorLog(parent,[entry],node);assert.equal(parent.children.length,1);assert.equal(parent.children[0],row);
updateErrorLog(parent,[],node);assert.equal(parent.children.length,1);assert.equal(parent.children[0].textContent,'No errors recorded.');
const empty=parent.children[0];updateErrorLog(parent,[],node);assert.equal(parent.children[0],empty);
updateErrorLog(parent,[entry],node);assert.equal(parent.children.length,1);assert.notEqual(parent.children[0],empty);
console.log('Error log keeps stable rows, updates counts in place, preserves scrolling, and handles additions/removals.');
