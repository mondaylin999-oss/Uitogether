#!/usr/bin/env bash
# Build step for the Render static site.
#
# The frontend is plain HTML/CSS/JS with no bundler, so the only build work is
# baking the deployed API origin into frontend/config.js. Render sets
# API_BASE_URL as an environment variable on the static site; it must include
# the /api suffix, e.g.  https://uitogether-api.onrender.com/api
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/frontend/config.js"

if [ -z "${API_BASE_URL:-}" ]; then
  echo "ERROR: API_BASE_URL is not set."
  echo "       Set it on the Render static site to the backend URL + /api,"
  echo "       for example https://uitogether-api.onrender.com/api"
  exit 1
fi

# Strip a trailing slash so the endpoint paths in api.js concatenate cleanly.
API_BASE_URL="${API_BASE_URL%/}"

if ! grep -q "__API_BASE_URL__'" "$CONFIG"; then
  echo "ERROR: $CONFIG no longer contains the __API_BASE_URL__ placeholder."
  exit 1
fi

# '#' as the delimiter, because the value is a URL full of slashes.
sed -i "s#'__API_BASE_URL__'#'${API_BASE_URL}'#" "$CONFIG"

echo "frontend/config.js -> apiBaseUrl = $API_BASE_URL"
