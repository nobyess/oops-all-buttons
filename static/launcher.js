// Add destinations here to extend the application launcher.
const destinations = [
  {label: 'Data Sources & Tags', hash: '#sources', icon: 'M4 4h16v5H4z M4 15h16v5H4z M8 9v6 M16 9v6'},
  {label: 'Sheets', hash: '#sheets', icon: 'M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18'},
  {label: 'Pages', hash: '#pages', icon: 'M7 3h14v14 M3 7h14v14H3z'},
  {label:'Administration',hash:'#administration',icon:'M9 2h6v3l2 1 2-1 3 5-2 2v2l2 2-3 5-2-1-2 1v3H9v-3l-2-1-2 1-3-5 2-2v-2l-2-2 3-5 2 1 2-1z M16 13a4 4 0 1 0-8 0 4 4 0 0 0 8 0'},
  {label:'Alarms',hash:'#alarms',icon:'M6 8a6 6 0 0 1 12 0v7l2 3H4l2-3z M10 21h4'}
];

export function installLauncher(button,{canManage=()=>true}={}) {
  let popup;
  button.onclick = () => {
    if (popup?.open) return;
    popup = document.createElement('dialog');
    popup.className = 'app-launcher';
    popup.setAttribute('aria-label', 'Applications');
    const title = document.createElement('h2');
    title.textContent = 'Applications';
    popup.append(title);
    const grid = document.createElement('nav');
    grid.className = 'launcher-grid';
    grid.setAttribute('aria-label', 'Application pages');
    popup.append(grid);
    for (const destination of destinations.filter(destination=>canManage() || ['#pages','#alarms'].includes(destination.hash))) {
      const link = document.createElement('a');
      link.href = destination.hash;
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', destination.icon);
      icon.append(path);
      const label = document.createElement('span');
      label.textContent = destination.label;
      link.append(icon, label);
      link.onclick = event => {
        event.preventDefault();
        window.location.hash = destination.hash;
        popup.close();
      };
      grid.append(link);
    }
    popup.onclick = event => {
      const rect = popup.getBoundingClientRect();
      if (event.target === popup && (event.clientX < rect.left || event.clientX > rect.right
          || event.clientY < rect.top || event.clientY > rect.bottom)) popup.close();
    };
    popup.onclose = () => {
      popup.remove();
      button.setAttribute('aria-expanded', 'false');
      button.focus();
    };
    document.body.append(popup);
    button.setAttribute('aria-expanded', 'true');
    popup.showModal();
  };
}
