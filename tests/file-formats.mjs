import assert from 'node:assert/strict';
import {importAccept,pageFilename,sheetFilename} from '../static/file-formats.js';
assert.equal(pageFilename('My Page'),'My Page.oab-page');
assert.equal(pageFilename('My/Page.page.json'),'My_Page.oab-page');
assert.equal(pageFilename('Page.OAB-PAGE'),'Page.oab-page');
for(const name of ['Sheet.sheet.json','Sheet.json','Sheet.oab-sheet','Sheet.OAB-SHEET','Sheet']){
 assert.equal(sheetFilename(name),'Sheet.oab-sheet');assert.equal(sheetFilename(name,true),'Sheet-copy.oab-sheet');
}
assert.equal(importAccept('pages'),'.oab-page,.json');assert.equal(importAccept('sheets'),'.oab-sheet,.json');
console.log('OAB document extensions, legacy export names and import filters passed.');
