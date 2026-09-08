/* ==========================================================================
   landing.js - controller for index.html (sign up + login modal).
   ========================================================================== */
(function (window, document) {
  'use strict';

  const UIT = window.UIT;
  const {
    $, Auth, ApiError, showToast, setButtonLoading,
    setFieldError, clearFieldErrors, applyServerFieldErrors,
    initPasswordToggles, isValidEmail, createModal, queryParam,
  } = UIT;

  document.addEventListener('DOMContentLoaded', () => {
    // Already signed in? Skip the landing page entirely.
    if (Auth.redirectIfAuthenticated()) return;

    initPasswordToggles();
    const loginModal = createModal('login-modal');

    ['open-login-top', 'open-login-hero', 'open-login-form'].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => loginModal.open());
    });

    showEntryMessage();
    wireRegisterForm();
    wireLoginForm(loginModal);
  });

  /** Explain why the user landed here (expired session, logout, guard). */
  function showEntryMessage() {
    if (queryParam('session') === 'expired') {
      showToast('Your session expired. Please log in again.', { type: 'info', title: 'Signed out' });
    } else if (queryParam('auth') === 'required') {
      showToast('Please log in to continue.', { type: 'info', title: 'Login required' });
    } else if (queryParam('logged_out')) {
      showToast('You have been logged out.', { type: 'success', title: 'See you soon' });
    }
    if (window.history.replaceState && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  /* ------------------------------------------------------------------ *
   *  Registration
   * ------------------------------------------------------------------ */
  function validateRegister(values) {
    let firstInvalid = null;
    const fail = (id, message) => {
      setFieldError(id, message);
      if (!firstInvalid) firstInvalid = id;
    };

    if (values.name.length < 2) fail('reg-name', 'Please enter your full name (at least 2 characters).');

    // Deliberately a GENERAL email check - gmail, yahoo, outlook and others.
    if (!values.email) fail('reg-email', 'Email is required.');
    else if (!isValidEmail(values.email)) fail('reg-email', 'Enter a valid email address, e.g. you@example.com');

    if (values.tnt.length < 2) fail('reg-tnt', 'Enter your TNT number.');
    if (!values.academic_year) fail('reg-year', 'Select your academic year.');

    if (values.password.length < 8) fail('reg-password', 'Password must be at least 8 characters.');
    else if (!/[A-Za-z]/.test(values.password)) fail('reg-password', 'Include at least one letter.');
    else if (!/\d/.test(values.password)) fail('reg-password', 'Include at least one number.');

    if (!values.confirm) fail('reg-confirm', 'Please confirm your password.');
    else if (values.confirm !== values.password) fail('reg-confirm', 'Passwords do not match.');

    return firstInvalid;
  }

  function wireRegisterForm() {
    const form = $('#register-form');
    if (!form) return;
    const submit = $('#register-submit');

    // live confirm-password feedback
    const password = $('#reg-password');
    const confirm = $('#reg-confirm');
    confirm.addEventListener('input', () => {
      if (!confirm.value) { setFieldError('reg-confirm', ''); return; }
      setFieldError('reg-confirm', confirm.value === password.value ? '' : 'Passwords do not match.');
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(form);

      const values = {
        name: $('#reg-name').value.trim(),
        email: $('#reg-email').value.trim(),
        tnt: $('#reg-tnt').value.trim(),
        academic_year: $('#reg-year').value,
        password: password.value,
        confirm: confirm.value,
      };

      const firstInvalid = validateRegister(values);
      if (firstInvalid) {
        document.getElementById(firstInvalid).focus();
        showToast('Please correct the highlighted fields.', { type: 'error', title: 'Check your details' });
        return;
      }

      setButtonLoading(submit, true, 'Creating account…');
      try {
        const user = await Auth.register(values);
        showToast(`Welcome to UITogether, ${user.name}! Taking you to your dashboard…`,
          { type: 'success', title: 'Account created' });
        setTimeout(() => window.location.replace(window.location.pathname.includes('/pages/') ? 'dashboard.html' : 'pages/dashboard.html'), 900);
      } catch (error) {
        setButtonLoading(submit, false);
        handleAuthError(error, form, {
          name: 'reg-name', email: 'reg-email', tnt: 'reg-tnt',
          academic_year: 'reg-year', password: 'reg-password',
        }, 'We could not create your account');
      }
    });
  }

  /* ------------------------------------------------------------------ *
   *  Login
   * ------------------------------------------------------------------ */
  function wireLoginForm(modal) {
    const form = $('#login-form');
    if (!form) return;
    const submit = $('#login-submit');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(form);

      const email = $('#login-email').value.trim();
      const password = $('#login-password').value;

      let invalid = false;
      if (!email) { setFieldError('login-email', 'Email is required.'); invalid = true; }
      else if (!isValidEmail(email)) { setFieldError('login-email', 'Enter a valid email address.'); invalid = true; }
      if (!password) { setFieldError('login-password', 'Password is required.'); invalid = true; }
      if (invalid) return;

      setButtonLoading(submit, true, 'Logging in…');
      try {
        const user = await Auth.login({ email, password });
        showToast(`Welcome back, ${user.name}!`, { type: 'success', title: 'Logged in' });
        modal.close();
        setTimeout(() => window.location.replace(window.location.pathname.includes('/pages/') ? 'dashboard.html' : 'pages/dashboard.html'), 700);
      } catch (error) {
        setButtonLoading(submit, false);
        if (error instanceof ApiError && error.status === 401) {
          setFieldError('login-password', 'Incorrect email or password.');
          showToast('Incorrect email or password. Please try again.', { type: 'error', title: 'Login failed' });
          return;
        }
        handleAuthError(error, form, { email: 'login-email', password: 'login-password' }, 'Unable to log in');
      }
    });
  }

  /* ------------------------------------------------------------------ *
   *  Shared error presentation
   * ------------------------------------------------------------------ */
  function handleAuthError(error, form, fieldMap, title) {
    if (!(error instanceof ApiError)) {
      showToast('Something went wrong. Please try again.', { type: 'error', title });
      return;
    }
    if (error.isNetwork) {
      showToast(error.message, { type: 'error', title: 'Server unreachable' });
      return;
    }
    // 422 -> map field errors onto the inputs
    if (error.status === 422 && applyServerFieldErrors(error.errors, fieldMap)) {
      showToast(error.firstFieldMessage || error.message, { type: 'error', title: 'Check your details' });
      return;
    }
    // 409 -> duplicate email / TNT
    if (error.status === 409) {
      if (/email/i.test(error.message)) setFieldError(fieldMap.email, error.message);
      else if (/tnt/i.test(error.message)) setFieldError(fieldMap.tnt, error.message);
      showToast(error.message, { type: 'error', title: 'Already registered' });
      return;
    }
    showToast(error.message, { type: 'error', title });
  }
})(window, document);
