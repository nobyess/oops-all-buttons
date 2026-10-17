import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../static/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function refreshEditorGrid()'),source.indexOf('function refreshEditedPage()'));
function gridState(grid,gridStyle){
 const classes=new Map(),styles=new Map();
 const canvas={style:{setProperty:(k,v)=>styles.set(k,v)},classList:{toggle:(k,v)=>classes.set(k,v)}};
 const update=new Function('app','grid','gridStyle',code+';return refreshEditorGrid;')({querySelector:()=>canvas},grid,gridStyle);
 update();return {classes,styles};
}
let state=gridState(10,'lines');assert.equal(state.classes.get('grid'),true);assert.equal(state.classes.get('grid-dots'),false);assert.equal(state.styles.get('--grid-size'),'10px');
state=gridState(5,'dots');assert.equal(state.classes.get('grid'),false);assert.equal(state.classes.get('grid-dots'),true);
for(const [size,style] of [[0,'lines'],[20,'hide']]){state=gridState(size,style);assert.ok([...state.classes.values()].every(value=>!value));}
console.log('Grid updates preserve the canvas while changing spacing and appearance');
