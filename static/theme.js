let preference='system';
const media=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: dark)'):null;
export function resolvedTheme(choice,dark){return choice==='dark' || choice==='system' && dark?'dark':'light';}
export function applyTheme(choice='system'){
 preference=['light','dark','system'].includes(choice)?choice:'system';
 document.documentElement.dataset.theme=resolvedTheme(preference,Boolean(media?.matches));
}
media?.addEventListener('change',()=>{if(preference==='system')applyTheme(preference);});

if(typeof document!=='undefined' && document.documentElement)applyTheme();
