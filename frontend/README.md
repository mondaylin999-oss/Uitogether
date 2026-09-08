# UITogether — Frontend

Plain **HTML5 + CSS3 + vanilla JavaScript**. No framework, no build step, no
bundler. Talks to the existing backend over `fetch`.

> Backend lives in `../backend` and is completely separate. No frontend file
> is inside `backend/`, and no backend file is inside `frontend/`.

---

## 1. Running it

The backend must be running first:

```bash
cd backend && npm run dev
```

Then serve this folder over HTTP (**not** `file://` — that breaks CORS):

```bash
cd frontend && python3 -m http.server 5500 --bind 127.0.0.1
```

Open <http://localhost:5500/index.html>.

Any static server works (`npx serve -l 5500`, VS Code Live Server, …) as long
as the origin is listed in `CLIENT_URL` in `backend/.env`. Currently allowed:

```
http://localhost:5500, http://127.0.0.1:5500, http://localhost:5173, http://localhost:3000
```

---

## 2. Structure

```
frontend/
├── index.html              landing page (web root) - sign-up + login modal
├── pages/                  one .html + its controller .js per screen
│   ├── landing.js
│   ├── dashboard.html/.js
│   ├── profile.html/.js
│   ├── study-buddy.html/.js
│   ├── campus-life.html/.js
│   ├── voting.html/.js
│   ├── notifications.html/.js
│   └── admin.html/.js      admin-only management console
├── components/             reusable UI behaviour
│   ├── navbar.js           responsive nav + live badges
│   ├── toast.js            success / error / info messages
│   ├── states.js           loading / empty / error / button states
│   ├── modal.js            accessible dialog (focus trap, Escape)
│   ├── tabs.js             accessible tab controller
│   └── confirm.js          confirmation dialog for destructive actions
├── services/
│   └── api.js              API_BASE_URL + endpoint map + apiFetch
├── auth/
│   ├── auth.js             register / login / logout / session state
│   └── guard.js            requireAuth / requireAdminPage
├── styles/style.css        the whole design system
├── utils/
│   ├── dom.js              $, $$, escapeHtml, safeUrl, debounce
│   ├── format.js           dates, times, enum labels, initials
│   └── validate.js         field validation + error rendering
└── assets/images/
```

**Load order** on every page:

```
utils/dom → utils/format → utils/validate
→ components/toast → states → modal → tabs → confirm
→ services/api → auth/auth → auth/guard
→ components/navbar → pages/<page>.js
```

Everything hangs off a single `window.UIT` namespace. No inline JavaScript,
and no other globals.

**Paths are root-relative** (`/services/api.js`, `/pages/dashboard.html`), so
links never break regardless of page depth. That means the site must be served
with `frontend/` as the web root — which is what the command above does. It
will not work from `file://`.

## 3. Talking to the backend

`js/api.js` is the only file that knows a URL:

```js
const API_BASE_URL = 'http://localhost:5050/api';
```

Every request goes through `apiFetch()`, which:

- attaches `Authorization: Bearer <token>` when a token exists
- serialises JSON bodies and builds querystrings
- unwraps the backend envelope `{ success, message, data, meta }`
- converts failures into a typed `ApiError` with `status` + `errors[]`
- handles **401** by clearing the token and redirecting to the landing page
- reports network failures as a friendly "server unreachable" message

Pages never call `apiFetch` directly — they use the typed wrappers
(`api.polls.vote(...)`, `api.buddyRequests.accept(...)`, …).

---

## 4. Authentication

- The JWT is stored in `localStorage` under `token`.
- A cached copy of the **public** user object is kept under `uit_user` purely
  for instant first paint; `getCurrentUser()` always re-validates against
  `GET /api/auth/me`, so a role change takes effect immediately.
- **Never stored:** passwords, `password_hash`, database credentials, secrets.
- Every authenticated page calls `Auth.requireAuth()` before rendering.

---

## 5. Contact privacy

Telegram/Viber are rendered in exactly one function —
`contactMarkup()` in `js/study-buddy.js` — and only from `profile.contact`,
an object the **backend** includes solely when `contact_unlocked === true`
(i.e. an accepted buddy request).

The frontend never assembles a `t.me` link from raw fields, because it never
receives raw fields for anyone else. Before a match, browse and detail
responses do not even contain the columns.

---

## 6. Admin controls

`user.role === 'admin'` reveals the Admin nav link, the admin dashboard, and
create/edit/delete controls for competitions and polls.

**All of that is presentation only.** Three independent layers matter, and only
the last two are security:

1. *UI* — buttons are hidden for students (convenience).
2. *Page guard* — `auth/guard.js` `requireAdminPage()` re-checks the role that
   `GET /api/auth/me` just returned from MySQL, then redirects non-admins.
   Editing `localStorage` does not help: the app overwrites the cached copy
   with the server's value on every page load.
3. *Backend* — every admin route mounts `authenticate + requireAdmin` and
   returns `403` no matter what the frontend does. This is the real boundary.

Verified: a student token sent directly at `POST/PUT/DELETE /api/competitions`
is rejected 403 in all three cases, and `role: "admin"` in a register or
profile-update payload is ignored.

---

## 7. Responsive design

Mobile-first. Base styles target 320px; media queries add capability upward.

| Range | Behaviour |
|---|---|
| 320–767 | single column, hamburger drawer, full-width buttons |
| 768–1023 | 2-column grids, side-by-side form fields, centred modals |
| 1024+ | horizontal navbar, 3–4 column grids, max-width container |
| 1440+ | container widens to 1320px |

Touch targets are `--tap: 44px`. Swipe uses `touch-action: pan-y` so vertical
scrolling is never hijacked, and a horizontal drag is only claimed once it
exceeds 12px **and** is clearly more horizontal than vertical.
