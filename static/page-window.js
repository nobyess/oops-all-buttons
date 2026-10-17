// Non-modal runtime page windows. Positions are clamped to the visible viewport.
const windows = new Set();

export function clampPosition(point, size, viewport) {
  return {x: Math.max(0, Math.min(viewport.width - size.width, point.x)),
          y: Math.max(0, Math.min(viewport.height - size.height, point.y))};
}

export function closePageWindows() {
  for (const close of [...windows]) close();
}

export function openPageWindow({page, position = 'centered', point, render}) {
  const previousFocus = document.activeElement;
  const frame = document.createElement('section');
  frame.className = 'page-window';
  frame.setAttribute('role', 'dialog');
  frame.setAttribute('aria-label', page.name);
  frame.tabIndex = -1;
  const caption = document.createElement('div');
  caption.className = 'page-window-caption';
  const title = document.createElement('strong'); title.textContent = page.name;
  const closeButton = document.createElement('button');
  closeButton.type = 'button'; closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Close ' + page.name);
  caption.append(title, closeButton); frame.append(caption);
  const body = document.createElement('div'); body.className = 'runtime page-window-body';
  frame.append(body); document.body.append(frame);
  render(body, page);
  let located = false;
  function resize() {
    frame.style.width = Math.min(page.width + 2, window.innerWidth - 16) + 'px';
    frame.style.height = Math.min(page.height + 42, window.innerHeight - 16) + 'px';
    const rect = frame.getBoundingClientRect();
    const center = position === 'mouse' && point ? point : {x: window.innerWidth / 2, y: window.innerHeight / 2};
    const desired = located ? {x: rect.left, y: rect.top} : {x: center.x - rect.width / 2, y: center.y - rect.height / 2};
    move(desired); located = true;
  }
  function move(point) {
    const rect = frame.getBoundingClientRect();
    const next = clampPosition(point, rect, {width: window.innerWidth, height: window.innerHeight});
    frame.style.left = next.x + 'px'; frame.style.top = next.y + 'px';
  }
  caption.onpointerdown = event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    event.preventDefault(); caption.setPointerCapture(event.pointerId);
    const rect = frame.getBoundingClientRect(), x = event.clientX, y = event.clientY;
    caption.onpointermove = e => move({x: rect.left + e.clientX - x, y: rect.top + e.clientY - y});
    caption.onpointerup = caption.onpointercancel = () => {caption.onpointermove = null;};
  };
  let closed=false;
  function close() {
    if(closed)return;closed=true;
    window.removeEventListener('resize', resize); windows.delete(close); frame.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  }
  closeButton.onclick = close;
  frame.onkeydown = event => {if (event.key === 'Escape') {event.stopPropagation(); close();}};
  windows.add(close); window.addEventListener('resize', resize); resize(); frame.focus();
  return close;
}
