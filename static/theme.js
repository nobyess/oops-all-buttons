let preference='system',appBackground='';
const media=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: dark)'):null;
export function resolvedTheme(choice,dark){return choice==='dark' || choice==='system' && dark?'dark':'light';}
export function applyTheme(choice='system',background=''){
 appBackground=/^#[0-9a-f]{6}$/i.test(background)?background:'';
 if(document.documentElement.style){if(appBackground)document.documentElement.style.setProperty('--app-background',appBackground);else document.documentElement.style.removeProperty('--app-background');}
 preference=['light','dark','system'].includes(choice)?choice:'system';
 document.documentElement.dataset.theme=resolvedTheme(preference,Boolean(media?.matches));
}
media?.addEventListener('change',()=>{if(preference==='system')applyTheme(preference,appBackground);});

if(typeof document!=='undefined' && document.documentElement)applyTheme();
