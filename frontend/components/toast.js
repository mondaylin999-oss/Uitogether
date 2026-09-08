/* ==========================================================================
   components/toast.js - transient success / error / info messages.
   Rendered into a single aria-live region so screen readers announce them.
   ========================================================================== */
(function (window, document) {
  'use strict';

  const UIT = window.UIT;
  const { $, escapeHtml } = UIT;

  function region() {
    let el = $('#toast-region');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast-region';
      el.className = 'toast-region';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    return el;
  }

  /**
   * @param {string} message
   * @param {{type?:'success'|'error'|'info', title?:string, duration?:number}} [options]
   */
  function showToast(message, options = {}) {
    const { type = 'info', title, duration = type === 'error' ? 6000 : 4000 } = options;
    const icons = { success: '✓', error: '⚠', info: 'ℹ' };
    const heading = title
      || (type === 'success' ? 'Success' : type === 'error' ? 'Something went wrong' : 'Notice');

    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.innerHTML = `
      <span class="toast__icon" aria-hidden="true">${icons[type] || icons.info}</span>
      <div class="toast__body">
        <div class="toast__title">${escapeHtml(heading)}</div>
        <div class="toast__msg">${escapeHtml(message)}</div>
      </div>
      <button type="button" class="toast__close" aria-label="Dismiss notification">&times;</button>`;

    const remove = () => {
      if (!el.isConnected) return;
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 200);
    };
    el.querySelector('.toast__close').addEventListener('click', remove);
    region().appendChild(el);
    setTimeout(remove, duration);
    return el;
  }

  const toastSuccess = (msg, title) => showToast(msg, { type: 'success', title });
  const toastError   = (msg, title) => showToast(msg, { type: 'error', title });

  Object.assign(UIT, { showToast, toastSuccess, toastError });
})(window, document);
