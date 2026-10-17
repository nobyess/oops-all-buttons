import assert from 'node:assert/strict';
import {instantiatePage} from '../static/page-parameters.js';
const template={id:'page',actions:[{id:'open',action:'set',tag:'parameter:p',requiredRoles:['role']}],controls:[{id:'button',actions:[{id:'click',action:'set',tag:'parameter:p',requiredRoles:['role']}]}]};
const instance=instantiatePage(template,{'parameter:p':'tag'});
assert.deepEqual(instance.actions[0]._access,{page:'page',control:'@page',action:'open',bindings:{'parameter:p':'tag'}});
assert.equal(instance.controls[0].actions[0]._access.control,'button');assert.equal(instance.controls[0].actions[0].tag,'tag');assert.equal(template.controls[0].actions[0]._access,undefined);assert.deepEqual(instance.actions[0].requiredRoles,['role']);
console.log('Runtime actions carry saved page/control/action identities, preserve role requirements, and isolate parameter bindings.');
