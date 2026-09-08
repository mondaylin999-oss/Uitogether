/* ==========================================================================
   config.js - runtime configuration for the static frontend.

   This file is REWRITTEN AT DEPLOY TIME by scripts/build-frontend.sh, which
   substitutes the API_BASE_URL environment variable set on the Render static
   site. Locally it is left untouched, so `apiBaseUrl` stays null and api.js
   falls back to the local development server.
   ========================================================================== */
(function (window) {
  'use strict';

  // Replaced during the Render build with the live API origin, e.g.
  //   'https://uitogether-api.onrender.com/api'
  const DEPLOYED_API_BASE_URL = '__API_BASE_URL__';

  const isPlaceholder =
    DEPLOYED_API_BASE_URL === '__API_' + 'BASE_URL__' || DEPLOYED_API_BASE_URL === '';

  window.UIT_CONFIG = {
    apiBaseUrl: isPlaceholder ? null : DEPLOYED_API_BASE_URL,
  };
})(window);
