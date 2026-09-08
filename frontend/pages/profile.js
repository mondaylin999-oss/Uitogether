/* ==========================================================================
   profile.js - account details, password change, and the study buddy profile.
   Editing is offered only where the backend actually supports it:
     PATCH /profiles/me            name, tnt, academic_year   (NOT email/role)
     PATCH /profiles/me/password   current + new password
     POST/PATCH/DELETE /study-buddy/profile[/me]
   ========================================================================== */
(function (window, document) {
  'use strict';

  const UIT = window.UIT;
  const {
    $, api, Auth, Navbar, ApiError, escapeHtml, initials,
    labelStudyStyle, labelWannaMeet, showToast, showLoading, showError,
    setButtonLoading, initPasswordToggles, clearFieldErrors, setFieldError,
    applyServerFieldErrors,
  } = UIT;

  const state = { user: null, buddy: null };

  document.addEventListener('DOMContentLoaded', async () => {
    const user = await Auth.requireAuth();
    if (!user) return;

    state.user = user;
    Navbar.renderNavbar(user);
    initPasswordToggles();

    renderAccount(user);
    wireAccountForm();
    wirePasswordForm();
    wireBuddyForm();
    loadBuddyProfile();

    if (window.location.hash === '#buddy-profile') {
      document.getElementById('buddy-profile').scrollIntoView({ behavior: 'smooth' });
    }
  });

  /* ================================================================== *
   *  Account
   * ================================================================== */
  function renderAccount(user) {
    const box = $('#account-summary');
    box.innerHTML = `
      <div class="buddy__top mb-4">
        <span class="avatar" aria-hidden="true">${escapeHtml(initials(user.name))}</span>
        <div class="grow">
          <h3 style="margin-bottom:2px">${escapeHtml(user.name)}</h3>
          <p class="text-sm" style="margin:0">
            ${escapeHtml(user.role === 'admin' ? 'Administrator' : 'Student')}
          </p>
        </div>
        ${user.role === 'admin' ? '<span class="badge badge--admin">Admin</span>' : ''}
      </div>
      <div class="meta-list">
        <div class="meta"><span class="meta__label">Email</span><span class="meta__value">${escapeHtml(user.email)}</span></div>
        <div class="meta"><span class="meta__label">TNT number</span><span class="meta__value">${escapeHtml(user.tnt)}</span></div>
        <div class="meta"><span class="meta__label">Academic year</span><span class="meta__value">${escapeHtml(user.academic_year)}</span></div>
      </div>`;
  }

  function toggleAccountEdit(editing) {
    $('#account-summary').hidden = editing;
    $('#account-form').hidden = !editing;
    $('#acc-edit').hidden = editing;

    if (editing) {
      $('#acc-name').value = state.user.name;
      $('#acc-email').value = state.user.email;
      $('#acc-tnt').value = state.user.tnt;
      $('#acc-year').value = state.user.academic_year;
      $('#acc-name').focus();
    }
  }

  function wireAccountForm() {
    $('#acc-edit').addEventListener('click', () => toggleAccountEdit(true));
    $('#acc-cancel').addEventListener('click', () => {
      clearFieldErrors($('#account-form'));
      toggleAccountEdit(false);
    });

    $('#account-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = $('#account-form');
      clearFieldErrors(form);

      const payload = {
        name: $('#acc-name').value.trim(),
        tnt: $('#acc-tnt').value.trim(),
        academic_year: $('#acc-year').value,
      };
      if (payload.name.length < 2) { setFieldError('acc-name', 'Name must be at least 2 characters.'); return; }
      if (payload.tnt.length < 2) { setFieldError('acc-tnt', 'Enter your TNT number.'); return; }

      const submit = $('#acc-save');
      setButtonLoading(submit, true, 'Saving…');
      try {
        const { data } = await api.profiles.updateMe(payload);
        state.user = data.user;
        Auth.cacheUser(data.user);
        renderAccount(data.user);
        toggleAccountEdit(false);
        Navbar.renderNavbar(data.user);
        showToast('Your account details were updated.', { type: 'success', title: 'Saved' });
      } catch (error) {
        handleError(error, { name: 'acc-name', tnt: 'acc-tnt', academic_year: 'acc-academic_year' },
          'Could not update your account');
      } finally {
        setButtonLoading(submit, false);
      }
    });
  }

  /* ================================================================== *
   *  Password
   * ================================================================== */
  function wirePasswordForm() {
    $('#password-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = $('#password-form');
      clearFieldErrors(form);

      const current = $('#pw-current').value;
      const next = $('#pw-new').value;
      const confirm = $('#pw-confirm').value;

      if (!current) { setFieldError('pw-current_password', 'Enter your current password.'); return; }
      if (next.length < 8) { setFieldError('pw-new_password', 'New password must be at least 8 characters.'); return; }
      if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) {
        setFieldError('pw-new_password', 'Include at least one letter and one number.'); return;
      }
      if (next !== confirm) { setFieldError('pw-confirm', 'Passwords do not match.'); return; }

      const submit = $('#pw-save');
      setButtonLoading(submit, true, 'Updating…');
      try {
        await api.profiles.changePassword({ current_password: current, new_password: next });
        form.reset();
        showToast('Your password has been updated.', { type: 'success', title: 'Password changed' });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setFieldError('pw-current_password', 'Current password is incorrect.');
          showToast('Your current password is incorrect.', { type: 'error', title: 'Password not changed' });
        } else {
          handleError(error, { current_password: 'pw-current_password', new_password: 'pw-new_password' },
            'Could not change your password');
        }
      } finally {
        setButtonLoading(submit, false);
      }
    });
  }

  /* ================================================================== *
   *  Study buddy profile
   * ================================================================== */
  async function loadBuddyProfile() {
    const area = $('#buddy-area');
    showLoading(area, 'Loading your study buddy profile…');

    try {
      const { data } = await api.studyBuddy.myProfile();
      state.buddy = data.profile;
      renderBuddySummary(data.profile);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        state.buddy = null;
        renderBuddyEmpty();
        return;
      }
      showError(area, 'Unable to load your study buddy profile.', loadBuddyProfile);
    }
  }

  function renderBuddyEmpty() {
    $('#buddy-area').innerHTML = `
      <div class="state">
        <div class="state__icon" aria-hidden="true">🤝</div>
        <p class="state__title">You have not created a Study Buddy profile yet</p>
        <p class="state__msg">Create one so other students can find you and send buddy requests.</p>
        <div class="state__action"><button type="button" class="btn btn-primary" id="buddy-create">Create profile</button></div>
      </div>`;
    $('#buddy-create').addEventListener('click', () => openBuddyForm(null));
  }

  const chips = (list) => (list && list.length
    ? `<span class="chip-list">${list.map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join('')}</span>`
    : '<span class="text-muted text-sm">Not specified</span>');

  function renderBuddySummary(profile) {
    $('#buddy-area').innerHTML = `
      <div class="row mb-4">
        <span class="badge">${escapeHtml(profile.nickname)}</span>
        <span class="badge">${escapeHtml(profile.semester)}</span>
        <span class="badge">${escapeHtml(labelStudyStyle(profile.study_style))}</span>
        <span class="badge">${escapeHtml(labelWannaMeet(profile.wanna_meet))}</span>
      </div>
      <div class="meta-list">
        <div class="meta"><span class="meta__label">Weak subjects</span><span class="meta__value">${chips(profile.weak_subjects)}</span></div>
        <div class="meta"><span class="meta__label">Strong subjects</span><span class="meta__value">${chips(profile.strong_subjects)}</span></div>
        <div class="meta"><span class="meta__label">Notes</span><span class="meta__value">${profile.notes ? escapeHtml(profile.notes) : '<span class="text-muted text-sm">None</span>'}</span></div>
      </div>
      <hr class="divider">
      <div class="contact-locked mb-4">
        <span aria-hidden="true">🔒</span>
        <span>Private — shared only after a mutual match:
          <strong>${escapeHtml(profile.telegram || '—')}</strong> ·
          <strong>${escapeHtml(profile.viber || '—')}</strong>
        </span>
      </div>
      <div class="row">
        <button type="button" class="btn btn-primary" id="buddy-edit">Edit profile</button>
        <button type="button" class="btn btn-danger" id="buddy-delete">Delete profile</button>
      </div>`;

    $('#buddy-edit').addEventListener('click', () => openBuddyForm(profile));
    $('#buddy-delete').addEventListener('click', deleteBuddyProfile);
  }

  function openBuddyForm(profile) {
    const form = $('#buddy-form');
    clearFieldErrors(form);
    form.reset();

    $('#buddy-area').hidden = true;
    form.hidden = false;

    if (profile) {
      $('#sb-nickname').value = profile.nickname || '';
      $('#sb-semester').value = profile.semester || '';
      $('#sb-style').value = profile.study_style || 'mixed';
      $('#sb-meet').value = profile.wanna_meet || 'both';
      $('#sb-weak').value = (profile.weak_subjects || []).join(', ');
      $('#sb-strong').value = (profile.strong_subjects || []).join(', ');
      $('#sb-notes').value = profile.notes || '';
      $('#sb-telegram').value = profile.telegram || '';
      $('#sb-viber').value = profile.viber || '';
    }
    $('#sb-nickname').focus();
  }

  function closeBuddyForm() {
    $('#buddy-form').hidden = true;
    $('#buddy-area').hidden = false;
  }

  function wireBuddyForm() {
    $('#sb-cancel').addEventListener('click', () => {
      clearFieldErrors($('#buddy-form'));
      closeBuddyForm();
    });

    $('#buddy-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = $('#buddy-form');
      clearFieldErrors(form);

      const payload = {
        nickname: $('#sb-nickname').value.trim(),
        semester: $('#sb-semester').value.trim(),
        study_style: $('#sb-style').value,
        wanna_meet: $('#sb-meet').value,
        weak_subjects: $('#sb-weak').value.trim() || null,
        strong_subjects: $('#sb-strong').value.trim() || null,
        notes: $('#sb-notes').value.trim() || null,
        telegram: $('#sb-telegram').value.trim() || null,
        viber: $('#sb-viber').value.trim() || null,
      };

      if (payload.nickname.length < 2) { setFieldError('sb-nickname', 'Nickname must be at least 2 characters.'); return; }
      if (!payload.semester) { setFieldError('sb-semester', 'Enter your semester.'); return; }
      if (!payload.telegram && !payload.viber) {
        setFieldError('sb-telegram', 'Add Telegram or Viber so a matched buddy can reach you.');
        return;
      }

      const submit = $('#sb-save');
      setButtonLoading(submit, true, 'Saving…');
      try {
        const { data } = state.buddy
          ? await api.studyBuddy.updateProfile(payload)
          : await api.studyBuddy.createProfile(payload);

        state.buddy = data.profile;
        renderBuddySummary(data.profile);
        closeBuddyForm();
        showToast('Your study buddy profile is live.', { type: 'success', title: 'Saved' });
      } catch (error) {
        handleError(error, {
          nickname: 'sb-nickname', semester: 'sb-semester', study_style: 'sb-study_style',
          wanna_meet: 'sb-wanna_meet', weak_subjects: 'sb-weak_subjects',
          strong_subjects: 'sb-strong_subjects', notes: 'sb-notes',
          telegram: 'sb-telegram', viber: 'sb-viber',
        }, 'Could not save your profile');
      } finally {
        setButtonLoading(submit, false);
      }
    });
  }

  async function deleteBuddyProfile() {
    const ok = await UIT.confirmDialog({
      title: 'Delete your Study Buddy profile?',
      message: 'Other students will no longer find you, and you will not be able to send buddy requests until you create a new profile.',
      confirmLabel: 'Delete profile',
    });
    if (!ok) return;
    try {
      await api.studyBuddy.deleteProfile();
      state.buddy = null;
      renderBuddyEmpty();
      showToast('Your study buddy profile was deleted.', { type: 'success', title: 'Removed' });
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'Could not delete your profile.', { type: 'error' });
    }
  }

  /* ================================================================== *
   *  Shared error presentation
   * ================================================================== */
  function handleError(error, fieldMap, title) {
    if (!(error instanceof ApiError)) { showToast('Something went wrong. Please try again.', { type: 'error', title }); return; }
    if (error.isNetwork) { showToast(error.message, { type: 'error', title: 'Server unreachable' }); return; }
    if (error.status === 422 && applyServerFieldErrors(error.errors, fieldMap)) {
      showToast(error.firstFieldMessage || error.message, { type: 'error', title: 'Check the form' });
      return;
    }
    if (error.status === 409) {
      if (/tnt/i.test(error.message) && fieldMap.tnt) setFieldError(fieldMap.tnt, error.message);
      showToast(error.message, { type: 'error', title });
      return;
    }
    showToast(error.message, { type: 'error', title });
  }
})(window, document);
