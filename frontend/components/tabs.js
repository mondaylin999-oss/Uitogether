/* ==========================================================================
   components/tabs.js - accessible tab controller (arrow keys, Home/End).
   Markup: [role=tab] with aria-controls pointing at a [role=tabpanel].
   ========================================================================== */
(function (window, document) {
  'use strict';

  const UIT = window.UIT;
  const { $, $$ } = UIT;

  /**
   * @param {string} tablistSelector
   * @param {(tabId: string) => void} [onChange]
   */
  function initTabs(tablistSelector, onChange) {
    const tablist = $(tablistSelector);
    if (!tablist) return null;
    const tabs = $$('[role="tab"]', tablist);

    function select(tab) {
      tabs.forEach((t) => {
        const selected = t === tab;
        t.setAttribute('aria-selected', String(selected));
        t.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !selected;
      });
      if (typeof onChange === 'function') onChange(tab.id);
    }

    tabs.forEach((tab, index) => {
      tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (event) => {
        const map = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
        if (!(event.key in map)) return;
        event.preventDefault();
        const move = map[event.key];
        const next = move === 'first' ? tabs[0]
          : move === 'last' ? tabs[tabs.length - 1]
          : tabs[(index + move + tabs.length) % tabs.length];
        next.focus();
        select(next);
      });
    });

    return { select, selectById: (id) => { const t = tabs.find((x) => x.id === id); if (t) select(t); } };
  }

  UIT.initTabs = initTabs;
})(window, document);
