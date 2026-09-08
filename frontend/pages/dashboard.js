/* ==========================================================================
   dashboard.js - controller for dashboard.html.
   Every number shown here comes from the backend; nothing is hard-coded.
   ========================================================================== */
(function (window, document) {
  'use strict';

  const UIT = window.UIT;
  const { $, api, Auth, Navbar, escapeHtml, showToast, showLoading, showEmptyState, timeAgo } = UIT;

  document.addEventListener('DOMContentLoaded', async () => {
    const user = await Auth.requireAuth();
    if (!user) return;

    Navbar.renderNavbar(user);
    renderWelcome(user);

    // Sent here by auth/guard.js when a non-admin opened /pages/admin.html
    if (UIT.queryParam('denied') === 'admin') {
      showToast('The admin dashboard is only available to administrators.',
        { type: 'error', title: 'Access denied' });
      window.history.replaceState({}, '', window.location.pathname);
    }

    loadStats();
    loadActivity();

    const markAll = $('#mark-all-read');
    if (markAll) markAll.addEventListener('click', markAllRead);
  });

  function renderWelcome(user) {
    const title = $('#welcome-title');
    if (title) title.textContent = `Welcome Back, ${user.name}!`;
    document.title = `Dashboard — ${user.name} — UITogether`;
  }

  /** Four live counters. Each failure degrades to "—" rather than breaking the page. */
  async function loadStats() {
    const set = (id, value) => { const el = $(id); if (el) el.textContent = value; };

    const settle = (promise) => promise.then((r) => r).catch(() => null);

    const [matches, requests, events, polls] = await Promise.all([
      settle(api.matches.list({ limit: 1 })),
      settle(api.buddyRequests.pendingCount()),
      settle(api.competitions.list({ scope: 'upcoming', limit: 1 })),
      settle(api.polls.list({ status: 'open', limit: 1 })),
    ]);

    set('#stat-matches',  matches ? (matches.meta ? matches.meta.total : 0) : '—');
    set('#stat-requests', requests ? requests.data.pending_count : '—');
    set('#stat-events',   events ? (events.meta ? events.meta.total : 0) : '—');
    set('#stat-polls',    polls ? (polls.meta ? polls.meta.total : 0) : '—');
  }

  const ICONS = {
    buddy_request: '🤝',
    buddy_request_accepted: '🎉',
    buddy_request_rejected: '💤',
    new_competition: '🏆',
    new_lost_found: '🔎',
    new_poll: '🗳️',
  };

  const LINK_FOR = {
    buddy_request: 'study-buddy.html#requests',
    buddy_request_accepted: 'study-buddy.html#matches',
    buddy_request_rejected: 'study-buddy.html#requests',
    new_competition: 'campus-life.html#competitions',
    new_lost_found: 'campus-life.html#lost-found',
    new_poll: 'voting.html',
  };

  async function loadActivity() {
    const list = $('#activity-list');
    if (!list) return;
    showLoading(list, 'Loading your activity…');

    try {
      const { data } = await api.notifications.list({ limit: 8 });
      const items = data.notifications || [];

      if (!items.length) {
        showEmptyState(list, 'Your notifications will appear here as you use UITogether.', {
          icon: '🔔', title: 'Nothing yet',
        });
        return;
      }

      const inPages = window.location.pathname.includes('/pages/');
      const prefix = inPages ? '' : 'pages/';
      list.innerHTML = items.map((n) => `
        <a class="req-row" href="${(LINK_FOR[n.type] ? (prefix + LINK_FOR[n.type]) : (prefix + 'dashboard.html'))}"
           style="text-decoration:none;${n.is_read ? '' : 'background:var(--teal-50)'}">
          <span class="avatar avatar--sm" aria-hidden="true"
                style="background:var(--teal-100);color:var(--teal-800)">${ICONS[n.type] || '🔔'}</span>
          <span class="grow">
            <span style="display:block;font-weight:700;color:var(--teal-900)">${escapeHtml(n.title)}</span>
            <span style="display:block;font-size:.86rem;color:var(--ink-soft)">${escapeHtml(n.message || '')}</span>
            <span class="text-sm text-muted">${escapeHtml(timeAgo(n.created_at))}</span>
          </span>
          ${n.is_read ? '' : '<span class="badge" aria-label="Unread">New</span>'}
        </a>`).join('');
    } catch (error) {
      UIT.showError(list, 'Unable to load your recent activity.', loadActivity);
    }
  }

  async function markAllRead() {
    const button = $('#mark-all-read');
    UIT.setButtonLoading(button, true, 'Working…');
    try {
      const { data } = await api.notifications.markAllRead();
      showToast(`${data.updated} notification${data.updated === 1 ? '' : 's'} marked as read.`,
        { type: 'success', title: 'Inbox cleared' });
      loadActivity();
      Navbar.refreshRequestBadge();
    } catch {
      showToast('Could not update your notifications. Please try again.', { type: 'error' });
    } finally {
      UIT.setButtonLoading(button, false);
    }
  }
})(window, document);
