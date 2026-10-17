// Use the paste event's image payload: no clipboard polling or extra permission.
export function clipboardImage(event) {
 if(event.target?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'))return null;
 const items=[...(event.clipboardData?.items || [])];
 const item=items.find(item=>item.kind==='file' && item.type.startsWith('image/'));
 return item?.getAsFile() || [...(event.clipboardData?.files || [])].find(file=>file.type.startsWith('image/')) || null;
}
export function imageFileData(file) {
 if(file.size>5*1024*1024)return Promise.reject(new Error('Images must be 5 MB or smaller'));
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);
  reader.onerror=()=>reject(new Error('Could not read image'));reader.readAsDataURL(file);
 });
}
export function installClipboardImagePaste(target,{canPaste,onPaste,onError}) {
 target.addEventListener('paste',event=>{
  if(!canPaste())return;
  const file=clipboardImage(event);if(!file)return;
  event.preventDefault();
  Promise.resolve().then(()=>onPaste(file)).catch(onError);
 });
}
