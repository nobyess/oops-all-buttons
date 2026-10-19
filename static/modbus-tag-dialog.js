export const modbusAreas=[['holding','Holding registers (read/write)'],['input','Input registers (read only)'],['coil','Coils (read/write)'],['discrete','Discrete inputs (read only)']];
export const modbusTypes=['uint16','int16','uint32','int32','float32','float64'];
export function modbusAddress(area,offset,type,byte,word){
 const bits=['coil','discrete'].includes(area);
 if(!modbusAreas.some(item=>item[0]===area) || (!bits && !modbusTypes.includes(type)) || !['big','little'].includes(byte) || !['big','little'].includes(word))throw Error('Choose a valid Modbus area, data type, and byte/word order.');
 const n=Number(offset),count=bits?1:type==='float64'?4:['uint32','int32','float32'].includes(type)?2:1;
 if(String(offset).trim()==='' || !Number.isInteger(n) || n<0 || n+count>65536)throw Error('Enter a zero-based offset from 0 to 65535 that fits the value.');
 return `${area}:${n}:${bits?'bool':type}:${bits?'big':byte}:${bits?'big':word}`;
}
export function modbusTagDialog({source,tag,dialog,node,field,select,button,api,reload,onDone}){
 dialog(tag?'Edit Modbus tag':'Add Modbus tag - '+(source.name || source.id),(body)=>{
  body.closest('dialog').classList.add('source-dialog');
  const name=field('Tag name',body,'text',tag?.name || '');name.required=true;
  const parts=(tag?.address || 'holding:0:uint16:big:big').split(':');
  const area=select('Area',body,modbusAreas,parts[0]);
  const offset=field('Address offset (zero-based)',body,'number',parts[1]);offset.min=0;offset.max=65535;offset.step=1;offset.required=true;
  node('p','Use the device register map. The first address is offset 0: holding register 40001 → 0, input register 30001 → 0, coil 00001 → 0, discrete input 10001 → 0. Enter offsets, not these reference numbers.',body,{className:'hint'});
  const format=node('div',null,body,{className:'source-rates'});
  const type=select('Data type',format,modbusTypes.map(value=>[value,value.toUpperCase()]),modbusTypes.includes(parts[2])?parts[2]:'uint16');
  const byte=select('Byte order within a register',format,[['big','Big endian (AB)'],['little','Little endian (BA)']],parts[3]);
  const word=select('Word order across registers',format,[['big','High word first (ABCD)'],['little','Low word first (CDAB)']],parts[4]);
  const update=()=>{
   const bits=['coil','discrete'].includes(area.value);format.hidden=bits;
   word.parentElement.hidden=bits || ['uint16','int16'].includes(type.value);
  };area.onchange=update;type.onchange=update;update();
  const address=()=>modbusAddress(area.value,offset.value,type.value,byte.value,word.value);
  const preview=node('p','Current value: —',body,{className:'hint'});
  const read=button('Read Value',body,async()=>{
   read.disabled=true;preview.textContent='Reading…';
   try{const result=await api('modbus/read',{source:source.id,address:address()});preview.textContent='Current value: '+String(result.value);}
   catch(error){preview.textContent=error.message;}
   finally{read.disabled=false;}
  });
  return async()=>{
   await api(tag?'tags/edit':'tags',{...(tag?{id:tag.id}:{}),name:name.value,source:source.id,address:address()});
   await reload();onDone();
  };
 });
}
