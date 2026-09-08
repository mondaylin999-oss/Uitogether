/* ==========================================================================
   pages/admin.js - admin management console.

   AUTHORIZATION MODEL (important):
   Guard.requireAdminPage() decides whether this PAGE renders, using the role
   the backend just returned from GET /api/auth/me - not the cached copy. That
   is a routing convenience, NOT the security boundary.

   The real boundary is server-side: every write below hits a route that mounts
   `authenticate + requireAdmin`, so a student who edits localStorage, forces
   this URL open, or calls the API by hand still receives 403. This file never
   attempts to work around that, and every 403 is surfaced honestly.
   ========================================================================== */
(function (window, document) {
  'use strict';

  const UIT = window.UIT;
  const {
    $, $$, api, Guard, Navbar, ApiError, escapeHtml, titleCase,
    formatDate, formatTime, timeAgo, showToast, showLoading, showError,
    showEmptyState, setButtonLoading, createModal, initTabs, confirmDialog,
    clearFieldErrors, setFieldError, applyServerFieldErrors,
  } = UIT;

  const state = { user: null };
  let compModal = null;
  let pollModal = null;

  document.addEventListener('DOMContentLoaded', async () => {
    // Redirects non-admins to the dashboard before anything renders.
    const user = await Guard.requireAdminPage();
    if (!user) return;

    state.user = user;
    Navbar.renderNavbar(user);
    compModal = createModal('acomp-modal');
    pollModal = createModal('apoll-modal');

    initTabs('.tabs', (tabId) => {
      if (tabId === 'tab-polls') loadPolls();
      if (tabId === 'tab-modlf') loadLostFound();
      if (tabId === 'tab-comps') loadCompetitions();
    });

    $('#admin-new-comp').addEventListener('click', () => openCompForm(null));
    $('#admin-new-poll').addEventListener('click', openPollForm);
    wireCompForm();
    wirePollForm();

    loadStats();
    loadCompetitions();
  });

  /* ================================================================== *
   *  Overview
   * ================================================================== */
  async function loadStats() {
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    const settle = (p) => p.then((r) => r).catch(() => null);

    const [comps, upcoming, polls, lf] = await Promise.all([
      settle(api.competitions.list({ scope: 'all', limit: 1 })),
      settle(api.competitions.list({ scope: 'upcoming', limit: 1 })),
      settle(api.polls.list({ status: 'open', limit: 1 })),
      settle(api.lostFound.list({ status: 'active', limit: 1 })),
    ]);

    set('#stat-comps',    comps    ? comps.meta.total    : '—');
    set('#stat-upcoming', upcoming ? upcoming.meta.total : '—');
    set('#stat-polls',    polls    ? polls.meta.total    : '—');
    set('#stat-lf',       lf       ? lf.meta.total       : '—');
  }

  /* ================================================================== *
   *  Competitions  (admin-only writes)
   * ================================================================== */
  async function loadCompetitions() {
    const list = $('#admin-comp-list');
    showLoading(list, 'Loading competitions…');

    try {
      const { data } = await api.competitions.list({ scope: 'all', sort: 'event_date', limit: 100 });
      const items = data.competitions || [];

      if (!items.length) {
        showEmptyState(list, 'No competitions have been published yet.', {
          icon: '🏆', title: 'Nothing scheduled',
          actionLabel: 'Create the first one', onAction: () => openCompForm(null),
        });
        return;
      }

      list.innerHTML = items.map((c) => {
        const when = [formatDate(c.event_date), c.event_time ? formatTime(c.event_time) : ''].filter(Boolean).join(' · ');
        const past = c.event_date < new Date().toISOString().slice(0, 10);
        return `
          <div class="req-row">
            <span class="avatar avatar--sm" aria-hidden="true"
                  style="background:var(--teal-100);color:var(--teal-800)">🏆</span>
            <span class="grow">
              <strong style="display:block;color:var(--teal-900)">${escapeHtml(c.title)}</strong>
              <span class="text-sm text-muted">${escapeHtml(when)}${c.location ? ' · ' + escapeHtml(c.location) : ''}</span>
            </span>
            <span class="badge${past ? ' badge--closed' : ''}">${past ? 'Past' : 'Upcoming'}</span>
            <span class="req-row__actions">
              <button type="button" class="btn btn-ghost btn-sm" data-edit='${escapeHtml(JSON.stringify(c))}'>Edit</button>
              <button type="button" class="btn btn-danger btn-sm"
                      data-del="${c.competition_id}" data-title="${escapeHtml(c.title)}">Delete</button>
            </span>
          </div>`;
      }).join('');

      $$('[data-edit]', list).forEach((b) => b.addEventListener('click', () => openCompForm(JSON.parse(b.dataset.edit))));
      $$('[data-del]', list).forEach((b) => b.addEventListener('click', () => deleteCompetition(b.dataset.del, b.dataset.title)));
    } catch (error) {
      showError(list, adminMessage(error, 'Unable to load competitions.'), loadCompetitions);
    }
  }

  function openCompForm(competition) {
    const form = $('#acomp-form');
    clearFieldErrors(form);
    form.reset();

    $('#acomp-title').textContent = competition ? 'Edit competition' : 'New competition';
    $('#acomp-id').value = competition ? competition.competition_id : '';
    if (competition) {
      $('#acomp-title-input').value = competition.title || '';
      $('#acomp-desc').value = competition.description || '';
      $('#acomp-date').value = competition.event_date || '';
      $('#acomp-time').value = (competition.event_time || '').slice(0, 5);
      $('#acomp-loc').value = competition.location || '';
      $('#acomp-org').value = competition.organizer || '';
      $('#acomp-img').value = competition.image_url || '';
    }
    compModal.open();
  }

  function wireCompForm() {
    $('#acomp-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = $('#acomp-form');
      clearFieldErrors(form);

      const id = $('#acomp-id').value;
      const payload = {
        title: $('#acomp-title-input').value.trim(),
        description: $('#acomp-desc').value.trim() || null,
        event_date: $('#acomp-date').value,
        event_time: $('#acomp-time').value || null,
        location: $('#acomp-loc').value.trim() || null,
        organizer: $('#acomp-org').value.trim() || null,
        image_url: $('#acomp-img').value.trim() || null,
      };

      if (payload.title.length < 3) { setFieldError('acomp-title-input', 'Title must be at least 3 characters.'); return; }
      if (!payload.event_date) { setFieldError('acomp-date', 'Please choose a date.'); return; }

      const submit = $('#acomp-submit');
      setButtonLoading(submit, true, 'Saving…');
      try {
        if (id) await api.competitions.update(id, payload);
        else await api.competitions.create(payload);

        showToast(id ? 'Competition updated.' : 'Competition published for all students.',
          { type: 'success', title: 'Saved' });
        compModal.close();
        loadCompetitions();
        loadStats();
      } catch (error) {
        handleWriteError(error, {
          title: 'acomp-title-input', description: 'acomp-desc', event_date: 'acomp-date',
          event_time: 'acomp-time', location: 'acomp-loc', organizer: 'acomp-org', image_url: 'acomp-img',
        });
      } finally {
        setButtonLoading(submit, false);
      }
    });
  }

  async function deleteCompetition(id, title) {
    const ok = await confirmDialog({
      title: 'Delete this competition?',
      message: `"${title}" will be removed for every student. This cannot be undone.`,
      confirmLabel: 'Delete competition',
    });
    if (!ok) return;

    try {
      await api.competitions.remove(id);
      showToast('Competition deleted.', { type: 'success', title: 'Removed' });
      loadCompetitions();
      loadStats();
    } catch (error) {
      showToast(adminMessage(error, 'Could not delete this competition.'), { type: 'error', title: 'Delete failed' });
    }
  }

  /* ================================================================== *
   *  Polls  (admin-only writes)
   * ================================================================== */
  async function loadPolls() {
    const list = $('#admin-poll-list');
    showLoading(list, 'Loading polls…');

    try {
      const { data } = await api.polls.list({ limit: 100 });
      const polls = data.polls || [];

      if (!polls.length) {
        showEmptyState(list, 'No polls have been created yet.', {
          icon: '🗳️', title: 'No polls', actionLabel: 'Create a poll', onAction: openPollForm,
        });
        return;
      }

      list.innerHTML = polls.map((p) => {
        const closed = p.status === 'closed';
        return `
          <div class="req-row">
            <span class="avatar avatar--sm" aria-hidden="true"
                  style="background:var(--teal-100);color:var(--teal-800)">🗳️</span>
            <span class="grow">
              <strong style="display:block;color:var(--teal-900)">${escapeHtml(p.question)}</strong>
              <span class="text-sm text-muted">
                ${p.total_votes} vote${p.total_votes === 1 ? '' : 's'} ·
                ${(p.options || []).length} options · ${escapeHtml(timeAgo(p.created_at))}
              </span>
            </span>
            <span class="badge${closed ? ' badge--closed' : ''}">${closed ? 'Closed' : 'Open'}</span>
            <span class="req-row__actions">
              <button type="button" class="btn btn-ghost btn-sm"
                      data-toggle="${p.poll_id}" data-next="${closed ? 'open' : 'closed'}">
                ${closed ? 'Reopen' : 'Close'}
              </button>
              <button type="button" class="btn btn-danger btn-sm"
                      data-pdel="${p.poll_id}" data-q="${escapeHtml(p.question)}">Delete</button>
            </span>
          </div>`;
      }).join('');

      $$('[data-toggle]', list).forEach((b) =>
        b.addEventListener('click', () => togglePoll(b.dataset.toggle, b.dataset.next, b)));
      $$('[data-pdel]', list).forEach((b) =>
        b.addEventListener('click', () => deletePoll(b.dataset.pdel, b.dataset.q)));
    } catch (error) {
      showError(list, adminMessage(error, 'Unable to load polls.'), loadPolls);
    }
  }

  function optionRow(index) {
    return `
      <div class="row" style="margin-bottom:8px;flex-wrap:nowrap">
        <label class="sr-only" for="apoll-opt-${index}">Option ${index + 1}</label>
        <input class="input apoll-opt" id="apoll-opt-${index}" type="text"
               placeholder="Option ${index + 1}" maxlength="200">
        <button type="button" class="btn btn-ghost btn-icon" data-rm
                aria-label="Remove option ${index + 1}">&times;</button>
      </div>`;
  }

  function bindRemove() {
    $$('[data-rm]').forEach((b) => {
      b.onclick = () => {
        if ($$('.apoll-opt').length <= 2) { showToast('A poll needs at least 2 options.', { type: 'info' }); return; }
        b.closest('.row').remove();
      };
    });
  }

  function openPollForm() {
    const form = $('#apoll-form');
    clearFieldErrors(form);
    form.reset();
    $('#apoll-options').innerHTML = [0, 1, 2].map(optionRow).join('');
    bindRemove();
    pollModal.open();
  }

  function wirePollForm() {
    $('#apoll-add').addEventListener('click', () => {
      const n = $$('.apoll-opt').length;
      if (n >= 10) { showToast('A poll can have at most 10 options.', { type: 'info' }); return; }
      $('#apoll-options').insertAdjacentHTML('beforeend', optionRow(n));
      bindRemove();
    });

    $('#apoll-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = $('#apoll-form');
      clearFieldErrors(form);

      const question = $('#apoll-question').value.trim();
      const options = $$('.apoll-opt').map((i) => i.value.trim()).filter(Boolean);

      if (question.length < 5) { setFieldError('apoll-question', 'Question must be at least 5 characters.'); return; }
      if (options.length < 2) { setFieldError('apoll-options', 'Provide at least 2 non-empty options.'); return; }
      if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
        setFieldError('apoll-options', 'Options must be unique.'); return;
      }

      const submit = $('#apoll-submit');
      setButtonLoading(submit, true, 'Creating…');
      try {
        await api.polls.create({ question, description: $('#apoll-desc').value.trim() || null, options });
        showToast('Poll published — students can vote now.', { type: 'success', title: 'Poll created' });
        pollModal.close();
        loadPolls();
        loadStats();
      } catch (error) {
        handleWriteError(error, { question: 'apoll-question', description: 'apoll-desc', options: 'apoll-options' });
      } finally {
        setButtonLoading(submit, false);
      }
    });
  }

  async function togglePoll(id, next, button) {
    setButtonLoading(button, true, 'Updating…');
    try {
      await api.polls.update(id, { status: next });
      showToast(next === 'closed' ? 'Poll closed. No further votes accepted.' : 'Poll reopened.',
        { type: 'success', title: 'Updated' });
      loadPolls();
      loadStats();
    } catch (error) {
      setButtonLoading(button, false);
      showToast(adminMessage(error, 'Could not update this poll.'), { type: 'error' });
    }
  }

  async function deletePoll(id, question) {
    const ok = await confirmDialog({
      title: 'Delete this poll?',
      message: `"${question}" and all of its votes will be permanently removed.`,
      confirmLabel: 'Delete poll',
    });
    if (!ok) return;

    try {
      await api.polls.remove(id);
      showToast('Poll deleted.', { type: 'success', title: 'Removed' });
      loadPolls();
      loadStats();
    } catch (error) {
      showToast(adminMessage(error, 'Could not delete this poll.'), { type: 'error' });
    }
  }

  /* ================================================================== *
   *  Lost & Found moderation
   *  Admins may modify ANY post - enforced by lostFound.service
   *  assertCanModify(), which allows owner OR admin.
   * ================================================================== */
  async function loadLostFound() {
    const list = $('#admin-lf-list');
    showLoading(list, 'Loading posts…');

    try {
      const { data } = await api.lostFound.list({ limit: 100 });
      const items = data.items || [];

      if (!items.length) {
        showEmptyState(list, 'No lost & found posts have been created yet.', { icon: '🔎', title: 'Board is empty' });
        return;
      }

      list.innerHTML = items.map((i) => {
        const resolved = i.status === 'resolved';
        return `
          <div class="req-row">
            <span class="avatar avatar--sm" aria-hidden="true"
                  style="background:var(--teal-100);color:var(--teal-800)">${i.type === 'lost' ? '❓' : '📦'}</span>
            <span class="grow">
              <strong style="display:block;color:var(--teal-900)">${escapeHtml(i.title)}</strong>
              <span class="text-sm text-muted">
                ${escapeHtml(titleCase(i.type))} ·
                ${escapeHtml(i.posted_by ? i.posted_by.name : 'a student')} ·
                ${escapeHtml(timeAgo(i.created_at))}
              </span>
            </span>
            <span class="badge badge--${resolved ? 'resolved' : (i.type === 'lost' ? 'lost' : 'found')}">
              ${resolved ? 'Resolved' : 'Active'}
            </span>
            <span class="req-row__actions">
              <button type="button" class="btn ${resolved ? 'btn-ghost' : 'btn-success'} btn-sm"
                      data-status="${i.item_id}" data-next="${resolved ? 'active' : 'resolved'}">
                ${resolved ? 'Reopen' : 'Resolve'}
              </button>
              <button type="button" class="btn btn-danger btn-sm"
                      data-lfdel="${i.item_id}" data-t="${escapeHtml(i.title)}">Delete</button>
            </span>
          </div>`;
      }).join('');

      $$('[data-status]', list).forEach((b) =>
        b.addEventListener('click', () => setLfStatus(b.dataset.status, b.dataset.next, b)));
      $$('[data-lfdel]', list).forEach((b) =>
        b.addEventListener('click', () => deleteLf(b.dataset.lfdel, b.dataset.t)));
    } catch (error) {
      showError(list, adminMessage(error, 'Unable to load lost & found posts.'), loadLostFound);
    }
  }

  async function setLfStatus(id, next, button) {
    setButtonLoading(button, true, 'Updating…');
    try {
      await api.lostFound.setStatus(id, next);
      showToast(next === 'resolved' ? 'Post marked resolved.' : 'Post reopened.',
        { type: 'success', title: 'Updated' });
      loadLostFound();
      loadStats();
    } catch (error) {
      setButtonLoading(button, false);
      showToast(adminMessage(error, 'Could not update this post.'), { type: 'error' });
    }
  }

  async function deleteLf(id, title) {
    const ok = await confirmDialog({
      title: 'Remove this post?',
      message: `"${title}" will be deleted from the lost & found board. This cannot be undone.`,
      confirmLabel: 'Delete post',
    });
    if (!ok) return;

    try {
      await api.lostFound.remove(id);
      showToast('Post removed.', { type: 'success', title: 'Moderated' });
      loadLostFound();
      loadStats();
    } catch (error) {
      showToast(adminMessage(error, 'Could not remove this post.'), { type: 'error' });
    }
  }

  /* ================================================================== *
   *  Error presentation - a 403 here means the BACKEND refused, which is
   *  the intended behaviour if this account is not really an admin.
   * ================================================================== */
  function adminMessage(error, fallback) {
    if (!(error instanceof ApiError)) return fallback;
    if (error.isNetwork) return error.message;
    if (error.status === 403) return 'The server rejected this action: admin privileges are required.';
    return error.message || fallback;
  }

  function handleWriteError(error, fieldMap) {
    if (!(error instanceof ApiError)) {
      showToast('Something went wrong. Please try again.', { type: 'error' });
      return;
    }
    if (error.isNetwork) { showToast(error.message, { type: 'error', title: 'Server unreachable' }); return; }
    if (error.status === 403) {
      showToast('The server rejected this action: admin privileges are required.',
        { type: 'error', title: 'Not allowed' });
      return;
    }
    if (error.status === 422 && applyServerFieldErrors(error.errors, fieldMap)) {
      showToast(error.firstFieldMessage || error.message, { type: 'error', title: 'Check the form' });
      return;
    }
    showToast(error.message, { type: 'error', title: 'Could not save' });
  }
})(window, document);
