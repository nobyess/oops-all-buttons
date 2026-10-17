import {paintOrder} from './layers.js';
import {randomId} from './uuid.js';
export const groupMembers=(page,id)=>(page.controls || []).filter(control=>control.groupId===id);
export function groupBounds(page,id){
 const members=groupMembers(page,id);if(!members.length)return null;
 const left=Math.min(...members.map(c=>c.left)),top=Math.min(...members.map(c=>c.top));
 return {left,top,width:Math.max(...members.map(c=>c.left+c.width))-left,height:Math.max(...members.map(c=>c.top+c.height))-top};
}
export function createGroup(page,ids,makeId=randomId,{name,minMembers=2}={}){
 const members=page.controls.filter(c=>ids.includes(c.id));if(members.length<minMembers)return null;
 const group={id:'group_'+makeId(),type:'group',name:name?.trim() || 'Group '+((page.groups || []).length+1),visible:true,events:[]};
 (page.groups ??= []).push(group);for(const member of members)member.groupId=group.id;page.controls=paintOrder(page);return group;
}
export function ungroup(page,id){page.controls=paintOrder(page);page.groups=(page.groups || []).filter(g=>g.id!==id);for(const member of groupMembers(page,id))delete member.groupId;}
export function groupDelta(bounds,dx,dy,page,grid){
 const snap=value=>grid?Math.round(value/grid)*grid:value;
 const clamp=(delta,origin,size,limit)=>size<=limit?Math.max(-origin,Math.min(limit-origin-size,delta)):delta;
 return {x:clamp(snap(dx),bounds.left,bounds.width,page.width),y:clamp(snap(dy),bounds.top,bounds.height,page.height)};
}
export function copyGroup(page,id){return {kind:'group',group:structuredClone(page.groups.find(g=>g.id===id)),controls:structuredClone(groupMembers(page,id)),parameters:structuredClone(page.parameters || [])};}
export function pasteGroup(page,payload,point,grid,makeId=randomId){
 const group=structuredClone(payload.group);group.id='group_'+makeId();
 for(const event of group.events || [])event.id=makeId();
 const members=structuredClone(payload.controls);
 const parameterMap=new Map();
 function remap(id){
  const source=(payload.parameters || []).find(parameter=>parameter.id===id);if(!source)return id;
  if(!parameterMap.has(id)){
   const parameters=page.parameters ??= [];
   let target=parameters.find(parameter=>parameter.name.toLowerCase()===source.name.toLowerCase());
   if(!target){target={...source,id:'parameter:'+makeId()};parameters.push(target);}
   parameterMap.set(id,target.id);
  }
  return parameterMap.get(id);
 }
 // Carry only parameters actually used by the group or its members.
 for(const owner of [group,...members]){
  if(owner.binding?.tag)owner.binding.tag=remap(owner.binding.tag);
  for(const rule of [...owner.actions || [],...owner.events || []]){
   for(const key of ['tag','target'])if(rule[key])rule[key]=remap(rule[key]);
   for(const key of ['operand','end_operand'])if(rule[key]?.kind==='tag')rule[key].tag=remap(rule[key].tag);
   for(const key of Object.keys(rule.parameters || {}))rule.parameters[key]=remap(rule.parameters[key]);
  }
  for(const [textOwner,field,refsKey] of [[owner,'text','textRefs'],...(owner.events || []).filter(event=>event.action==='set_content').map(event=>[event,'content','contentRefs'])]){
   for(const key of Object.keys(textOwner[refsKey] || {}))textOwner[refsKey][key]=remap(textOwner[refsKey][key]);
   for(const match of String(textOwner[field] || '').matchAll(/@\{Parameters\\([^{}\r\n]+)\}/g)){
    const parameter=(payload.parameters || []).find(parameter=>parameter.name.toLowerCase()===match[1].toLowerCase());
    if(parameter)(textOwner[refsKey] ??= {})[match[0].slice(2,-1)]=remap(parameter.id);
   }
  }
 }
 const bounds=groupBounds({controls:members},payload.group.id);
 const delta=bounds?groupDelta(bounds,point.x-bounds.left,point.y-bounds.top,page,grid):{x:0,y:0};
 for(const control of members){control.id=control.type+'_'+makeId();control.name=control.id;control.groupId=group.id;control.left+=delta.x;control.top+=delta.y;for(const kind of ['actions','events'])for(const rule of control[kind] || [])rule.id=makeId();}
 (page.groups ??= []).push(group);page.controls.push(...members);return group;
}
export function memberVisible(control,owner,states){
 const group=(owner.groups || []).find(g=>g.id===control.groupId);
 return !group || (states?.[group.id]?.visible ?? group.visible)!==false;
}
