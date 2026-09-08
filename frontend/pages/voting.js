/* ==========================================================================
   voting.js - community polls.

   Results are ALWAYS the numbers the backend returns (vote_count /
   vote_percentage come from the v_poll_results SQL view). Nothing is
   computed optimistically or cached locally. Duplicate voting is prevented
   by the backend's UNIQUE (poll_id, user_id) key - a second attempt gets 409.
   ========================================================================== */
(function (window, document) {
  'use strict';

  const UIT = window.UIT;
  const {
    $, $$, api, Auth, Navbar, ApiError, escapeHtml, timeAgo,
    showToast, showLoading, showError, showEmptyState, setButtonLoading,
    createModal, clearFieldErrors, setFieldError, applyServerFieldErrors,
  } = UIT;

  const state = { user: null, isAdmin: false, busy: false };
  let pollModal = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const user = await Auth.requireAuth();
    if (!user) return;

    state.user = user;
    state.isAdmin = user.role === 'admin';

    Navbar.renderNavbar(user);
    pollModal = createModal('poll-modal');

    if (state.isAdmin) {
      const btn = $('#poll-create-btn');
      btn.hidden = false;
      btn.addEventListener('click', openPollForm);
    }

    $('#poll-status').addEventListener('change', loadPolls);
    wirePollForm();
    loadPolls();
  });

  /* ================================================================== *
   *  List
   * ================================================================== */
  async function loadPolls() {
    const area = $('#poll-area');
    showLoading(area, 'Loading polls…');

    try {
      const { data } = await api.polls.list({ status: $('#poll-status').value, limit: 50 });
      const polls = data.polls || [];

      if (!polls.length) {
        showEmptyState(area, state.isAdmin
          ? 'Create a poll to start collecting student opinions.'
          : 'There are no active polls right now. Check back soon.', {
          icon: '🗳️', title: 'No active polls',
          actionLabel: state.isAdmin ? 'Create poll' : null,
          onAction: openPollForm,
        });
        return;
      }

      area.innerHTML = `<div class="grid grid--2">${polls.map(pollCard).join('')}</div>`;
      wirePollCards(area);
    } catch (error) {
      showError(area, error instanceof ApiError && error.isNetwork
        ? error.message : 'Unable to load polls.', loadPolls);
    }
  }

  function pollCard(poll) {
    const closed = poll.status === 'closed';
    const voted = poll.has_voted;
    // Show results when the user has already voted or the poll is closed.
    const showResults = voted || closed;

    const options = (poll.options || []).map((option) => {
      if (!showResults) {
        return `<div class="poll-option">
                  <button type="button" class="poll-btn" data-vote="${poll.poll_id}" data-option="${option.option_id}">
                    ${escapeHtml(option.option_text)}
                  </button>
                </div>`;
      }
      const mine = option.option_id === poll.my_vote_option_id;
      const pct = Number(option.vote_percentage || 0);
      return `<div class="poll-option">
                <div class="poll-result${mine ? ' is-mine' : ''}"
                     role="img" aria-label="${escapeHtml(option.option_text)}: ${pct}% with ${option.vote_count} vote${option.vote_count === 1 ? '' : 's'}">
                  <div class="poll-result__fill" style="width:${pct}%"></div>
                  <div class="poll-result__content">
                    <span class="poll-result__text">${escapeHtml(option.option_text)}${mine ? ' <strong>· your vote</strong>' : ''}</span>
                    <span class="poll-result__pct">${pct}%</span>
                  </div>
                </div>
                <p class="text-sm text-muted" style="margin:4px 2px 0">${option.vote_count} vote${option.vote_count === 1 ? '' : 's'}</p>
              </div>`;
    }).join('');

    return `
      <article class="card" data-poll="${poll.poll_id}">
        <div class="card__head">
          <div class="row-between">
            <h3 style="margin:0">${escapeHtml(poll.question)}</h3>
            <span class="badge${closed ? ' badge--closed' : ''}">${closed ? 'Closed' : 'Open'}</span>
          </div>
        </div>
        <div class="card__body">
          ${poll.description ? `<p class="text-sm mb-3">${escapeHtml(poll.description)}</p>` : ''}
          <div class="poll-options">${options}</div>

          <div class="poll-meta">
            <span>${poll.total_votes} total vote${poll.total_votes === 1 ? '' : 's'}</span>
            ${voted ? '<span>· You have voted</span>' : ''}
            ${poll.created_at ? `<span>· ${escapeHtml(timeAgo(poll.created_at))}</span>` : ''}
          </div>

          ${state.isAdmin ? `
          <div class="row mt-4">
            <button type="button" class="btn btn-ghost btn-sm" data-poll-toggle="${poll.poll_id}"
                    data-next="${closed ? 'open' : 'closed'}">${closed ? 'Reopen poll' : 'Close poll'}</button>
            <button type="button" class="btn btn-danger btn-sm" data-poll-delete="${poll.poll_id}"
                    data-poll-question="${escapeHtml(poll.question)}">Delete</button>
          </div>` : ''}
        </div>
      </article>`;
  }

  function wirePollCards(root) {
    $$('[data-vote]', root).forEach((btn) => {
      btn.addEventListener('click', () => castVote(btn.dataset.vote, btn.dataset.option, btn));
    });
    $$('[data-poll-toggle]', root).forEach((btn) => {
      btn.addEventListener('click', () => togglePoll(btn.dataset.pollToggle, btn.dataset.next, btn));
    });
    $$('[data-poll-delete]', root).forEach((btn) => {
      btn.addEventListener('click', () => deletePoll(btn.dataset.pollDelete, btn.dataset.pollQuestion));
    });
  }

  /* ================================================================== *
   *  Voting
   * ================================================================== */
  async function castVote(pollId, optionId, button) {
    if (state.busy) return;
    state.busy = true;

    // Disable every option in this poll while the request is in flight.
    const card = button.closest('[data-poll]');
    $$('[data-vote]', card).forEach((b) => { b.disabled = true; });
    setButtonLoading(button, true, 'Recording…');

    try {
      const { data } = await api.polls.vote(pollId, Number(optionId));
      showToast('Your vote has been recorded.', { type: 'success', title: 'Vote counted' });
      replaceCard(card, data.poll);
    } catch (error) {
      setButtonLoading(button, false);
      $$('[data-vote]', card).forEach((b) => { b.disabled = false; });

      if (error instanceof ApiError && error.status === 409) {
        // Already voted, or the poll closed since the page loaded.
        showToast(error.message, { type: 'error', title: 'Vote not counted' });
        await refreshPoll(pollId, card);
        return;
      }
      showToast(error instanceof ApiError ? error.message : 'Your vote could not be recorded.',
        { type: 'error', title: 'Vote failed' });
    } finally {
      state.busy = false;
    }
  }

  /** Re-fetch a single poll from the API and swap its card in place. */
  async function refreshPoll(pollId, card) {
    try {
      const { data } = await api.polls.byId(pollId);
      replaceCard(card, data.poll);
    } catch {
      loadPolls();
    }
  }

  function replaceCard(card, poll) {
    if (!card || !poll) { loadPolls(); return; }
    const wrapper = document.createElement('div');
    wrapper.innerHTML = pollCard(poll);
    const fresh = wrapper.firstElementChild;
    card.replaceWith(fresh);
    wirePollCards(fresh);
  }

  /* ================================================================== *
   *  Admin: create / close / delete
   * ================================================================== */
  function optionRow(value = '', index = 0) {
    return `
      <div class="row" style="margin-bottom:8px;flex-wrap:nowrap">
        <label class="sr-only" for="poll-option-${index}">Option ${index + 1}</label>
        <input class="input poll-option-input" id="poll-option-${index}" type="text"
               value="${escapeHtml(value)}" placeholder="Option ${index + 1}" maxlength="200">
        <button type="button" class="btn btn-ghost btn-icon" data-remove-option
                aria-label="Remove option ${index + 1}">&times;</button>
      </div>`;
  }

  function renderOptionRows(count = 3) {
    const wrap = $('#poll-options-wrap');
    wrap.innerHTML = Array.from({ length: count }, (_, i) => optionRow('', i)).join('');
    bindRemoveButtons();
  }

  function bindRemoveButtons() {
    $$('[data-remove-option]').forEach((btn) => {
      btn.onclick = () => {
        const rows = $$('.poll-option-input');
        if (rows.length <= 2) {
          showToast('A poll needs at least 2 options.', { type: 'info' });
          return;
        }
        btn.closest('.row').remove();
      };
    });
  }

  function openPollForm() {
    const form = $('#poll-form');
    clearFieldErrors(form);
    form.reset();
    renderOptionRows(3);
    pollModal.open();
  }

  function wirePollForm() {
    const form = $('#poll-form');
    if (!form) return;

    const addBtn = $('#poll-add-option');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const index = $$('.poll-option-input').length;
        if (index >= 10) { showToast('A poll can have at most 10 options.', { type: 'info' }); return; }
        $('#poll-options-wrap').insertAdjacentHTML('beforeend', optionRow('', index));
        bindRemoveButtons();
      });
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(form);

      const question = $('#poll-question').value.trim();
      const options = $$('.poll-option-input').map((i) => i.value.trim()).filter(Boolean);

      if (question.length < 5) { setFieldError('poll-question', 'Question must be at least 5 characters.'); return; }
      if (options.length < 2) { setFieldError('poll-options', 'Provide at least 2 non-empty options.'); return; }
      if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
        setFieldError('poll-options', 'Options must be unique.'); return;
      }

      const submit = $('#poll-submit');
      setButtonLoading(submit, true, 'Creating…');
      try {
        await api.polls.create({
          question,
          description: $('#poll-description').value.trim() || null,
          options,
        });
        showToast('Poll published — students can vote now.', { type: 'success', title: 'Poll created' });
        pollModal.close();
        $('#poll-status').value = 'open';
        loadPolls();
      } catch (error) {
        if (error instanceof ApiError && error.status === 403) {
          showToast('Only administrators can create polls.', { type: 'error', title: 'Not allowed' });
        } else if (error instanceof ApiError && error.status === 422) {
          applyServerFieldErrors(error.errors, { question: 'poll-question', description: 'poll-description', options: 'poll-options' });
          showToast(error.firstFieldMessage || error.message, { type: 'error', title: 'Check the form' });
        } else {
          showToast(error instanceof ApiError ? error.message : 'Could not create the poll.', { type: 'error' });
        }
      } finally {
        setButtonLoading(submit, false);
      }
    });
  }

  async function togglePoll(pollId, next, button) {
    setButtonLoading(button, true, 'Updating…');
    try {
      await api.polls.update(pollId, { status: next });
      showToast(next === 'closed' ? 'Poll closed. No further votes accepted.' : 'Poll reopened.',
        { type: 'success', title: 'Updated' });
      loadPolls();
    } catch (error) {
      setButtonLoading(button, false);
      showToast(error instanceof ApiError ? error.message : 'Could not update this poll.', { type: 'error' });
    }
  }

  async function deletePoll(pollId, question) {
    const ok = await UIT.confirmDialog({
      title: 'Delete this poll?',
      message: `"${question}" and all of its votes will be permanently removed.`,
      confirmLabel: 'Delete poll',
    });
    if (!ok) return;
    try {
      await api.polls.remove(pollId);
      showToast('Poll deleted.', { type: 'success', title: 'Removed' });
      loadPolls();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'Could not delete this poll.', { type: 'error' });
    }
  }
})(window, document);
