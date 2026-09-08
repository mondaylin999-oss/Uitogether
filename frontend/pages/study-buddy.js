/* ==========================================================================
   study-buddy.js - Discover (swipe) / Requests / Matches.

   MATCHING FLOW (all state lives in MySQL, never in the browser):
     A taps "Interested"  -> POST /buddy-requests           status = pending
     B accepts            -> PATCH /buddy-requests/:id/accept  status = accepted
     B rejects            -> PATCH /buddy-requests/:id/reject  status = rejected

   CONTACT PRIVACY: this file NEVER builds a Telegram/Viber link from raw
   fields. It only renders `profile.contact`, which the backend includes
   solely when `contact_unlocked === true` (a mutual match). Pending and
   rejected requests carry no contact object at all.
   ========================================================================== */
(function (window, document) {
  'use strict';

  const UIT = window.UIT;
  const {
    $, api, Auth, Navbar, ApiError, escapeHtml, safeUrl, initials,
    labelStudyStyle, labelWannaMeet, showToast, showLoading, showError,
    showEmptyState, setButtonLoading, createModal, initTabs, debounce, timeAgo,
  } = UIT;

  /** Session-only state. Nothing here pretends to be persistent storage. */
  const state = {
    user: null,
    deck: [],           // profiles still to review
    index: 0,
    skipped: new Set(), // in-memory only: the API has no "skip" concept
    hasOwnProfile: false,
    busy: false,
  };

  let detailModal = null;

  /* ================================================================== *
   *  Bootstrap
   * ================================================================== */
  document.addEventListener('DOMContentLoaded', async () => {
    const user = await Auth.requireAuth();
    if (!user) return;
    state.user = user;

    Navbar.renderNavbar(user);
    detailModal = createModal('detail-modal');
    // Modal action buttons (Accept/Reject for incoming requests)
    const btnAccept = document.getElementById('detail-accept');
    const btnReject = document.getElementById('detail-reject');
    if (btnAccept) btnAccept.addEventListener('click', async () => {
      const requestId = btnAccept.dataset.requestId;
      if (requestId) {
        await respond('accept', requestId, btnAccept);
        detailModal.close();
      }
    });
    if (btnReject) btnReject.addEventListener('click', async () => {
      const requestId = btnReject.dataset.requestId;
      if (requestId) {
        await respond('reject', requestId, btnReject);
        detailModal.close();
      }
    });

    const tabs = initTabs('.tabs', (tabId) => {
      if (tabId === 'tab-requests') loadRequests();
      if (tabId === 'tab-matches') loadMatches();
    });

    // deep links: study-buddy.html#requests / #matches
    // Also handled on `hashchange`, because navigating to a different hash on
    // the page you are already on does not reload the document.
    const applyHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'requests' || hash === 'matches' || hash === 'discover') {
        tabs.selectById(`tab-${hash}`);
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);

    await checkOwnProfile();
    loadDeck();
    wireFilters();
  });

  /** A student needs their own profile before the backend accepts requests. */
  async function checkOwnProfile() {
    try {
      await api.studyBuddy.myProfile();
      state.hasOwnProfile = true;
    } catch (error) {
      state.hasOwnProfile = false;
      if (error instanceof ApiError && error.status === 404) {
        const prompt = $('#profile-prompt');
        if (prompt) prompt.hidden = false;
      }
    }
  }

  function wireFilters() {
    const rerun = debounce(loadDeck, 380);
    ['#filter-search', '#filter-subject'].forEach((sel) => {
      const el = $(sel); if (el) el.addEventListener('input', rerun);
    });
    ['#filter-style', '#filter-meet'].forEach((sel) => {
      const el = $(sel); if (el) el.addEventListener('change', loadDeck);
    });
  }

  /* ================================================================== *
   *  DISCOVER
   * ================================================================== */
  async function loadDeck() {
    const area = $('#discover-area');
    showLoading(area, 'Finding study buddies…');

    try {
      // Everything the user has already acted on is excluded, so the deck
      // never shows a student they have already requested or matched with.
      const [browse, outgoing, incoming] = await Promise.all([
        api.studyBuddy.browse({
          q: $('#filter-search').value.trim(),
          study_style: $('#filter-style').value,
          wanna_meet: $('#filter-meet').value,
          subject: $('#filter-subject').value.trim(),
          limit: 50,
        }),
        api.buddyRequests.outgoing({ limit: 100 }),
        api.buddyRequests.incoming({ limit: 100 }),
      ]);

      const handled = new Set();
      (outgoing.data.requests || []).forEach((r) => handled.add(r.receiver_id));
      (incoming.data.requests || []).forEach((r) => handled.add(r.sender_id));

      state.deck = (browse.data.profiles || [])
        .filter((p) => !handled.has(p.user_id) && !state.skipped.has(p.user_id));
      state.index = 0;

      renderDeck();
    } catch (error) {
      showError(area, error instanceof ApiError && error.isNetwork
        ? error.message : 'Unable to load study buddies.', loadDeck);
    }
  }

  function renderDeck() {
    const area = $('#discover-area');
    const profile = state.deck[state.index];

    if (!profile) {
      showEmptyState(area, 'You have reviewed everyone who matches these filters. Try widening your search or check back later.', {
        icon: '🎉', title: 'No more study buddies',
        actionLabel: 'Start over', onAction: () => { state.skipped.clear(); loadDeck(); },
      });
      return;
    }

    const remaining = state.deck.length - state.index;
    area.innerHTML = `
      <div class="swipe-stage">
        <article class="card swipe-card" id="swipe-card" aria-label="Study buddy profile">
          <span class="swipe-stamp swipe-stamp--yes" id="stamp-yes" aria-hidden="true">Interested</span>
          <span class="swipe-stamp swipe-stamp--no"  id="stamp-no"  aria-hidden="true">Skip</span>
          <div class="card__body">
            ${buddyHeader(profile)}
            ${buddyMeta(profile)}
          </div>
        </article>

        <div class="swipe-actions">
          <button type="button" class="swipe-btn swipe-btn--skip" id="btn-skip"
                  aria-label="Skip ${escapeHtml(profile.nickname)}" title="Skip">✕</button>
          <button type="button" class="swipe-btn swipe-btn--info" id="btn-details"
                  aria-label="View full details for ${escapeHtml(profile.nickname)}" title="View details">ⓘ</button>
          <button type="button" class="swipe-btn swipe-btn--like" id="btn-interested"
                  aria-label="Send a buddy request to ${escapeHtml(profile.nickname)}" title="Interested">✔</button>
        </div>

        <p class="swipe-hint">
          Swipe left to skip, right to show interest — or use the buttons.
          <br><span class="text-muted">${remaining} profile${remaining === 1 ? '' : 's'} left</span>
        </p>
      </div>`;

    $('#btn-skip').addEventListener('click', () => decide('skip'));
    $('#btn-interested').addEventListener('click', () => decide('interested'));
    $('#btn-details').addEventListener('click', () => openDetails(profile.user_id));
    attachSwipe($('#swipe-card'));
  }

  function buddyHeader(profile) {
    const name = profile.user ? profile.user.name : '';
    return `
      <div class="buddy__top">
        <span class="avatar" aria-hidden="true">${escapeHtml(initials(profile.nickname || name))}</span>
        <div class="grow">
          <h3 style="margin-bottom:2px">${escapeHtml(profile.nickname)}</h3>
          <p class="text-sm" style="margin:0">${escapeHtml(name)}${profile.user && profile.user.academic_year ? ` · ${escapeHtml(profile.user.academic_year)}` : ''}</p>
        </div>
      </div>
      <div class="row mt-3">
        <span class="badge">${escapeHtml(profile.semester)}</span>
        <span class="badge">${escapeHtml(labelStudyStyle(profile.study_style))}</span>
        <span class="badge">${escapeHtml(labelWannaMeet(profile.wanna_meet))}</span>
      </div>`;
  }

  function subjectChips(list) {
    if (!list || !list.length) return '<span class="text-muted text-sm">Not specified</span>';
    return `<span class="chip-list">${list.map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join('')}</span>`;
  }

  function buddyMeta(profile) {
    return `
      <div class="meta-list">
        <div class="meta">
          <span class="meta__label">Wants help with</span>
          <span class="meta__value">${subjectChips(profile.weak_subjects)}</span>
        </div>
        <div class="meta">
          <span class="meta__label">Can help with</span>
          <span class="meta__value">${subjectChips(profile.strong_subjects)}</span>
        </div>
        ${profile.notes ? `
        <div class="meta">
          <span class="meta__label">Notes</span>
          <span class="meta__value">${escapeHtml(profile.notes)}</span>
        </div>` : ''}
      </div>`;
  }

  /* ---------------- swipe gesture ---------------- */
  /**
   * Horizontal-intent drag. CSS sets `touch-action: pan-y` on the card, so
   * vertical scrolling is handled natively and never hijacked.
   */
  function attachSwipe(card) {
    if (!card) return;

    const stampYes = $('#stamp-yes');
    const stampNo = $('#stamp-no');
    const THRESHOLD = Math.min(110, Math.max(60, card.offsetWidth * 0.28));

    let startX = 0, startY = 0, dx = 0, dy = 0;
    let pointerId = null, dragging = false, decided = false;

    const onDown = (event) => {
      if (state.busy || event.button > 0) return;
      pointerId = event.pointerId;
      startX = event.clientX; startY = event.clientY;
      dx = 0; dy = 0; dragging = false; decided = false;
      card.setPointerCapture(pointerId);
      card.classList.remove('is-settling');
    };

    const onMove = (event) => {
      if (pointerId === null || event.pointerId !== pointerId) return;
      dx = event.clientX - startX;
      dy = event.clientY - startY;

      // Only claim the gesture once it is clearly horizontal.
      if (!dragging) {
        if (Math.abs(dx) < 12) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.2) { release(); return; }
        dragging = true;
        card.classList.add('is-dragging');
      }

      const rotate = dx / 18;
      card.style.transform = `translateX(${dx}px) rotate(${rotate}deg)`;
      const strength = Math.min(1, Math.abs(dx) / THRESHOLD);
      stampYes.style.opacity = dx > 0 ? strength : 0;
      stampNo.style.opacity = dx < 0 ? strength : 0;
    };

    const onUp = (event) => {
      if (pointerId === null || (event && event.pointerId !== pointerId)) return;
      if (dragging && !decided && Math.abs(dx) >= THRESHOLD) {
        decided = true;
        release(false);
        decide(dx > 0 ? 'interested' : 'skip');
        return;
      }
      release();
    };

    function release(reset = true) {
      if (pointerId !== null) {
        try { card.releasePointerCapture(pointerId); } catch { /* already released */ }
      }
      pointerId = null;
      dragging = false;
      card.classList.remove('is-dragging');
      if (reset) {
        card.classList.add('is-settling');
        card.style.transform = '';
        stampYes.style.opacity = 0;
        stampNo.style.opacity = 0;
      }
    }

    card.addEventListener('pointerdown', onDown);
    card.addEventListener('pointermove', onMove);
    card.addEventListener('pointerup', onUp);
    card.addEventListener('pointercancel', () => release());
  }

  /** Animate the card away, then advance the deck. */
  function flyOut(direction, done) {
    const card = $('#swipe-card');
    if (!card) { done(); return; }
    card.classList.add('is-settling', direction === 'interested' ? 'fly-right' : 'fly-left');
    setTimeout(done, 240);
  }

  async function decide(action) {
    if (state.busy) return;
    const profile = state.deck[state.index];
    if (!profile) return;

    if (action === 'skip') {
      state.skipped.add(profile.user_id);
      flyOut('skip', () => { state.index += 1; renderDeck(); });
      return;
    }

    if (!state.hasOwnProfile) {
      showToast('Create your own Study Buddy profile before sending requests.',
        { type: 'error', title: 'Profile needed' });
      const prompt = $('#profile-prompt');
      if (prompt) { prompt.hidden = false; prompt.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return;
    }

    state.busy = true;
    try {
      await api.buddyRequests.send(profile.user_id);
      showToast(`Request sent to ${profile.nickname}. They'll see it in their requests.`,
        { type: 'success', title: 'Interest sent' });
      flyOut('interested', () => { state.index += 1; renderDeck(); });
      Navbar.refreshRequestBadge();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Your request could not be sent.';
      showToast(message, { type: 'error', title: 'Request not sent' });
      // 409 = already requested/matched -> stop showing this card
      if (error instanceof ApiError && (error.status === 409 || error.status === 403)) {
        flyOut('interested', () => { state.index += 1; renderDeck(); });
      }
    } finally {
      state.busy = false;
    }
  }

  /* ---------------- details modal ---------------- */
  async function openDetails(userId, requestId) {
    const body = $('#detail-body');
    showLoading(body, 'Loading profile…');
    detailModal.open();
    // prepare modal action buttons
    const btnAccept = document.getElementById('detail-accept');
    const btnReject = document.getElementById('detail-reject');
    if (btnAccept) { btnAccept.hidden = true; delete btnAccept.dataset.requestId; }
    if (btnReject) { btnReject.hidden = true; delete btnReject.dataset.requestId; }

    try {
      const { data } = await api.studyBuddy.byUserId(userId);
      const profile = data.profile;
      $('#detail-title').textContent = profile.nickname;
      body.innerHTML = `
        ${buddyHeader(profile)}
        ${buddyMeta(profile)}
        <hr class="divider">
        <h4 class="mb-3" style="font-size:.85rem;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-faint)">Contact</h4>
        ${contactMarkup(profile)}`;
      // If we opened the modal from an incoming request, show accept/reject
      if (requestId) {
        if (btnAccept) { btnAccept.hidden = false; btnAccept.dataset.requestId = requestId; }
        if (btnReject) { btnReject.hidden = false; btnReject.dataset.requestId = requestId; }
      }
    } catch (error) {
      showError(body, error instanceof ApiError ? error.message : 'Unable to load this profile.');
    }
  }

  /* ================================================================== *
   *  CONTACT RENDERING - the single place contact links are produced
   * ================================================================== */
  /**
   * Renders contact buttons ONLY from `profile.contact`, which the backend
   * omits entirely unless the viewer is mutually matched with the owner.
   */
  function contactMarkup(profile) {
    if (!profile.contact_unlocked || !profile.contact) {
      return `<div class="contact-locked">
                <span aria-hidden="true">🔒</span>
                <span>Contact details unlock once <strong>${escapeHtml(profile.nickname)}</strong> accepts your buddy request.</span>
              </div>`;
    }

    const { telegram, viber } = profile.contact;
    const buttons = [];

    if (telegram && telegram.url) {
      buttons.push(`
        <a class="contact-btn contact-btn--telegram" href="${safeUrl(telegram.url)}"
           target="_blank" rel="noopener noreferrer"
           aria-label="Open Telegram chat with ${escapeHtml(profile.nickname)}">
          <span aria-hidden="true">✈️</span><span>Telegram</span>
          <span class="contact-btn__handle">${escapeHtml(telegram.handle || '')}</span>
        </a>`);
    }
    if (viber && viber.url) {
      buttons.push(`
        <a class="contact-btn contact-btn--viber" href="${safeUrl(viber.url)}"
           target="_blank" rel="noopener noreferrer"
           aria-label="Open Viber chat with ${escapeHtml(profile.nickname)}">
          <span aria-hidden="true">📞</span><span>Viber</span>
          <span class="contact-btn__handle">${escapeHtml(viber.handle || '')}</span>
        </a>`);
    }

    if (!buttons.length) {
      return '<p class="text-muted text-sm">This student has not added contact details yet.</p>';
    }
    return `<div class="contact-row">${buttons.join('')}</div>`;
  }

  /* ================================================================== *
   *  REQUESTS
   * ================================================================== */
  async function loadRequests() {
    loadIncoming();
    loadOutgoing();
  }

  async function loadIncoming() {
    const list = $('#incoming-list');
    showLoading(list, 'Loading requests…');
    try {
      const { data } = await api.buddyRequests.incoming({ status: 'pending', limit: 50 });
      const requests = data.requests || [];

      if (!requests.length) {
        showEmptyState(list, 'When another student shows interest, their request appears here.', {
          icon: '📬', title: 'No incoming requests',
        });
        return;
      }

      list.innerHTML = requests.map((r) => {
        const c = r.counterpart || {};
        const shortBio = c.notes ? escapeHtml(c.notes).slice(0, 140) : '';
        return `
          <div class="req-card" data-request="${r.request_id}" data-user="${c.user_id}">
            <div class="req-card__left">
              <span class="avatar avatar--sm" aria-hidden="true">${escapeHtml(initials(c.nickname || c.name))}</span>
            </div>
            <div class="req-card__body grow">
              <div class="row-between">
                <div>
                  <strong style="display:block;color:var(--teal-900)">${escapeHtml(c.nickname || c.name || 'Student')}</strong>
                  <span class="text-sm text-muted">${escapeHtml(c.name || '')}${c.semester ? ` · ${escapeHtml(c.semester)}` : ''}${c.academic_year ? ` · ${escapeHtml(c.academic_year)}` : ''}</span>
                </div>
                <div class="text-sm text-muted">${escapeHtml(timeAgo(r.created_at))}</div>
              </div>
              <p class="text-sm text-muted mt-2">${shortBio || '<span class="text-muted text-sm">No bio provided</span>'}</p>
            </div>
            <div class="req-card__actions">
              <button type="button" class="btn btn-ghost btn-sm" data-view="view" data-user="${c.user_id}" data-request="${r.request_id}">View Profile</button>
              <button type="button" class="btn btn-danger btn-sm" data-reject="${r.request_id}">Reject</button>
              <button type="button" class="btn btn-success btn-sm" data-accept="${r.request_id}">Accept</button>
            </div>
          </div>`;
      }).join('');

      // Open profile modal when clicking the card or the View Profile button
      list.querySelectorAll('.req-card').forEach((el) => {
        el.addEventListener('click', (ev) => {
          // prevent clicks on buttons bubbling to card
          if (ev.target && ev.target.closest('button')) return;
          const userId = el.dataset.user;
          const requestId = el.dataset.request;
          openDetails(userId, requestId);
        });
      });

      list.querySelectorAll('[data-view]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          openDetails(btn.dataset.user, btn.dataset.request);
        });
      });
      // Card-level accept/reject buttons
      list.querySelectorAll('[data-accept]').forEach((btn) => {
        btn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const requestId = btn.dataset.accept;
          if (!requestId) return;
          await respond('accept', requestId, btn);
        });
      });
      list.querySelectorAll('[data-reject]').forEach((btn) => {
        btn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const requestId = btn.dataset.reject;
          if (!requestId) return;
          await respond('reject', requestId, btn);
        });
      });
    } catch (error) {
      showError(list, 'Unable to load your incoming requests.', loadIncoming);
    }
  }

  async function loadOutgoing() {
    const list = $('#outgoing-list');
    showLoading(list, 'Loading sent requests…');
    try {
      const { data } = await api.buddyRequests.outgoing({ limit: 50 });
      const requests = data.requests || [];

      if (!requests.length) {
        showEmptyState(list, 'Requests you send from the Discover tab will show up here.', {
          icon: '📤', title: 'No sent requests',
        });
        return;
      }

      list.innerHTML = requests.map((r) => {
        const c = r.counterpart || {};
        // Pending and rejected rows deliberately carry NO contact information.
        const canCancel = r.status === 'pending';
        return `
          <div class="req-row">
            <span class="avatar avatar--sm" aria-hidden="true">${escapeHtml(initials(c.nickname || c.name))}</span>
            <span class="grow">
              <strong style="display:block;color:var(--teal-900)">${escapeHtml(c.nickname || c.name || 'Student')}</strong>
              <span class="text-sm text-muted">${escapeHtml(timeAgo(r.created_at))}</span>
            </span>
            <span class="badge badge--${escapeHtml(r.status)}">${escapeHtml(UIT.titleCase(r.status))}</span>
            ${canCancel ? `<span class="req-row__actions">
              <button type="button" class="btn btn-ghost btn-sm" data-cancel="${r.request_id}">Cancel</button>
            </span>` : ''}
          </div>`;
      }).join('');

      list.querySelectorAll('[data-cancel]').forEach((btn) => {
        btn.addEventListener('click', () => cancelRequest(btn.dataset.cancel, btn));
      });
    } catch (error) {
      showError(list, 'Unable to load the requests you sent.', loadOutgoing);
    }
  }

  /** Accept or reject an incoming request (receiver-only, enforced by the API). */
  async function respond(action, requestId, button) {
    setButtonLoading(button, true, action === 'accept' ? 'Accepting…' : 'Rejecting…');
    try {
      if (action === 'accept') {
        const { data } = await api.buddyRequests.accept(requestId);
        const nickname = data.match && data.match.profile ? data.match.profile.nickname : 'your new buddy';
        showToast(`It's a match! You can now contact ${nickname}.`, { type: 'success', title: 'Matched 🎉' });
      } else {
        await api.buddyRequests.reject(requestId);
        showToast('Request rejected. Their contact stays hidden.', { type: 'info', title: 'Request declined' });
      }
      loadIncoming();
      loadMatches();
      Navbar.refreshRequestBadge();
    } catch (error) {
      setButtonLoading(button, false);
      showToast(error instanceof ApiError ? error.message : 'Could not update this request.',
        { type: 'error', title: 'Action failed' });
      loadIncoming();
    }
  }

  async function cancelRequest(requestId, button) {
    setButtonLoading(button, true, 'Cancelling…');
    try {
      await api.buddyRequests.cancel(requestId);
      showToast('Request withdrawn.', { type: 'success', title: 'Cancelled' });
      loadOutgoing();
    } catch (error) {
      setButtonLoading(button, false);
      showToast(error instanceof ApiError ? error.message : 'Could not cancel this request.', { type: 'error' });
    }
  }

  /* ================================================================== *
   *  MATCHES - the only list that shows contact details
   * ================================================================== */
  async function loadMatches() {
    const area = $('#matches-area');
    showLoading(area, 'Loading your matches…');

    try {
      const { data } = await api.matches.list({ limit: 50 });
      const matches = data.matches || [];

      if (!matches.length) {
        showEmptyState(area, 'Once someone accepts your request, you will both see each other here with contact details unlocked.', {
          icon: '🤝', title: 'No matches yet',
          actionLabel: 'Find study buddies',
          onAction: () => document.getElementById('tab-discover').click(),
        });
        return;
      }

      area.innerHTML = `<div class="grid grid--2">${matches.map(matchCard).join('')}</div>`;
    } catch (error) {
      showError(area, 'Unable to load your matches.', loadMatches);
    }
  }

  function matchCard(match) {
    const p = match.profile;
    const user = match.user || {};

    if (!p) {
      return `<article class="card"><div class="card__body">
          <div class="buddy__top">
            <span class="avatar" aria-hidden="true">${escapeHtml(initials(user.name))}</span>
            <div class="grow"><h3>${escapeHtml(user.name || 'Student')}</h3>
              <p class="text-sm" style="margin:0">This student removed their study buddy profile.</p></div>
          </div></div></article>`;
    }

    return `
      <article class="card">
        <div class="card__body">
          ${buddyHeader(p)}
          ${buddyMeta(p)}
          <hr class="divider">
          <p class="text-sm text-muted mb-3">Matched ${escapeHtml(timeAgo(match.matched_at))}</p>
          ${contactMarkup(p)}
        </div>
      </article>`;
  }
})(window, document);
