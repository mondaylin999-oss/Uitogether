/* ==========================================================================
   campus-life.js - Competitions (admin-managed) + Lost & Found (student posts).

   PERMISSIONS: admin-only controls are hidden for students purely as UX.
   The backend mounts authenticate + requireAdmin on every write route, so a
   student who forged a request still receives 403. Nothing here tries to
   work around that.
   ========================================================================== */
(function (window, document) {
  'use strict';

  const UIT = window.UIT;
  const {
    $, api, Auth, Navbar, ApiError, escapeHtml, safeUrl, titleCase,
    formatDate, formatTime, timeAgo, showToast, showLoading, showError,
    showEmptyState, setButtonLoading, createModal, initTabs, debounce,
    clearFieldErrors, applyServerFieldErrors, setFieldError,
  } = UIT;

  const state = { user: null, isAdmin: false };
  let compModal = null;
  let lfModal = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const user = await Auth.requireAuth();
    if (!user) return;

    state.user = user;
    state.isAdmin = user.role === 'admin';

    Navbar.renderNavbar(user);
    compModal = createModal('comp-modal');
    lfModal = createModal('lf-modal');

    const tabs = initTabs('.tabs', (tabId) => {
      if (tabId === 'tab-lostfound') loadLostFound();
      if (tabId === 'tab-competitions') loadCompetitions();
    });

    // Deep links (also on hashchange - a same-page hash change does not reload).
    const applyHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'lost-found') tabs.selectById('tab-lostfound');
      else if (hash === 'competitions') tabs.selectById('tab-competitions');
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);

    // admin-only affordance
    if (state.isAdmin) {
      const btn = $('#comp-create-btn');
      btn.hidden = false;
      btn.addEventListener('click', () => openCompForm(null));
    }

    wireCompetitionFilters();
    wireLostFoundFilters();
    wireCompForm();
    wireLostFoundForm();

    loadCompetitions();
  });

  /* ================================================================== *
   *  COMPETITIONS
   * ================================================================== */
  function wireCompetitionFilters() {
    $('#comp-scope').addEventListener('change', loadCompetitions);
    $('#comp-search').addEventListener('input', debounce(loadCompetitions, 380));
  }

  async function loadCompetitions() {
    const area = $('#comp-area');
    showLoading(area, 'Loading competitions…');

    try {
      const { data } = await api.competitions.list({
        scope: $('#comp-scope').value,
        q: $('#comp-search').value.trim(),
        sort: 'event_date',
        limit: 50,
      });
      const items = data.competitions || [];

      if (!items.length) {
        showEmptyState(area, state.isAdmin
          ? 'Create the first competition so students can see it.'
          : 'Check back soon — new events are posted by the admin team.', {
          icon: '🏆', title: 'No competitions available',
          actionLabel: state.isAdmin ? 'Create competition' : null,
          onAction: () => openCompForm(null),
        });
        return;
      }

      area.innerHTML = `<div class="grid grid--3">${items.map(competitionCard).join('')}</div>`;

      if (state.isAdmin) {
        area.querySelectorAll('[data-comp-edit]').forEach((btn) =>
          btn.addEventListener('click', () => openCompForm(JSON.parse(btn.dataset.compEdit))));
        area.querySelectorAll('[data-comp-delete]').forEach((btn) =>
          btn.addEventListener('click', () => deleteCompetition(btn.dataset.compDelete, btn.dataset.compTitle)));
      }
    } catch (error) {
      showError(area, error instanceof ApiError && error.isNetwork
        ? error.message : 'Unable to load competitions.', loadCompetitions);
    }
  }

  function competitionCard(c) {
    const when = [formatDate(c.event_date), c.event_time ? formatTime(c.event_time) : '']
      .filter(Boolean).join(' · ');
    const isPast = c.event_date < new Date().toISOString().slice(0, 10);

    return `
      <article class="card card--hover">
        ${c.image_url ? `<img class="card__media" src="${safeUrl(c.image_url)}" alt="" loading="lazy">` : ''}
        <div class="card__body">
          <div class="row mb-3">
            <span class="badge${isPast ? ' badge--closed' : ''}">${isPast ? 'Past' : 'Upcoming'}</span>
            ${c.organizer ? `<span class="badge">${escapeHtml(c.organizer)}</span>` : ''}
          </div>
          <h3 class="mb-3">${escapeHtml(c.title)}</h3>
          ${c.description ? `<p class="text-sm mb-3">${escapeHtml(c.description)}</p>` : ''}
          <div class="meta-list">
            <div class="meta"><span class="meta__label">When</span><span class="meta__value">${escapeHtml(when)}</span></div>
            ${c.location ? `<div class="meta"><span class="meta__label">Where</span><span class="meta__value">${escapeHtml(c.location)}</span></div>` : ''}
          </div>
          ${state.isAdmin ? `
          <div class="row mt-4">
            <button type="button" class="btn btn-ghost btn-sm"
                    data-comp-edit='${escapeHtml(JSON.stringify(c))}'>Edit</button>
            <button type="button" class="btn btn-danger btn-sm"
                    data-comp-delete="${c.competition_id}"
                    data-comp-title="${escapeHtml(c.title)}">Delete</button>
          </div>` : ''}
        </div>
      </article>`;
  }

  function openCompForm(competition) {
    const form = $('#comp-form');
    clearFieldErrors(form);
    form.reset();

    $('#comp-modal-title').textContent = competition ? 'Edit competition' : 'New competition';
    $('#comp-id').value = competition ? competition.competition_id : '';

    if (competition) {
      $('#comp-title').value = competition.title || '';
      $('#comp-description').value = competition.description || '';
      $('#comp-date').value = competition.event_date || '';
      $('#comp-time').value = (competition.event_time || '').slice(0, 5);
      $('#comp-location').value = competition.location || '';
      $('#comp-organizer').value = competition.organizer || '';
      $('#comp-image').value = competition.image_url || '';
    }
    compModal.open();
  }

  function wireCompForm() {
    const form = $('#comp-form');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(form);

      const id = $('#comp-id').value;
      const payload = {
        title: $('#comp-title').value.trim(),
        description: $('#comp-description').value.trim() || null,
        event_date: $('#comp-date').value,
        event_time: $('#comp-time').value || null,
        location: $('#comp-location').value.trim() || null,
        organizer: $('#comp-organizer').value.trim() || null,
        image_url: $('#comp-image').value.trim() || null,
      };

      if (payload.title.length < 3) { setFieldError('comp-title', 'Title must be at least 3 characters.'); return; }
      if (!payload.event_date) { setFieldError('comp-date', 'Please choose a date.'); return; }

      const submit = $('#comp-submit');
      setButtonLoading(submit, true, 'Saving…');
      try {
        if (id) await api.competitions.update(id, payload);
        else await api.competitions.create(payload);

        showToast(id ? 'Competition updated.' : 'Competition published for all students.',
          { type: 'success', title: 'Saved' });
        compModal.close();
        loadCompetitions();
      } catch (error) {
        handleFormError(error, form, {
          title: 'comp-title', description: 'comp-description', event_date: 'comp-date',
          event_time: 'comp-time', location: 'comp-location', organizer: 'comp-organizer',
          image_url: 'comp-image_url',
        }, 'Only administrators can manage competitions.');
      } finally {
        setButtonLoading(submit, false);
      }
    });
  }

  async function deleteCompetition(id, title) {
    const ok = await UIT.confirmDialog({
      title: 'Delete this competition?',
      message: `"${title}" will be removed for every student. This cannot be undone.`,
      confirmLabel: 'Delete competition',
    });
    if (!ok) return;
    try {
      await api.competitions.remove(id);
      showToast('Competition deleted.', { type: 'success', title: 'Removed' });
      loadCompetitions();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'Could not delete this competition.',
        { type: 'error', title: 'Delete failed' });
    }
  }

  /* ================================================================== *
   *  LOST & FOUND
   * ================================================================== */
  function wireLostFoundFilters() {
    ['#lf-type', '#lf-status'].forEach((sel) => $(sel).addEventListener('change', loadLostFound));
    $('#lf-mine').addEventListener('change', loadLostFound);
    $('#lf-create-btn').addEventListener('click', () => openLostFoundForm(null));
  }

  async function loadLostFound() {
    const area = $('#lf-area');
    showLoading(area, 'Loading lost & found…');

    try {
      const query = {
        type: $('#lf-type').value,
        status: $('#lf-status').value,
        limit: 50,
      };
      if ($('#lf-mine').checked) query.mine = 'true';

      const { data } = await api.lostFound.list(query);
      const items = data.items || [];

      if (!items.length) {
        showEmptyState(area, 'Lost something on campus, or found an item? Post it here so it can find its owner.', {
          icon: '🔎', title: 'No lost & found posts yet',
          actionLabel: 'Report an item', onAction: () => openLostFoundForm(null),
        });
        return;
      }

      area.innerHTML = `<div class="grid grid--3">${items.map(lostFoundCard).join('')}</div>`;

      area.querySelectorAll('[data-lf-edit]').forEach((btn) =>
        btn.addEventListener('click', () => openLostFoundForm(JSON.parse(btn.dataset.lfEdit))));
      area.querySelectorAll('[data-lf-resolve]').forEach((btn) =>
        btn.addEventListener('click', () => setStatus(btn.dataset.lfResolve, btn.dataset.lfNext, btn)));
      area.querySelectorAll('[data-lf-delete]').forEach((btn) =>
        btn.addEventListener('click', () => deleteItem(btn.dataset.lfDelete, btn.dataset.lfTitle)));
    } catch (error) {
      showError(area, error instanceof ApiError && error.isNetwork
        ? error.message : 'Unable to load lost & found posts.', loadLostFound);
    }
  }

  function lostFoundCard(item) {
    const isOwner = item.user_id === state.user.user_id;
    const canManage = isOwner || state.isAdmin;   // mirrors the backend rule
    const resolved = item.status === 'resolved';

    return `
      <article class="card card--hover">
        ${item.image_url ? `<img class="card__media" src="${safeUrl(item.image_url)}" alt="" loading="lazy">` : ''}
        <div class="card__body">
          <div class="row mb-3">
            <span class="badge badge--${item.type === 'lost' ? 'lost' : 'found'}">${escapeHtml(titleCase(item.type))}</span>
            ${resolved ? '<span class="badge badge--resolved">Resolved</span>' : ''}
            ${isOwner ? '<span class="badge">Your post</span>' : ''}
          </div>
          <h3 class="mb-3">${escapeHtml(item.title)}</h3>
          ${item.description ? `<p class="text-sm mb-3">${escapeHtml(item.description)}</p>` : ''}
          <div class="meta-list">
            ${item.location ? `<div class="meta"><span class="meta__label">Location</span><span class="meta__value">${escapeHtml(item.location)}</span></div>` : ''}
            ${item.item_date ? `<div class="meta"><span class="meta__label">Date</span><span class="meta__value">${escapeHtml(formatDate(item.item_date))}</span></div>` : ''}
            ${item.contact_info ? `<div class="meta"><span class="meta__label">Contact</span><span class="meta__value">${escapeHtml(item.contact_info)}</span></div>` : ''}
          </div>
          <p class="text-sm text-muted mt-3">
            Posted by ${escapeHtml(item.posted_by ? item.posted_by.name : 'a student')} · ${escapeHtml(timeAgo(item.created_at))}
          </p>
          ${canManage ? `
          <div class="row mt-4">
            <button type="button" class="btn btn-ghost btn-sm" data-lf-edit='${escapeHtml(JSON.stringify(item))}'>Edit</button>
            <button type="button" class="btn ${resolved ? 'btn-ghost' : 'btn-success'} btn-sm"
                    data-lf-resolve="${item.item_id}" data-lf-next="${resolved ? 'active' : 'resolved'}">
              ${resolved ? 'Reopen' : 'Mark resolved'}
            </button>
            <button type="button" class="btn btn-danger btn-sm"
                    data-lf-delete="${item.item_id}" data-lf-title="${escapeHtml(item.title)}">Delete</button>
          </div>` : ''}
        </div>
      </article>`;
  }

  function openLostFoundForm(item) {
    const form = $('#lf-form');
    clearFieldErrors(form);
    form.reset();

    $('#lf-modal-title').textContent = item ? 'Edit your post' : 'Report an item';
    $('#lf-submit').textContent = item ? 'Save changes' : 'Post item';
    $('#lf-id').value = item ? item.item_id : '';

    if (item) {
      $('#lf-form-type').value = item.type;
      $('#lf-title').value = item.title || '';
      $('#lf-description').value = item.description || '';
      $('#lf-location').value = item.location || '';
      $('#lf-date').value = item.item_date || '';
      $('#lf-contact').value = item.contact_info || '';
      // populate preview if an image URL exists
      if (item.image_url) {
        $('#lf-image-preview').src = item.image_url;
        $('#lf-image-preview-wrap').hidden = false;
        $('#lf-remove-image').value = '';
      } else {
        $('#lf-image-preview-wrap').hidden = true;
        $('#lf-image-preview').src = '';
        $('#lf-remove-image').value = '';
      }
    }
    lfModal.open();
  }

  function wireLostFoundForm() {
    const form = $('#lf-form');
    if (!form) return;

    const fileInput = $('#lf-image-file');
    const previewWrap = $('#lf-image-preview-wrap');
    const previewImg = $('#lf-image-preview');
    const removeFlag = $('#lf-remove-image');
    const changeBtn = $('#lf-image-change');
    const removeBtn = $('#lf-image-remove');

    // helper to reset file selection
    function clearSelection() {
      fileInput.value = '';
      previewImg.src = '';
      previewWrap.hidden = true;
      removeFlag.value = '1';
    }

    fileInput.addEventListener('change', () => {
      removeFlag.value = '';
      const file = fileInput.files[0];
      if (!file) return;
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(file.type)) {
        showToast('Invalid file type. Please choose a JPG, PNG or WEBP image.', { type: 'error' });
        fileInput.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast('Image is too large. Max size is 5MB.', { type: 'error' });
        fileInput.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImg.src = e.target.result;
        previewWrap.hidden = false;
      };
      reader.readAsDataURL(file);
    });

    changeBtn.addEventListener('click', () => fileInput.click());
    removeBtn.addEventListener('click', clearSelection);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(form);

      const id = $('#lf-id').value;
      const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;
      const payloadIsForm = hasFile || $('#lf-remove-image').value === '1';

      const common = {
        type: $('#lf-form-type').value,
        title: $('#lf-title').value.trim(),
        description: $('#lf-description').value.trim() || null,
        location: $('#lf-location').value.trim() || null,
        item_date: $('#lf-date').value || null,
        contact_info: $('#lf-contact').value.trim() || null,
      };

      if (payloadIsForm) {
        var formData = new FormData();
        Object.entries(common).forEach(([k, v]) => { if (v !== null) formData.append(k, v); });
        if (hasFile) formData.append('image', fileInput.files[0]);
        // signal removal of existing image on update
        if ($('#lf-remove-image').value === '1') formData.append('image_url', '');
      } else {
        var payload = Object.assign({}, common, { image_url: null });
      }

      if (common.title.length < 3) { setFieldError('lf-title', 'Title must be at least 3 characters.'); return; }

      const submit = $('#lf-submit');
      setButtonLoading(submit, true, 'Saving…');
      try {
        if (id) {
          if (payloadIsForm) await api.lostFound.update(id, formData);
          else await api.lostFound.update(id, payload);
        } else {
          if (payloadIsForm) await api.lostFound.create(formData);
          else await api.lostFound.create(payload);
        }

        showToast(id ? 'Your post was updated.' : 'Your post is now on the board.',
          { type: 'success', title: 'Saved' });
        lfModal.close();
        loadLostFound();
      } catch (error) {
        handleFormError(error, form, {
          type: 'lf-type', title: 'lf-title', description: 'lf-description',
          location: 'lf-location', item_date: 'lf-item_date',
          contact_info: 'lf-contact_info', image_url: 'lf-image_url',
        }, 'You can only modify your own posts.');
      } finally {
        setButtonLoading(submit, false);
      }
    });
  }

  async function setStatus(id, next, button) {
    setButtonLoading(button, true, 'Updating…');
    try {
      await api.lostFound.setStatus(id, next);
      showToast(next === 'resolved' ? 'Marked as resolved.' : 'Post reopened.',
        { type: 'success', title: 'Updated' });
      loadLostFound();
    } catch (error) {
      setButtonLoading(button, false);
      showToast(error instanceof ApiError ? error.message : 'Could not update this post.', { type: 'error' });
    }
  }

  async function deleteItem(id, title) {
    const ok = await UIT.confirmDialog({
      title: 'Delete this post?',
      message: `"${title}" will be removed from the lost & found board. This cannot be undone.`,
      confirmLabel: 'Delete post',
    });
    if (!ok) return;
    try {
      await api.lostFound.remove(id);
      showToast('Post deleted.', { type: 'success', title: 'Removed' });
      loadLostFound();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'Could not delete this post.',
        { type: 'error', title: 'Delete failed' });
    }
  }

  /* ================================================================== *
   *  Shared form error handling
   * ================================================================== */
  function handleFormError(error, form, fieldMap, forbiddenMessage) {
    if (!(error instanceof ApiError)) {
      showToast('Something went wrong. Please try again.', { type: 'error' });
      return;
    }
    if (error.isNetwork) { showToast(error.message, { type: 'error', title: 'Server unreachable' }); return; }
    if (error.status === 403) { showToast(forbiddenMessage, { type: 'error', title: 'Not allowed' }); return; }
    if (error.status === 422 && applyServerFieldErrors(error.errors, fieldMap)) {
      showToast(error.firstFieldMessage || error.message, { type: 'error', title: 'Check the form' });
      return;
    }
    showToast(error.message, { type: 'error', title: 'Could not save' });
  }
})(window, document);
