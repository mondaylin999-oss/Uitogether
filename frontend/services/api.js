/* ==========================================================================
   api.js - the ONE place the frontend talks to the backend.
   Every endpoint below was verified against the running server's route table.

   Backend envelope:
     success -> { success: true,  message, data: {...}, meta?: {...} }
     failure -> { success: false, message, errors?: [{ field, message }] }
   ========================================================================== */
(function (window) {
  'use strict';

  const UIT = window.UIT || (window.UIT = {});

  /* ------------------------------------------------------------------ *
   *  API CONFIGURATION
   * ------------------------------------------------------------------ */
  const API_BASE_URL = 'http://localhost:5050/api';

  const TOKEN_KEY = 'token';        // localStorage key holding the JWT
  const USER_KEY  = 'uit_user';     // cached user object (convenience only)

  /** Endpoint map - no endpoint string is written anywhere else. */
  const ENDPOINTS = {
    health: '/health',

    auth: {
      register: '/auth/register',
      login:    '/auth/login',
      me:       '/auth/me',
      logout:   '/auth/logout',
    },

    profiles: {
      me:       '/profiles/me',
      password: '/profiles/me/password',
      byId:     (userId) => `/profiles/${userId}`,
    },

    studyBuddy: {
      browse:        '/study-buddy',
      byUserId:      (userId) => `/study-buddy/${userId}`,
      createProfile: '/study-buddy/profile',
      myProfile:     '/study-buddy/profile/me',
    },

    buddyRequests: {
      create:       '/buddy-requests',
      incoming:     '/buddy-requests/incoming',
      outgoing:     '/buddy-requests/outgoing',
      pendingCount: '/buddy-requests/pending-count',
      accept:       (id) => `/buddy-requests/${id}/accept`,
      reject:       (id) => `/buddy-requests/${id}/reject`,
      cancel:       (id) => `/buddy-requests/${id}`,
    },

    matches: {
      list:     '/matches',
      byUserId: (userId) => `/matches/${userId}`,
    },

    competitions: {
      list:   '/competitions',
      byId:   (id) => `/competitions/${id}`,
      create: '/competitions',
      update: (id) => `/competitions/${id}`,
      remove: (id) => `/competitions/${id}`,
    },

    lostFound: {
      list:   '/lost-found',
      byId:   (id) => `/lost-found/${id}`,
      create: '/lost-found',
      update: (id) => `/lost-found/${id}`,
      status: (id) => `/lost-found/${id}/status`,
      remove: (id) => `/lost-found/${id}`,
    },

    polls: {
      list:    '/polls',
      byId:    (id) => `/polls/${id}`,
      results: (id) => `/polls/${id}/results`,
      vote:    (id) => `/polls/${id}/vote`,
      create:  '/polls',
      update:  (id) => `/polls/${id}`,
      remove:  (id) => `/polls/${id}`,
    },

    notifications: {
      list:        '/notifications',
      unreadCount: '/notifications/unread-count',
      readAll:     '/notifications/read-all',
      read:        (id) => `/notifications/${id}/read`,
      remove:      (id) => `/notifications/${id}`,
    },
  };

  /* ------------------------------------------------------------------ *
   *  Error type
   * ------------------------------------------------------------------ */
  class ApiError extends Error {
    constructor(message, { status = 0, errors = [], isNetwork = false } = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.errors = Array.isArray(errors) ? errors : [];
      this.isNetwork = isNetwork;
    }
    /** First field-level message, if the backend sent one. */
    get firstFieldMessage() { return this.errors.length ? this.errors[0].message : null; }
  }

  /** Human wording for statuses, so raw server text never leaks to users. */
  function friendlyMessage(status, serverMessage) {
    if (serverMessage && status >= 400 && status < 500) return serverMessage;
    switch (status) {
      case 401: return 'Please log in again.';
      case 403: return 'You do not have permission to do that.';
      case 404: return 'We could not find what you were looking for.';
      case 409: return serverMessage || 'That action conflicts with existing data.';
      case 422: return serverMessage || 'Please check the highlighted fields.';
      case 429: return 'Too many requests. Please slow down and try again shortly.';
      case 503: return 'The server is temporarily unavailable. Please try again shortly.';
      default:  return 'Something went wrong. Please try again.';
    }
  }

  /* ------------------------------------------------------------------ *
   *  Token storage (JWT only - never a password)
   * ------------------------------------------------------------------ */
  const tokenStore = {
    get()  { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
    set(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* private mode */ } },
    clear() {
      try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
    },
  };

  /** Called when the server says the session is no longer valid. */
  function handleSessionExpired() {
    tokenStore.clear();
    const path = window.location.pathname;
    const onLanding = /(^|\/)index\.html$/.test(path) || path === '/' || path.endsWith('/');
    if (!onLanding) window.location.replace('/index.html?session=expired');
  }

  /* ------------------------------------------------------------------ *
   *  apiFetch - every request goes through here
   * ------------------------------------------------------------------ */
  /**
   * @param {string} path      endpoint path, e.g. '/polls'
   * @param {object} [options]
   * @param {string} [options.method='GET']
   * @param {object} [options.body]        JSON-serialised automatically
   * @param {object} [options.query]       object -> querystring (blank values dropped)
   * @param {boolean}[options.auth=true]   attach Authorization when a token exists
   * @param {boolean}[options.redirectOnUnauthorized=true]
   * @returns {Promise<{data: *, meta: *, message: string, status: number}>}
   * @throws {ApiError}
   */
  async function apiFetch(path, options = {}) {
    const {
      method = 'GET', body, query,
      auth = true, redirectOnUnauthorized = true,
    } = options;

    let url = API_BASE_URL + path;
    if (query && typeof query === 'object') {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') params.append(key, value);
      });
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const headers = { Accept: 'application/json' };
    const isFormData = (typeof FormData !== 'undefined') && (body instanceof FormData);
    if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';

    const token = tokenStore.get();
    if (auth && token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : (isFormData ? body : JSON.stringify(body)),
      });
    } catch {
      // DNS failure, server down, CORS rejection, offline...
      throw new ApiError(
        'Cannot reach the UITogether server. Check that the backend is running on port 5050.',
        { isNetwork: true }
      );
    }

    if (response.status === 204) return { data: null, meta: null, message: '', status: 204 };

    let payload = null;
    const text = await response.text();
    if (text) { try { payload = JSON.parse(text); } catch { payload = null; } }

    if (!response.ok) {
      if (response.status === 401 && auth && token && redirectOnUnauthorized) {
        handleSessionExpired();
      }
      throw new ApiError(friendlyMessage(response.status, payload && payload.message), {
        status: response.status,
        errors: (payload && payload.errors) || [],
      });
    }

    return {
      data: payload ? payload.data : null,
      meta: payload ? payload.meta || null : null,
      message: payload ? payload.message : '',
      status: response.status,
    };
  }

  /* ------------------------------------------------------------------ *
   *  Typed wrappers - pages call these, never apiFetch directly
   * ------------------------------------------------------------------ */
  const api = {
    health: () => apiFetch(ENDPOINTS.health, { auth: false, redirectOnUnauthorized: false }),

    auth: {
      register: (payload) => apiFetch(ENDPOINTS.auth.register, {
        method: 'POST', body: payload, auth: false, redirectOnUnauthorized: false,
      }),
      login: (payload) => apiFetch(ENDPOINTS.auth.login, {
        method: 'POST', body: payload, auth: false, redirectOnUnauthorized: false,
      }),
      me: () => apiFetch(ENDPOINTS.auth.me),
      logout: () => apiFetch(ENDPOINTS.auth.logout, { method: 'POST' }),
    },

    profiles: {
      me: () => apiFetch(ENDPOINTS.profiles.me),
      updateMe: (payload) => apiFetch(ENDPOINTS.profiles.me, { method: 'PATCH', body: payload }),
      changePassword: (payload) => apiFetch(ENDPOINTS.profiles.password, { method: 'PATCH', body: payload }),
      byId: (userId) => apiFetch(ENDPOINTS.profiles.byId(userId)),
    },

    studyBuddy: {
      browse: (query) => apiFetch(ENDPOINTS.studyBuddy.browse, { query }),
      byUserId: (userId) => apiFetch(ENDPOINTS.studyBuddy.byUserId(userId)),
      myProfile: () => apiFetch(ENDPOINTS.studyBuddy.myProfile),
      createProfile: (payload) => apiFetch(ENDPOINTS.studyBuddy.createProfile, { method: 'POST', body: payload }),
      updateProfile: (payload) => apiFetch(ENDPOINTS.studyBuddy.myProfile, { method: 'PATCH', body: payload }),
      deleteProfile: () => apiFetch(ENDPOINTS.studyBuddy.myProfile, { method: 'DELETE' }),
    },

    buddyRequests: {
      send: (receiverId) => apiFetch(ENDPOINTS.buddyRequests.create, {
        method: 'POST', body: { receiver_id: receiverId },
      }),
      incoming: (query) => apiFetch(ENDPOINTS.buddyRequests.incoming, { query }),
      outgoing: (query) => apiFetch(ENDPOINTS.buddyRequests.outgoing, { query }),
      pendingCount: () => apiFetch(ENDPOINTS.buddyRequests.pendingCount),
      accept: (id) => apiFetch(ENDPOINTS.buddyRequests.accept(id), { method: 'PATCH' }),
      reject: (id) => apiFetch(ENDPOINTS.buddyRequests.reject(id), { method: 'PATCH' }),
      cancel: (id) => apiFetch(ENDPOINTS.buddyRequests.cancel(id), { method: 'DELETE' }),
    },

    matches: {
      list: (query) => apiFetch(ENDPOINTS.matches.list, { query }),
      byUserId: (userId) => apiFetch(ENDPOINTS.matches.byUserId(userId)),
    },

    competitions: {
      list: (query) => apiFetch(ENDPOINTS.competitions.list, { query }),
      byId: (id) => apiFetch(ENDPOINTS.competitions.byId(id)),
      create: (payload) => apiFetch(ENDPOINTS.competitions.create, { method: 'POST', body: payload }),
      update: (id, payload) => apiFetch(ENDPOINTS.competitions.update(id), { method: 'PUT', body: payload }),
      remove: (id) => apiFetch(ENDPOINTS.competitions.remove(id), { method: 'DELETE' }),
    },

    lostFound: {
      list: (query) => apiFetch(ENDPOINTS.lostFound.list, { query }),
      byId: (id) => apiFetch(ENDPOINTS.lostFound.byId(id)),
      create: (payload) => apiFetch(ENDPOINTS.lostFound.create, { method: 'POST', body: payload }),
      update: (id, payload) => apiFetch(ENDPOINTS.lostFound.update(id), { method: 'PATCH', body: payload }),
      setStatus: (id, status) => apiFetch(ENDPOINTS.lostFound.status(id), { method: 'PATCH', body: { status } }),
      remove: (id) => apiFetch(ENDPOINTS.lostFound.remove(id), { method: 'DELETE' }),
    },

    polls: {
      list: (query) => apiFetch(ENDPOINTS.polls.list, { query }),
      byId: (id) => apiFetch(ENDPOINTS.polls.byId(id)),
      results: (id) => apiFetch(ENDPOINTS.polls.results(id)),
      vote: (id, optionId) => apiFetch(ENDPOINTS.polls.vote(id), { method: 'POST', body: { option_id: optionId } }),
      create: (payload) => apiFetch(ENDPOINTS.polls.create, { method: 'POST', body: payload }),
      update: (id, payload) => apiFetch(ENDPOINTS.polls.update(id), { method: 'PATCH', body: payload }),
      remove: (id) => apiFetch(ENDPOINTS.polls.remove(id), { method: 'DELETE' }),
    },

    notifications: {
      list: (query) => apiFetch(ENDPOINTS.notifications.list, { query }),
      unreadCount: () => apiFetch(ENDPOINTS.notifications.unreadCount),
      markRead: (id) => apiFetch(ENDPOINTS.notifications.read(id), { method: 'PATCH' }),
      markAllRead: () => apiFetch(ENDPOINTS.notifications.readAll, { method: 'PATCH' }),
      remove: (id) => apiFetch(ENDPOINTS.notifications.remove(id), { method: 'DELETE' }),
    },
  };

  Object.assign(UIT, {
    API_BASE_URL, ENDPOINTS, TOKEN_KEY, USER_KEY,
    ApiError, apiFetch, api, tokenStore, handleSessionExpired,
  });
})(window);
