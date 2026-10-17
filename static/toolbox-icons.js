const paths={
 play:'M8 4l12 8-12 8z',save:'M4 3h13l3 3v15H4z M8 3v6h8V3 M8 21v-8h8v8',undo:'M9 5L4 10l5 5 M4 10h9a6 6 0 0 1 6 6v3',redo:'M15 5l5 5-5 5 M20 10h-9a6 6 0 0 0-6 6v3',
 label:'M5 5h14 M12 5v14 M8 19h8',
 button:'M4 7h16v10H4z M8 12h8',
 numeric:'M5 6v12 M3 8l2-2 M9 6h5v6H9v6h5 M17 6h4v12h-4 M17 12h4',
 listbox:'M3 3h18v18H3z M7 7h2 M11 7h6 M7 12h2 M11 12h6 M7 17h2 M11 17h6',
 level:'M6 3h12v18H6z M6 12h12 M9 15v3 M12 15v3 M15 15v3',
 symbol:'M12 3l3 6 6 3-6 3-3 6-3-6-6-3 6-3z',
 image:'M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M15 7h2v2h-2z',
 square:'M4 4h16v16H4z',circle:'M21 12a9 7 0 1 1-18 0 9 7 0 1 1 18 0',
 polyline:'M4 18l5-12 6 10 5-10 M3 17h2v2H3z M8 5h2v2H8z M14 15h2v2h-2z M19 5h2v2h-2z'
};
export function toolboxIcon(type){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d',paths[type] || paths.numeric);svg.append(path);return svg;
}
