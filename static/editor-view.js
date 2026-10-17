// View state stays separate from saved page geometry.
export const viewStates = new Map();
export const pagePoint = (x, y, rect, zoom) => ({x: (x - rect.left) / zoom, y: (y - rect.top) / zoom});
export const zoomLevels=[0.25,0.5,0.75,1,1.25,1.5,2,2.5,3];
export function editorView(surface, canvas, page, onZoom=()=>{}) {
  const state = viewStates.get(page.id) || {zoom: 1, left: 0, top: 0};
  viewStates.set(page.id, state);
  const stage = document.createElement('div');
  stage.className = 'editor-stage';
  canvas.before(stage);
  stage.append(canvas);
  const apply = () => {
    stage.style.width = page.width * state.zoom + 'px';
    stage.style.height = page.height * state.zoom + 'px';
    canvas.style.transformOrigin = '0 0';
    canvas.style.transform = `scale(${state.zoom})`;
    canvas.style.setProperty('--grid-stroke',(2/state.zoom)+'px');
  };
  apply();
  surface.scrollLeft = state.left;
  surface.scrollTop = state.top;
  surface.addEventListener('scroll', () => {state.left = surface.scrollLeft; state.top = surface.scrollTop;});
  surface.addEventListener('pointerdown', event => {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    surface.setPointerCapture(event.pointerId);
    const x = event.clientX, y = event.clientY, left = surface.scrollLeft, top = surface.scrollTop;
    surface.classList.add('panning');
    const move = e => {surface.scrollLeft = left - (e.clientX - x); surface.scrollTop = top - (e.clientY - y);};
    const end = () => {
      surface.classList.remove('panning');
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerup', end);
      surface.removeEventListener('pointercancel', end);
    };
    surface.addEventListener('pointermove', move);
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
  }, true);
  function setZoom(zoom,anchor) {
    zoom=Math.max(zoomLevels[0],Math.min(zoomLevels.at(-1),zoom));
    if(!Number.isFinite(zoom) || zoom===state.zoom)return;
    const surfaceRect=surface.getBoundingClientRect();
    anchor ||= {x:surfaceRect.left+surface.clientWidth/2,y:surfaceRect.top+surface.clientHeight/2};
    const point=pagePoint(anchor.x,anchor.y,canvas.getBoundingClientRect(),state.zoom);
    state.zoom=zoom;apply();
    const rect=canvas.getBoundingClientRect();
    surface.scrollLeft+=rect.left+point.x*zoom-anchor.x;
    surface.scrollTop+=rect.top+point.y*zoom-anchor.y;
    state.left=surface.scrollLeft;state.top=surface.scrollTop;
    onZoom(zoom);
  }
  surface.addEventListener('wheel',event=>{
    if(!event.deltaY)return;
    event.preventDefault();
    const zoom=event.deltaY<0?zoomLevels.find(level=>level>state.zoom):[...zoomLevels].reverse().find(level=>level<state.zoom);
    if(zoom!==undefined)setZoom(zoom,{x:event.clientX,y:event.clientY});
  },{passive:false});
  return {state,updateSize:apply,setZoom};
}
