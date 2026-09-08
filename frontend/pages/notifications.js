/* ==========================================================================
   pages/notifications.js - the user's own notification inbox.

   Every endpoint used here is already scoped to the authenticated user by the
   backend (notifications.user_id is part of each WHERE clause), so there is no
   way to read or delete someone else's notification from this page.
   ========================================================================== */
(function (window, document) {
  'use strict';

  const UIT = window.UIT;
  const {
    $, api, Guard, Navbar, ApiError, escapeHtml, timeAgo,
    showToast, showLoading, showError, showEmptyState, setButtonLoading, confirmDialog,
  } = UIT;

  const PAGE_SIZE = 20;
  const state = { page: 1, items: [], total: 0, loading: false };

  const ICONS = {
    buddy_request: '🤝',
    buddy_request_accepted: '🎉',
    buddy_request_rejected: '💤',
    new_competition: '🏆',
    new_lost_found: '🔎',
    new_poll: '🗳️',
  };

  /** Where each notification type should take the user. */
  const LINK_FOR = {
    buddy_request: 'study-buddy.html#requests',
    buddy_request_accepted: 'study-buddy.html#matches',
    buddy_request_rejected: 'study-buddy.html#requests',
    new_competition: 'campus-life.html#competitions',
    new_lost_found: 'campus-life.html#lost-found',
    new_poll: 'voting.html',
  };

  document.addEventListener('DOMContentLoaded', async () => {
    const user = await Guard.requireAuth();
    if (!user) return;

    Navbar.renderNavbar(user);

    $('#notif-filter').addEventListener('change', () => reload());
    $('#notif-type').addEventListener('change', () => reload());
    $('#notif-mark-all').addEventListener('click', markAllRead);
    $('#notif-more').addEventListener('click', loadMore);

    reload();
  });

  function currentQuery() {
    const query = { limit: PAGE_SIZE, page: state.page };
    if ($('#notif-filter').value === 'unread') query.is_read = 'false';
    const type = $('#notif-type').value;
    if (type) query.type = type;
    return query;
  }

  function reload() {
    state.page = 1;
    state.items = [];
    load(true);
  }

  function loadMore() {
    state.page += 1;
    load(false);
  }

  async function load(replace) {
    const list = $('#notif-list');
    if (replace) showLoading(list, 'Loading your notifications…');
    state.loading = true;

    try {
      const { data, meta } = await api.notifications.list(currentQuery());
      const incoming = data.notifications || [];
      state.items = replace ? incoming : state.items.concat(incoming);
      state.total = meta ? meta.total : state.items.length;

      render();

      const more = $('#notif-more');
      more.hidden = !(meta && meta.has_next_page);
    } catch (error) {
      showError(list, error instanceof ApiError && error.isNetwork
        ? error.message : 'Unable to load your notifications.', reload);
      $('#notif-more').hidden = true;
    } finally {
      state.loading = false;
    }
  }

  function render() {
    const list = $('#notif-list');

    if (!state.items.length) {
      const filtered = $('#notif-filter').value || $('#notif-type').value;
      showEmptyState(list, filtered
        ? 'No notifications match these filters. Try clearing them.'
        : 'You have no notifications yet. They will appear here as you use UITogether.', {
        icon: '🔔',
        title: filtered ? 'Nothing to show' : 'No notifications yet',
        actionLabel: filtered ? 'Clear filters' : null,
        onAction: () => { $('#notif-filter').value = ''; $('#notif-type').value = ''; reload(); },
      });
      return;
    }

    const inPages = window.location.pathname.includes('/pages/');
    const prefix = inPages ? '' : 'pages/';
    list.innerHTML = state.items.map((n) => `
      <div class="req-row notif-row${n.is_read ? '' : ' is-unread'}" data-id="${n.notification_id}">
        <span class="avatar avatar--sm" aria-hidden="true"
              style="background:var(--teal-100);color:var(--teal-800)">${ICONS[n.type] || '🔔'}</span>

        <a class="grow notif-row__link" href="${LINK_FOR[n.type] ? (prefix + LINK_FOR[n.type]) : (prefix + 'dashboard.html')}"
           data-open="${n.notification_id}">
          <strong style="display:block;color:var(--teal-900)">${escapeHtml(n.title)}</strong>
          <span class="text-sm" style="color:var(--ink-soft)">${escapeHtml(n.message || '')}</span>
          <span class="text-sm text-muted" style="display:block">${escapeHtml(timeAgo(n.created_at))}</span>
        </a>

        <span class="req-row__actions">
          ${n.is_read ? '' : `<button type="button" class="btn btn-ghost btn-sm"
              data-read="${n.notification_id}">Mark read</button>`}
          <button type="button" class="btn btn-danger btn-sm"
                  data-delete="${n.notification_id}"
                  aria-label="Delete notification: ${escapeHtml(n.title)}">Delete</button>
        </span>
      </div>`).join('');

    list.querySelectorAll('[data-read]').forEach((btn) =>
      btn.addEventListener('click', () => markRead(btn.dataset.read, btn)));
    list.querySelectorAll('[data-delete]').forEach((btn) =>
      btn.addEventListener('click', () => removeOne(btn.dataset.delete)));

    // Opening a notification marks it read first, then follows the link.
    list.querySelectorAll('[data-open]').forEach((link) =>
      link.addEventListener('click', async (event) => {
        const id = Number(link.dataset.open);
        const item = state.items.find((n) => n.notification_id === id);
        if (!item || item.is_read) return;
        event.preventDefault();
        try { await api.notifications.markRead(id); } catch { /* navigate regardless */ }
        window.location.href = link.getAttribute('href');
      }));
  }

  async function markRead(id, button) {
    setButtonLoading(button, true, 'Marking…');
    try {
      await api.notifications.markRead(id);
      const item = state.items.find((n) => n.notification_id === Number(id));
      if (item) item.is_read = true;
      render();
      Navbar.refreshBadges();
    } catch (error) {
      setButtonLoading(button, false);
      showToast(error instanceof ApiError ? error.message : 'Could not update this notification.',
        { type: 'error' });
    }
  }

  async function markAllRead() {
    const button = $('#notif-mark-all');
    setButtonLoading(button, true, 'Working…');
    try {
      const { data } = await api.notifications.markAllRead();
      showToast(`${data.updated} notification${data.updated === 1 ? '' : 's'} marked as read.`,
        { type: 'success', title: 'Inbox cleared' });
      reload();
      Navbar.refreshBadges();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'Could not update your notifications.',
        { type: 'error' });
    } finally {
      setButtonLoading(button, false);
    }
  }

  async function removeOne(id) {
    const item = state.items.find((n) => n.notification_id === Number(id));
    const ok = await confirmDialog({
      title: 'Delete this notification?',
      message: item ? `"${item.title}" will be removed from your inbox.` : 'It will be removed from your inbox.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;

    try {
      await api.notifications.remove(id);
      state.items = state.items.filter((n) => n.notification_id !== Number(id));
      render();
      Navbar.refreshBadges();
      showToast('Notification deleted.', { type: 'success', title: 'Removed' });
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'Could not delete this notification.',
        { type: 'error' });
    }
  }
})(window, document);
