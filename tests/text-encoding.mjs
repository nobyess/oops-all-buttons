import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
const root=new URL('../static/',import.meta.url);
for(const name of readdirSync(root)){
 if(!/\.(js|html|css)$/.test(name))continue;
 const text=new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(new URL(name,root)));
 assert(!/[\u00c2\u00c3\u00e2][\u0080-\u00bf\u2000-\u2122]/u.test(text),`Corrupted UTF-8 text in ${name}`);
}
const app=readFileSync(new URL('app.js',root),'utf8');
assert(app.includes('${p.width} \u00d7 ${p.height} \u00b7 ${p.controls.length} controls'));
console.log('Static files are valid UTF-8 and page dimension separators are intact.');
