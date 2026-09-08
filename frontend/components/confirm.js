/* ==========================================================================
   components/confirm.js - accessible confirmation dialog for destructive
   actions. Replaces window.confirm(), which cannot be styled, cannot show
   context, and is blocked in some embedded browsers.

   Usage:
     const ok = await UIT.confirmDialog({
       title: 'Delete competition?',
       message: 'This cannot be undone.',
       confirmLabel: 'Delete',
       danger: true,
     });
   ========================================================================== */
(function (window, document) {
  'use strict';

  const UIT = window.UIT;
  const { escapeHtml } = UIT;

  let host = null;

  function ensureHost() {
    if (host) return host;
    host = document.createElement('div');
    host.className = 'modal';
    host.id = 'confirm-dialog';
    host.setAttribute('role', 'alertdialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-hidden', 'true');
    host.setAttribute('aria-labelledby', 'confirm-title');
    host.setAttribute('aria-describedby', 'confirm-message');
    document.body.appendChild(host);
    return host;
  }

  /**
   * @param {{title?:string, message?:string, confirmLabel?:string,
   *          cancelLabel?:string, danger?:boolean}} [options]
   * @returns {Promise<boolean>} true when confirmed
   */
  function confirmDialog(options = {}) {
    const {
      title = 'Are you sure?',
      message = 'This action cannot be undone.',
      confirmLabel = 'Confirm',
      cancelLabel = 'Cancel',
      danger = true,
    } = options;

    const el = ensureHost();
    el.innerHTML = `
      <div class="modal__panel modal__panel--sm">
        <div class="modal__head">
          <h2 id="confirm-title">${escapeHtml(title)}</h2>
        </div>
        <div class="modal__body">
          <p id="confirm-message">${escapeHtml(message)}</p>
        </div>
        <div class="modal__foot">
          <button type="button" class="btn btn-ghost" data-confirm-cancel>${escapeHtml(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm-ok>
            ${escapeHtml(confirmLabel)}
          </button>
        </div>
      </div>`;

    const lastFocused = document.activeElement;
    const okBtn = el.querySelector('[data-confirm-ok]');
    const cancelBtn = el.querySelector('[data-confirm-cancel]');

    return new Promise((resolve) => {
      function cleanup(result) {
        el.classList.remove('is-open');
        el.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('is-locked');
        document.removeEventListener('keydown', onKey);
        el.removeEventListener('mousedown', onBackdrop);
        if (lastFocused && lastFocused.focus) lastFocused.focus();
        resolve(result);
      }

      function onKey(event) {
        if (event.key === 'Escape') { event.preventDefault(); cleanup(false); return; }
        if (event.key !== 'Tab') return;
        // two buttons only - trap between them
        event.preventDefault();
        (document.activeElement === okBtn ? cancelBtn : okBtn).focus();
      }

      function onBackdrop(event) { if (event.target === el) cleanup(false); }

      okBtn.addEventListener('click', () => cleanup(true));
      cancelBtn.addEventListener('click', () => cleanup(false));
      el.addEventListener('mousedown', onBackdrop);
      document.addEventListener('keydown', onKey);

      el.classList.add('is-open');
      el.setAttribute('aria-hidden', 'false');
      document.body.classList.add('is-locked');
      // focus Cancel first: the safe choice for a destructive prompt
      setTimeout(() => cancelBtn.focus(), 60);
    });
  }

  UIT.confirmDialog = confirmDialog;
})(window, document);
