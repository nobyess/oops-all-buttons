// Shared bottom notification. A new message cancels both previous timers.
export function createNotifier(element) {
  let hideTimer, clearTimer;
  return function notify(text, {duration = 2800} = {}) {
    clearTimeout(hideTimer);
    clearTimeout(clearTimer);
    if (!text) {
      element.classList.remove('is-visible');
      element.textContent = '';
      return;
    }
    element.textContent = text;
    element.classList.add('is-visible');
    hideTimer = setTimeout(() => {
      element.classList.remove('is-visible');
      clearTimer = setTimeout(() => {element.textContent = '';}, 220);
    }, duration);
  };
}
