/* ==========================================================================
   components/modal.js - accessible dialog behaviour.
   Backdrop click, Escape, focus trap, focus restore and body scroll lock.
   Markup contract: .modal > .modal__panel, closers carry [data-modal-close].
   ========================================================================== */
(function (window, document) {
  'use strict';

  const UIT = window.UIT;
  const { $$ } = UIT;

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]),'
    + ' select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /**
   * @param {string|Element} elementOrId
   * @returns {{open:Function, close:Function, element:Element, isOpen:Function}|null}
   */
  function createModal(elementOrId) {
    const modal = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (!modal) return null;
    let lastFocused = null;

    const focusables = () => $$(FOCUSABLE, modal).filter((el) => el.offsetParent !== null);

    function onKeydown(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    function open() {
      lastFocused = document.activeElement;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('is-locked');
      document.addEventListener('keydown', onKeydown);
      const target = modal.querySelector('[data-autofocus]') || focusables()[0];
      if (target) setTimeout(() => target.focus(), 60);
    }

    function close() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('is-locked');
      document.removeEventListener('keydown', onKeydown);
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    modal.addEventListener('mousedown', (event) => { if (event.target === modal) close(); });
    $$('[data-modal-close]', modal).forEach((btn) => btn.addEventListener('click', close));
    modal.setAttribute('aria-hidden', 'true');

    return { open, close, element: modal, isOpen: () => modal.classList.contains('is-open') };
  }

  UIT.createModal = createModal;
})(window, document);
