/* ==========================================================================
   utils/dom.js - DOM lookup, escaping and small helpers.
   Loaded FIRST on every page. Creates the single window.UIT namespace.
   ========================================================================== */
(function (window, document) {
  'use strict';

  const UIT = window.UIT || (window.UIT = {});

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** Escape untrusted text before it goes anywhere near innerHTML. */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Escape a value used in href/src. Allows only known-safe schemes, so a
   * hostile "javascript:" value from an API can never become a live link.
   */
  function safeUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    if (/^(https?:|tg:|viber:|mailto:|tel:)/i.test(url)) return escapeHtml(url);
    return '';
  }

  function debounce(fn, wait = 320) {
    let timer;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  const queryParam = (key) => new URLSearchParams(window.location.search).get(key);

  Object.assign(UIT, { $, $$, escapeHtml, safeUrl, debounce, queryParam });
})(window, document);
