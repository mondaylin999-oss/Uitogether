/* ==========================================================================
   components/states.js - the four states every API-driven section needs:
   loading, empty, error, and a button's in-flight state.
   ========================================================================== */
(function (window, document) {
  'use strict';

  const UIT = window.UIT;
  const { $, escapeHtml } = UIT;

  const resolve = (target) => (typeof target === 'string' ? $(target) : target);

  function stateMarkup({ icon, title, msg, actionLabel, actionId }) {
    return `
      <div class="state">
        ${icon ? `<div class="state__icon" aria-hidden="true">${icon}</div>` : ''}
        <p class="state__title">${escapeHtml(title)}</p>
        ${msg ? `<p class="state__msg">${escapeHtml(msg)}</p>` : ''}
        ${actionLabel ? `<div class="state__action">
          <button type="button" class="btn btn-primary" id="${escapeHtml(actionId || 'state-action')}">
            ${escapeHtml(actionLabel)}
          </button></div>` : ''}
      </div>`;
  }

  /** Replace a container's contents with a spinner. */
  function showLoading(target, message = 'Loading…') {
    const node = resolve(target);
    if (!node) return;
    node.innerHTML = `
      <div class="state" role="status" aria-live="polite">
        <div class="spinner" aria-hidden="true"></div>
        <p class="state__msg">${escapeHtml(message)}</p>
      </div>`;
  }

  /** Friendly error + optional retry. Raw server/stack detail never reaches here. */
  function showError(target, message = 'Something went wrong. Please try again.', onRetry) {
    const node = resolve(target);
    if (!node) return;
    node.innerHTML = stateMarkup({
      icon: '⚠️', title: 'Unable to load', msg: message,
      actionLabel: onRetry ? 'Try again' : null, actionId: 'retry-btn',
    });
    if (onRetry) {
      const btn = node.querySelector('#retry-btn');
      if (btn) btn.addEventListener('click', onRetry);
    }
  }

  /**
   * @param {string|Element} target
   * @param {string} message
   * @param {{icon?:string, title?:string, actionLabel?:string, onAction?:Function}} [options]
   */
  function showEmptyState(target, message, options = {}) {
    const node = resolve(target);
    if (!node) return;
    node.innerHTML = stateMarkup({
      icon: options.icon || '📭',
      title: options.title || message,
      msg: options.title ? message : options.msg,
      actionLabel: options.actionLabel, actionId: 'empty-action',
    });
    if (options.actionLabel && typeof options.onAction === 'function') {
      const btn = node.querySelector('#empty-action');
      if (btn) btn.addEventListener('click', options.onAction);
    }
  }

  /** Toggle a button's spinner without losing its original label. */
  function setButtonLoading(button, isLoading, loadingText = 'Please wait…') {
    if (!button) return;
    if (isLoading) {
      if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner spinner--sm" aria-hidden="true"></span>${escapeHtml(loadingText)}`;
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
      }
    }
  }

  Object.assign(UIT, { showLoading, showError, showEmptyState, setButtonLoading });
})(window, document);
