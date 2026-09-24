import { h } from '../core/dom';

let host: HTMLElement | null = null;

function ensureHost(): HTMLElement {
  if (!host) {
    host = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(host);
  }
  return host;
}

export interface ToastAction {
  label: string;
  run: () => void;
}

export function toast(message: string, kind: 'info' | 'success' | 'error' = 'info', action?: ToastAction, duration = 3500): void {
  const el = h('div', { class: `toast toast-${kind}` }, message);
  if (action) {
    el.appendChild(
      h('button', { class: 'btn btn-small', onclick: () => { action.run(); el.remove(); } }, action.label),
    );
  }
  ensureHost().appendChild(el);
  window.setTimeout(() => {
    el.classList.add('toast-out');
    window.setTimeout(() => el.remove(), 300);
  }, action ? duration * 3 : duration);
}
