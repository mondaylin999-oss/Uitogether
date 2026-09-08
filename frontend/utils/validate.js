/* ==========================================================================
   utils/validate.js - client-side form validation helpers.
   Client validation is UX only; the backend validators remain authoritative.
   ========================================================================== */
(function (window, document) {
  'use strict';

  const UIT = window.UIT;
  const { $$ } = UIT;

  /**
   * General email check - deliberately NOT tied to one domain, matching the
   * backend's EMAIL_REGEX and the chk_users_email_format CHECK constraint.
   */
  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(String(value || '').trim());
  }

  /** Password rule mirroring backend/validators/auth.validator.js. */
  function passwordProblem(value) {
    const pw = String(value || '');
    if (pw.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Za-z]/.test(pw)) return 'Include at least one letter.';
    if (!/\d/.test(pw)) return 'Include at least one number.';
    return null;
  }

  /** Show/clear a field-level message. Expects <p class="field-error" id="<input>-error">. */
  function setFieldError(inputId, message) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(`${inputId}-error`);
    if (input) {
      input.classList.toggle('is-invalid', Boolean(message));
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
    if (error) {
      error.textContent = message || '';
      error.classList.toggle('is-shown', Boolean(message));
    }
  }

  function clearFieldErrors(form) {
    $$('.input, .select, .textarea', form).forEach((el) => {
      el.classList.remove('is-invalid');
      el.removeAttribute('aria-invalid');
    });
    $$('.field-error', form).forEach((el) => { el.textContent = ''; el.classList.remove('is-shown'); });
  }

  /** Map a backend 422 errors[] array onto the matching inputs. */
  function applyServerFieldErrors(errors, fieldMap = {}) {
    if (!Array.isArray(errors)) return false;
    let applied = false;
    errors.forEach((err) => {
      const id = fieldMap[err.field] || err.field;
      if (id && document.getElementById(id)) { setFieldError(id, err.message); applied = true; }
    });
    return applied;
  }

  /** Wire every [data-pw-toggle] button to its password input. */
  function initPasswordToggles(root = document) {
    $$('[data-pw-toggle]', root).forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.pwToggle);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        btn.setAttribute('aria-pressed', String(show));
        btn.textContent = show ? '🙈' : '👁';
      });
    });
  }

  Object.assign(UIT, {
    isValidEmail, passwordProblem,
    setFieldError, clearFieldErrors, applyServerFieldErrors, initPasswordToggles,
  });
})(window, document);
