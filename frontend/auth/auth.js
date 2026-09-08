/* ==========================================================================
   auth/auth.js - registration, login, logout and session state.

   Only the JWT and a cached copy of the PUBLIC user object are stored.
   Passwords are never written to localStorage, cookies or the URL.

   SECURITY NOTE: the cached `role` is a display hint only. It decides which
   buttons are drawn - never whether an action is permitted. Editing
   localStorage to say "admin" changes the UI and nothing else: every
   privileged route is guarded server-side by authenticate + requireAdmin.
   ========================================================================== */
(function (window) {
  'use strict';

  const UIT = window.UIT;
  const { api, tokenStore, USER_KEY, ApiError } = UIT;

  function cacheUser(user) {
    try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* private mode */ }
  }

  function getCachedUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  const isAuthenticated = () => Boolean(tokenStore.get());

  /** Display hint only - see the security note above. */
  const isAdmin = () => { const u = getCachedUser(); return Boolean(u && u.role === 'admin'); };

  /**
   * Fetch the authenticated user from the backend, which re-reads the role
   * from MySQL on every request.
   * @param {boolean} [useCache=false]
   */
  async function getCurrentUser(useCache = false) {
    if (useCache) {
      const cached = getCachedUser();
      if (cached) return cached;
    }
    const { data } = await api.auth.me();
    cacheUser(data.user);
    return data.user;
  }

  /** @param {{name,email,tnt,academic_year,password}} payload */
  async function register(payload) {
    const { data } = await api.auth.register({
      name: payload.name,
      email: payload.email,
      tnt: payload.tnt,
      academic_year: payload.academic_year,
      password: payload.password,
    });
    tokenStore.set(data.token);
    cacheUser(data.user);
    return data.user;
  }

  /** @param {{email,password}} payload */
  async function login(payload) {
    const { data } = await api.auth.login({ email: payload.email, password: payload.password });
    tokenStore.set(data.token);
    cacheUser(data.user);
    return data.user;
  }

  /** Tell the backend, then clear local state regardless of the outcome. */
  async function logout(redirect = true) {
    try { await api.auth.logout(); } catch { /* local session is cleared either way */ }
    tokenStore.clear();
    if (redirect) window.location.replace('/index.html?logged_out=1');
  }

  UIT.Auth = {
    register, login, logout,
    getCurrentUser, getCachedUser, cacheUser,
    isAuthenticated, isAdmin,
    ApiError,
  };
})(window);
