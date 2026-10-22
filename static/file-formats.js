// Application documents keep their existing JSON content with distinct extensions.
export const importAccept=kind=>kind==='pages'?'.oab-page,.json':'.oab-sheet,.json';
export const pageFilename=name=>String(name).replace(/[<>:"/\\|?*]/g,'_').replace(/(?:\.page\.json|\.oab-page)$/i,'')+'.oab-page';
export const sheetFilename=(name,copy=false)=>String(name).replace(/(?:\.oab-sheet|(?:\.sheet)?\.json)$/i,'')+(copy?'-copy':'')+'.oab-sheet';
