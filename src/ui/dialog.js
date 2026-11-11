// 应用内提示与确认框，替代 alert / confirm。
// 微应用运行在沙箱 iframe 中，原生弹窗不可用；这里只用 DOM API 和 CSS 类实现。
import './dialog.css';

let toastHost = null;

function ensureToastHost() {
  if (toastHost && document.body.contains(toastHost)) return toastHost;
  toastHost = document.createElement('div');
  toastHost.className = 'app-toast-host';
  toastHost.setAttribute('role', 'status');
  toastHost.setAttribute('aria-live', 'polite');
  document.body.append(toastHost);
  return toastHost;
}

/** 显示一条自动消失的提示。 */
export function notify(message, { duration = 3500 } = {}) {
  const toast = document.createElement('div');
  toast.className = 'app-toast';
  toast.textContent = String(message);
  toast.addEventListener('click', () => toast.remove());
  ensureToastHost().append(toast);
  setTimeout(() => toast.remove(), duration);
}

/** 显示确认框，返回用户是否确认。 */
export function confirmDialog(message, { okText = '确定', cancelText = '取消' } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'app-dialog-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'app-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const text = document.createElement('p');
    text.className = 'app-dialog__text';
    text.textContent = String(message);

    const actions = document.createElement('div');
    actions.className = 'app-dialog__actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'app-dialog__button';
    cancel.textContent = cancelText;
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'app-dialog__button app-dialog__button--primary';
    ok.textContent = okText;
    actions.append(cancel, ok);
    dialog.append(text, actions);
    backdrop.append(dialog);

    const finish = (value) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') finish(false);
    };
    cancel.addEventListener('click', () => finish(false));
    ok.addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) finish(false);
    });
    document.addEventListener('keydown', onKey);
    document.body.append(backdrop);
    ok.focus();
  });
}
