/* ==========================================================================
   auth/guard.js - page-level access control.

   requireAuth()  - every authenticated page calls this before rendering.
   requireAdmin() - the admin dashboard calls this instead.

   Both are CONVENIENCE, not security: they decide what to render. The backend
   independently rejects unauthorised requests with 401/403, so a user who
   forces their way onto a page simply sees empty sections and errors.
   ========================================================================== */
(function (window) {
  'use strict';

  const UIT = window.UIT;
  const { Auth, ApiError, showToast } = UIT;

  /**
   * @returns {Promise<object|null>} the verified user, or null if redirected
   */
  async function requireAuth() {
    if (!Auth.isAuthenticated()) {
      window.location.replace('index.html?auth=required');
      return null;
    }
    try {
      return await Auth.getCurrentUser();
    } catch (error) {
      // A 401 already triggered the redirect inside apiFetch.
      if (error instanceof ApiError && error.isNetwork) {
        showToast(error.message, { type: 'error', title: 'Server unreachable' });
        return Auth.getCachedUser();
      }
      return null;
    }
  }

  /**
   * Admin-only pages. The role checked here is the one the BACKEND just
   * returned from GET /api/auth/me, not the cached copy, so editing
   * localStorage cannot grant access to this page.
   * @returns {Promise<object|null>}
   */
  async function requireAdminPage() {
    const user = await requireAuth();
    if (!user) return null;
    if (user.role !== 'admin') {
      // Use a relative-aware path so the redirect works whether the current
      // document is inside `pages/` or served from the frontend root.
      const dest = window.location.pathname.includes('/pages/') ? 'dashboard.html?denied=admin' : 'pages/dashboard.html?denied=admin';
      window.location.replace(dest);
      return null;
    }
    return user;
  }

  /** Send an already-signed-in visitor straight to their dashboard. */
  function redirectIfAuthenticated() {
    if (Auth.isAuthenticated()) {
      const dest = window.location.pathname.includes('/pages/') ? 'dashboard.html' : 'pages/dashboard.html';
      window.location.replace(dest);
      return true;
    }
    return false;
  }

  UIT.Guard = { requireAuth, requireAdminPage, redirectIfAuthenticated };
  // keep the old call sites working
  Auth.requireAuth = requireAuth;
  Auth.redirectIfAuthenticated = redirectIfAuthenticated;
})(window);
