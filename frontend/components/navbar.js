/* ==========================================================================
   components/navbar.js - one navbar reused across every authenticated page.
   Mobile: hamburger drawer. Desktop (>=1024px): horizontal links (CSS).

   The Admin link is drawn only for admins. That is presentation: the admin
   page re-checks with the backend, and every admin API route is guarded
   server-side regardless of what this renders.
   ========================================================================== */
(function (window, document) {
  'use strict';

  const UIT = window.UIT;
  const { escapeHtml, $, $$ } = UIT;

  // Use filenames only; rendering will prefix with 'pages/' when the current
  // document is not already inside the `pages/` folder. This keeps links
  // robust whether the static server root is the frontend folder or the
  // workspace root.
  const LINKS = [
    { href: 'dashboard.html',     label: 'Dashboard',     icon: '🏠' },
    { href: 'study-buddy.html',   label: 'Study Buddy',   icon: '🤝', badge: 'requests' },
    { href: 'campus-life.html',   label: 'Campus Life',   icon: '🎓' },
    { href: 'voting.html',        label: 'Voting',        icon: '🗳️' },
    { href: 'notifications.html', label: 'Notifications', icon: '🔔', badge: 'unread' },
    { href: 'profile.html',       label: 'Profile',       icon: '👤' },
  ];

  const ADMIN_LINK = { href: 'admin.html', label: 'Admin', icon: '🛠️' };

  const currentPath = () => window.location.pathname;

  /**
   * @param {object|null} user authenticated user (role decides the Admin link)
   */
  function renderNavbar(user) {
    const mount = document.getElementById('navbar');
    if (!mount) return;

    const path = currentPath();
    const inPages = path.includes('/pages/');
    const prefix = inPages ? '' : 'pages/';
    const currentPage = path.split('/').pop() || 'index.html';
    const isAdmin = Boolean(user && user.role === 'admin');
    const items = isAdmin ? LINKS.concat(ADMIN_LINK) : LINKS;
    const links = items.map((link) => {
      const href = `${prefix}${link.href}`;
      const isCurrent = link.href === currentPage || href === path;
      return `
      <a class="nav-link" href="${href}"${isCurrent ? ' aria-current="page"' : ''}>
        <span aria-hidden="true">${link.icon}</span>
        <span>${escapeHtml(link.label)}</span>
        ${link.badge ? `<span class="nav-badge" id="nav-badge-${link.badge}" hidden>0</span>` : ''}
      </a>`;
    }).join('');

    // compute logo path relative to the current document location
    // pages/ files are nested one level deeper than the frontend root
    const logoPath = inPages ? '../../Logo/UITogether_Logo.jpg' : '../Logo/UITogether_Logo.jpg';
    mount.innerHTML = `
      <nav class="navbar" aria-label="Main navigation">
        <div class="container navbar__inner">
          <a class="brand" href="${prefix}dashboard.html">
            <span class="brand__mark" aria-hidden="true"><img src="${logoPath}" alt="UITogether logo"></span>
            <span>UITogether</span>
            ${isAdmin ? '<span class="badge badge--admin" style="margin-left:4px">Admin</span>' : ''}
          </a>

          <button type="button" class="nav-toggle" id="nav-toggle"
                  aria-expanded="false" aria-controls="nav-menu" aria-label="Open menu">
            <span class="nav-toggle__bar" aria-hidden="true"></span>
            <span class="nav-toggle__bar" aria-hidden="true"></span>
            <span class="nav-toggle__bar" aria-hidden="true"></span>
          </button>

          <div class="nav-menu" id="nav-menu">
            ${links}
            <button type="button" class="nav-link nav-link--logout" id="nav-logout">
              <span aria-hidden="true">↩</span><span>Logout</span>
            </button>
          </div>
        </div>
      </nav>
      <div class="nav-scrim" id="nav-scrim" hidden></div>`;

    wireNavbar();
    refreshBadges();
  }

  function wireNavbar() {
    const toggle = $('#nav-toggle');
    const menu = $('#nav-menu');
    const scrim = $('#nav-scrim');
    if (!toggle || !menu) return;

    const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;
    const isOpen = () => menu.classList.contains('is-open');

    function open() {
      menu.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
      if (scrim) { scrim.hidden = false; requestAnimationFrame(() => scrim.classList.add('is-open')); }
    }

    function close() {
      menu.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      if (scrim) {
        scrim.classList.remove('is-open');
        setTimeout(() => { if (!menu.classList.contains('is-open')) scrim.hidden = true; }, 220);
      }
    }

    toggle.addEventListener('click', () => (isOpen() ? close() : open()));
    $$('.nav-link', menu).forEach((link) => {
      link.addEventListener('click', () => { if (!isDesktop()) close(); });
    });
    if (scrim) scrim.addEventListener('click', close);

    document.addEventListener('click', (event) => {
      if (!isOpen() || isDesktop()) return;
      if (!menu.contains(event.target) && !toggle.contains(event.target)) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isOpen()) { close(); toggle.focus(); }
    });
    window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => { if (e.matches) close(); });

    const logout = $('#nav-logout');
    if (logout) {
      logout.addEventListener('click', async () => {
        UIT.showToast('Signing you out…', { type: 'info', title: 'Goodbye' });
        await UIT.Auth.logout();
      });
    }
  }

  /** Live counts for pending buddy requests and unread notifications. */
  async function refreshBadges() {
    const set = (id, count, label) => {
      const badge = document.getElementById(id);
      if (!badge) return;
      const n = Number(count || 0);
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.hidden = n === 0;
      if (n > 0) badge.setAttribute('aria-label', `${n} ${label}`);
    };

    // A badge is never worth surfacing an error over - each fails silently.
    try {
      const { data } = await UIT.api.buddyRequests.pendingCount();
      set('nav-badge-requests', data.pending_count, 'pending buddy requests');
    } catch { /* leave hidden */ }

    try {
      const { data } = await UIT.api.notifications.unreadCount();
      set('nav-badge-unread', data.unread_count, 'unread notifications');
    } catch { /* leave hidden */ }
  }

  UIT.Navbar = { renderNavbar, refreshBadges, refreshRequestBadge: refreshBadges };
})(window, document);
