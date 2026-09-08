# UITogether — Developer Guide

Everything about how the code is put together: the layers, where a change
belongs, the full API surface, the data model, and the conventions the project
holds itself to.

New here? Get it running first with [README.md](README.md), then come back.

---

## Table of contents

1. [The shape of the project](#1-the-shape-of-the-project)
2. [The backend's five layers](#2-the-backends-five-layers)
3. [The life of a request](#3-the-life-of-a-request)
4. [Folder by folder](#4-folder-by-folder)
5. [The data model](#5-the-data-model)
6. [The API reference](#6-the-api-reference)
7. [The response envelope](#7-the-response-envelope)
8. [Authentication & authorisation](#8-authentication--authorisation)
9. [Contact privacy — the core rule](#9-contact-privacy--the-core-rule)
10. [The frontend](#10-the-frontend)
11. [Adding a feature, end to end](#11-adding-a-feature-end-to-end)
12. [Conventions](#12-conventions)
13. [Security checklist](#13-security-checklist)

---

## 1. The shape of the project

```
UITogether/
├── README.md         setup and running
├── README1.md        ← you are here
├── database/         ALL SQL — migrations, schema, seed, reset
├── backend/          Node.js + Express REST API
└── frontend/         plain HTML/CSS/JS — no framework, no build step
```

Three parts that only ever meet at two seams:

```
frontend  ──HTTP/JSON──▶  backend  ──mysql2──▶  MySQL
          (services/api.js)        (repositories/ only)
```

- The frontend has **one** file that knows a URL: `frontend/services/api.js`.
- The backend has **one** layer that writes SQL: `backend/repositories/`.
- The SQL that defines the database lives in **one** folder: `database/`.

If you find yourself breaking one of those three sentences, you are probably
putting code in the wrong place.

### Why `database/` sits at the top level

The schema is not a backend implementation detail — it is the contract the
whole project is built on, and someone marking or reviewing the project should
find it without opening `backend/`. So the `.sql` files live at the root, in
`database/`, and nothing else in the repository contains SQL.

The Node scripts that *drive* those files (`db:setup`, `db:migrate`, …) are a
different thing: they import the backend's config and its installed `mysql2`
driver, so they stay inside the backend, at `backend/scripts/db/`. They read
their SQL from `../../../database/`.

---

## 2. The backend's five layers

Each layer may only call the one below it. Nothing skips a level.

| Layer | Folder | Allowed to | Never |
|---|---|---|---|
| **Route** | `routes/` | declare the path, attach middleware in order | contain logic |
| **Controller** | `controllers/` | read `req`, call one service, format the reply | contain rules or SQL |
| **Service** | `services/` | hold **every business rule** | write SQL, touch `req`/`res` |
| **Repository** | `repositories/` | write **every SQL query** | contain rules |
| **Config** | `config/` | pool, env, shared enums | anything else |

The value of this is that a question always has one address:

- *"Can a student edit someone else's lost-item post?"* → a service.
- *"Which columns come back when browsing?"* → a repository.
- *"Is this endpoint rate-limited?"* → a route.

Supporting cast:

- `middleware/` — auth, admin, validation, rate limits, uploads, errors
- `validators/` — express-validator chains, one file per resource
- `utils/` — errors, the response envelope, JWT, bcrypt, contact links,
  serialisers, pagination, SQL helpers, the logger

---

## 3. The life of a request

```
        ┌─ helmet ─ cors ─ body parsers ─ morgan ─ apiLimiter ─┐
POST    │                                                      │
/api/   │   route  ─▶ writeLimiter ─▶ authenticate ─▶ requireAdmin?
polls   │             ─▶ validator chain ─▶ validate middleware
        │             ─▶ controller ─▶ service ─▶ repository ─▶ MySQL
        └──────────────────────────────────────────────────────┘
                                   │
              any thrown error ────┴──▶ error.middleware  (the only formatter)
```

Middleware order in `app.js` is deliberate: `helmet → cors → body parsers →
logger → rate limit → routes → 404 → error handler`. The error handler must
stay last; it is the single place a failure becomes JSON.

Controllers never write `try/catch`. They are wrapped in `asyncHandler`, which
forwards a rejected promise to the error middleware. A rule that fails throws
an `ApiError` with a status code, and that is the whole story:

```js
if (item.user_id !== userId && role !== 'admin') {
  throw new ApiError(403, 'You can only edit your own post');
}
```

`server.js` validates the environment and proves MySQL is reachable **before**
binding the port, so a misconfigured install dies immediately with a readable
message rather than 500ing on the first click.

---

## 4. Folder by folder

### `database/`

| Path | What it is |
|---|---|
| `migrations/001…009_*.sql` | The source of truth. Applied in filename order, checksummed in `schema_migrations` |
| `schema.sql` | **Generated** by `npm run db:schema`. Never edit by hand |
| `seed.sql` | Demo data. `INSERT IGNORE` with explicit ids, so it is re-runnable |
| `reset.sql` | Drops all tables, views and triggers. Destructive |
| `README.md` | The database guide — setup, migration rules, the data model |

### `backend/`

| Path | What it is |
|---|---|
| `server.js` | Entry point. Validates env → checks MySQL → listens. Graceful shutdown on SIGINT/SIGTERM |
| `app.js` | The Express app itself: middleware order, CORS allow-list, static uploads, 404, error handler |
| `config/env.js` | The **only** file that reads `process.env`. Everything else imports from here |
| `config/database.js` | The `mysql2` pool, plus the connection settings the `scripts/db/*` tools share |
| `config/constants.js` | Shared enums — roles, statuses, sort allow-lists |
| `routes/index.js` | Mounts every router under `/api`, and owns `GET /api/health` |
| `routes/*.routes.js` | One per resource. Path + middleware order, nothing else |
| `controllers/*.js` | Thin. `req` in, service call, `sendSuccess` out |
| `services/*.js` | All business rules: match logic, ownership, admin checks, notification fan-out |
| `repositories/*.js` | All SQL. Prepared statements only |
| `middleware/auth.middleware.js` | Verifies the JWT and **re-loads the user from MySQL** each request |
| `middleware/admin.middleware.js` | `requireAdmin` — 403 for anyone else |
| `middleware/validate.middleware.js` | Turns express-validator results into a 422 |
| `middleware/rateLimit.middleware.js` | `apiLimiter` (global), `authLimiter` (strict), `writeLimiter` (moderate) |
| `middleware/upload.middleware.js` | Multer config for lost-and-found images |
| `middleware/error.middleware.js` | 404 + the single error formatter |
| `validators/*.validator.js` | express-validator chains; `common.validator.js` holds `idParam` and paging rules |
| `utils/ApiError.js` | `new ApiError(status, message, errors?)` |
| `utils/apiResponse.js` | `sendSuccess` / `sendError` — the envelope in §7 |
| `utils/asyncHandler.js` | Wraps async controllers so rejections reach the error handler |
| `utils/jwt.js`, `utils/password.js` | Sign/verify tokens; bcrypt hash/compare |
| `utils/contactLinks.js` | Builds the `t.me` / `viber://` links in §9 |
| `utils/serializers.js` | Strips `password_hash` and private columns before anything leaves |
| `utils/pagination.js`, `utils/sql.js` | Page/limit maths; ORDER BY and LIMIT allow-lists |
| `utils/logger.js` | The only thing that prints |
| `scripts/db/*.js` | The database automation behind the `npm run db:*` commands |
| `scripts/qa_*.js` | Throwaway end-to-end scripts used while building the match flow |
| `public/uploads/` | Uploaded images. Gitignored |
| `api/index.js`, `vercel.json` | Serverless entry point for a Vercel deploy |

### `frontend/`

| Path | What it is |
|---|---|
| `index.html` | Landing page and web root: sign-up form + login modal |
| `pages/*.html` + `*.js` | One screen per pair. `dashboard`, `profile`, `study-buddy`, `campus-life`, `voting`, `notifications`, `admin` |
| `pages/landing.js` | Controller for `index.html` |
| `components/navbar.js` | Responsive nav, live unread badges |
| `components/toast.js` | Success / error / info messages |
| `components/states.js` | Loading, empty, error and button states |
| `components/modal.js` | Accessible dialog — focus trap, Escape to close |
| `components/tabs.js` | Accessible tab controller |
| `components/confirm.js` | Confirmation before anything destructive |
| `services/api.js` | `API_BASE_URL`, the endpoint map, and `apiFetch` |
| `auth/auth.js` | register / login / logout / session state |
| `auth/guard.js` | `requireAuth()` and `requireAdminPage()` |
| `utils/dom.js` | `$`, `$$`, `escapeHtml`, `safeUrl`, `debounce` |
| `utils/format.js` | Dates, times, enum labels, initials |
| `utils/validate.js` | Field validation and error rendering |
| `styles/style.css` | The whole design system, in CSS custom properties |

---

## 5. The data model

**9 tables, 2 views, 7 triggers.** Full column-level detail is in the
migration files; this is the map.

```
users ──1:1── study_buddy_profiles
  │                (telegram, viber = PRIVATE columns)
  │
  ├──< buddy_requests >──┐   sender_id / receiver_id → users
  │      status: pending | accepted | rejected
  │      'accepted' IS the match
  │
  ├──< lost_found            type: lost | found
  ├──< notifications         one row per recipient
  ├──< votes >── poll_options >── polls
  └──< competitions          created_by must be an admin (trigger)
```

| Table | Holds | Key rule |
|---|---|---|
| `users` | accounts | `role` is `student` or `admin`; the API only ever inserts `student` |
| `study_buddy_profiles` | the buddy card | exactly one per user (`uq_profiles_user_id`) |
| `buddy_requests` | one row per direction | `uq_requests_pair` stops duplicates; a rejected row is revived rather than re-inserted |
| `competitions` | events | admin writes only |
| `lost_found` | lost/found posts | owner or admin may edit |
| `polls` / `poll_options` / `votes` | voting | `uq_votes_one_per_poll (poll_id, user_id)` — one vote each, enforced by MySQL |
| `notifications` | inbox | readable only where `user_id` = the caller |

Plus `schema_migrations`, which the migrator creates and maintains for itself.

**Views** — `v_buddy_matches` expands an accepted request into both
directions, so "my matches" is one indexed lookup instead of an `OR` across
two columns; `v_poll_results` gives per-option counts and percentages.

**Triggers** are defence in depth. The API already enforces each of these; the
database refuses them again in case a row ever arrives another way:

| Trigger | Refuses |
|---|---|
| `trg_requests_not_self_bi` / `_bu` | a request where sender = receiver |
| `trg_competitions_admin_bi` / `_bu` | a competition whose `created_by` is not an admin |
| `trg_polls_admin_bi` / `_bu` | a poll whose `created_by` is not an admin |
| `trg_votes_poll_open_bi` | a vote on a closed or expired poll |

> Migration 003 uses triggers rather than CHECK constraints on purpose: MySQL
> 8.0 forbids `ON DELETE` / `ON UPDATE` referential actions on any column that
> appears in a CHECK, and `sender_id` / `receiver_id` need both.

Changing the schema: add a new numbered migration, never edit an applied one.
The rules are in [`database/README.md`](database/README.md) §3.

---

## 6. The API reference

Base URL `http://localhost:5050/api`.

`*` = valid token required  ·  `**` = token **and** `role = 'admin'`

### Health
| Method | Path | |
|---|---|---|
| GET | `/health` | public — process + MySQL status |

### Auth
| Method | Path | |
|---|---|---|
| POST | `/auth/register` | returns `{ user, token }` |
| POST | `/auth/login` | returns `{ user, token }` |
| GET | `/auth/me` | `*` |
| POST | `/auth/logout` | `*` |

### Profiles (the account)
| Method | Path | |
|---|---|---|
| GET | `/profiles/me` | `*` |
| PATCH | `/profiles/me` | `*` |
| PATCH | `/profiles/me/password` | `*` |
| GET | `/profiles/:userId` | `*` public card |

### Study Buddy
| Method | Path | |
|---|---|---|
| POST | `/study-buddy/profile` | `*` one per user |
| GET | `/study-buddy/profile/me` | `*` |
| PATCH | `/study-buddy/profile/me` | `*` |
| DELETE | `/study-buddy/profile/me` | `*` |
| GET | `/study-buddy` | `*` browse — **never includes contacts** |
| GET | `/study-buddy/:userId` | `*` contacts only if matched |

Browse filters: `?semester=&study_style=&wanna_meet=&subject=&q=&sort=&page=&limit=`

### Buddy requests — the core flow
| Method | Path | |
|---|---|---|
| POST | `/buddy-requests` | `*` body `{ "receiver_id": 3 }` |
| GET | `/buddy-requests/incoming` | `*` |
| GET | `/buddy-requests/outgoing` | `*` |
| GET | `/buddy-requests/pending-count` | `*` drives the nav badge |
| PATCH | `/buddy-requests/:id/accept` | `*` receiver only |
| PATCH | `/buddy-requests/:id/reject` | `*` receiver only |
| DELETE | `/buddy-requests/:id` | `*` sender only, while still pending |

### Matches — contact unlocked
| Method | Path | |
|---|---|---|
| GET | `/matches` | `*` |
| GET | `/matches/:userId` | `*` 404 if not matched |

### Competitions
| Method | Path | |
|---|---|---|
| GET | `/competitions` | `*` `?scope=upcoming\|past\|all` |
| GET | `/competitions/:id` | `*` |
| POST | `/competitions` | `**` |
| PUT | `/competitions/:id` | `**` |
| DELETE | `/competitions/:id` | `**` |

### Lost & Found
| Method | Path | |
|---|---|---|
| GET | `/lost-found` | `*` `?type=&status=&mine=true&q=` |
| GET | `/lost-found/:id` | `*` |
| POST | `/lost-found` | `*` |
| PATCH | `/lost-found/:id` | `*` owner or admin |
| PATCH | `/lost-found/:id/status` | `*` owner or admin |
| DELETE | `/lost-found/:id` | `*` owner or admin |

### Polls / voting
| Method | Path | |
|---|---|---|
| GET | `/polls` | `*` |
| GET | `/polls/:id` | `*` |
| GET | `/polls/:id/results` | `*` |
| POST | `/polls/:id/vote` | `*` body `{ "option_id": 2 }` — one per poll |
| POST | `/polls` | `**` body includes `options: ["A","B"]` |
| PATCH | `/polls/:id` | `**` e.g. `{ "status": "closed" }` |
| DELETE | `/polls/:id` | `**` |

### Notifications
| Method | Path | |
|---|---|---|
| GET | `/notifications` | `*` own inbox only |
| GET | `/notifications/unread-count` | `*` |
| PATCH | `/notifications/read-all` | `*` |
| PATCH | `/notifications/:id/read` | `*` |
| DELETE | `/notifications/:id` | `*` |

### Trying it with curl

```bash
TOKEN=$(curl -s -X POST http://localhost:5050/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"aung.kyaw.dev@gmail.com","password":"Student@123"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["token"])')

curl -s http://localhost:5050/api/study-buddy -H "Authorization: Bearer $TOKEN"
```

---

## 7. The response envelope

Every response, success or failure, has the same shape. The frontend unwraps
it in exactly one place (`apiFetch`), so no page ever handles a raw response.

**Success**

```json
{
  "success": true,
  "message": "Study buddies",
  "data": { "profiles": [] },
  "meta": { "page": 1, "limit": 20, "total": 42, "total_pages": 3, "has_next_page": true }
}
```

`meta` appears only on paginated endpoints.

**Failure**

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Enter a valid email address" }
  ]
}
```

Status codes in use: `200 201 204 400 401 403 404 409 422 429 500 503`.
Stack traces are never sent in production.

---

## 8. Authentication & authorisation

- `register` and `login` return `{ user, token }`. Send it back as
  `Authorization: Bearer <token>` — it is also set as an httpOnly cookie, and
  either transport works.
- `authenticate` verifies the signature **and re-loads the user from MySQL**
  on every request. A role change or a deleted account takes effect
  immediately; a token alone is never trusted for what it claims.
- `role` is never accepted from a client. Registration always writes
  `student`. Admins are promoted in the database:

  ```sql
  UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
  ```

- `password_hash` never appears in any response — `utils/serializers.js`
  removes it before anything is sent.
- Passwords: bcrypt, cost 12. Plaintext is never stored or logged.

### Three layers of admin control, only two of which are security

1. **UI** — admin buttons are hidden from students. *Convenience only.*
2. **Page guard** — `auth/guard.js` re-checks the role that `GET /api/auth/me`
   just returned from MySQL and redirects. Editing `localStorage` does not
   help: the cached copy is overwritten from the server on every page load.
3. **Backend** — every admin route mounts `authenticate + requireAdmin` and
   returns 403 regardless of what the frontend did. **This is the real
   boundary.** Everything above it is a convenience.

Verified: a student token sent straight at `POST/PUT/DELETE /api/competitions`
is rejected with 403 in all three cases, and `role: "admin"` in a register or
profile-update body is ignored.

---

## 9. Contact privacy — the core rule

`telegram` and `viber` live on `study_buddy_profiles` and are **private**.

The rule is enforced at the SQL layer, not in the UI:

- The browse and single-profile queries use a *public projection* that does
  not even select those columns. There is nothing to leak.
- They are selected only on the match-aware path — when the viewer is the
  owner, or a `buddy_requests` row with `status = 'accepted'` links the two
  users.

When unlocked, the API returns ready-made links rather than raw handles:

```json
"contact": {
  "telegram": {
    "handle": "@aungkyaw_dev",
    "url": "https://t.me/aungkyaw_dev",
    "app_url": "tg://resolve?domain=aungkyaw_dev"
  },
  "viber": {
    "handle": "+959111111111",
    "url": "viber://chat?number=%2B959111111111",
    "web_url": "https://www.viber.com/"
  }
}
```

Use `url` as the `href`: `https://t.me/<user>` opens the app on mobile when
installed and falls back to Telegram Web otherwise.

The frontend renders this in exactly one function — `contactMarkup()` in
`pages/study-buddy.js` — and only from `profile.contact`. It never assembles a
`t.me` link from raw fields, because for other people it never receives raw
fields.

**If you write a new query, do not `SELECT sb.*`.** Use the existing public
projection in `repositories/studyBuddy.repository.js`.

---

## 10. The frontend

Plain HTML, CSS and JavaScript. No framework, no bundler, no build step.

### Load order, on every page

```
utils/dom → utils/format → utils/validate
→ components/toast → states → modal → tabs → confirm
→ services/api → auth/auth → auth/guard
→ components/navbar → pages/<page>.js
```

Everything hangs off a single global, `window.UIT`. No inline JavaScript, no
other globals.

Paths are **root-relative** (`/services/api.js`, `/pages/dashboard.html`), so
links never break at any depth — which is why the site must be served with
`frontend/` as the web root, and why `file://` does not work.

### `services/api.js` is the only file that knows a URL

```js
const API_BASE_URL = 'http://localhost:5050/api';
```

Every call goes through `apiFetch()`, which:

- attaches `Authorization: Bearer <token>` when one exists
- serialises JSON bodies and builds querystrings
- unwraps `{ success, message, data, meta }`
- turns a failure into a typed `ApiError` carrying `status` and `errors[]`
- on **401**, clears the token and returns to the landing page
- reports a network failure as a friendly "server unreachable"

Pages never call `apiFetch` directly. They use the typed wrappers —
`api.polls.vote(...)`, `api.buddyRequests.accept(...)`.

### Session storage

The JWT lives in `localStorage.token`. A cached copy of the **public** user
object sits in `uit_user` purely so the first paint is instant;
`getCurrentUser()` always re-validates against `GET /api/auth/me`. Passwords,
hashes and secrets are never stored.

### Responsive design

Mobile-first: base styles target 320px, media queries add capability upward.

| Range | Behaviour |
|---|---|
| 320–767 | single column, hamburger drawer, full-width buttons |
| 768–1023 | 2-column grids, side-by-side fields, centred modals |
| 1024+ | horizontal navbar, 3–4 column grids, max-width container |
| 1440+ | container widens to 1320px |

Touch targets are `--tap: 44px`. Swipe uses `touch-action: pan-y`, and a
horizontal drag is only claimed once it exceeds 12px *and* is clearly more
horizontal than vertical — so vertical scrolling is never hijacked.

---

## 11. Adding a feature, end to end

Say you are adding **study groups**. Work bottom-up; each step is testable on
its own.

1. **Migration** — `database/migrations/010_create_study_groups.sql`.
   Then `cd backend && npm run db:migrate && npm run db:schema`.
2. **Repository** — `repositories/studyGroup.repository.js`. Every query
   parameterised. If it needs sorting, add the allowed columns to the
   allow-list in `utils/sql.js` — never interpolate an `ORDER BY`.
3. **Service** — `services/studyGroup.service.js`. Ownership, membership
   limits, who may delete. Throw `ApiError` for anything that fails.
4. **Validator** — `validators/studyGroup.validator.js`, using
   `common.validator.js` for ids and paging.
5. **Controller** — `controllers/studyGroup.controller.js`. Read `req`, call
   the service, `sendSuccess`. Nothing else.
6. **Route** — `routes/studyGroup.routes.js`, mounted in `routes/index.js`.
   Middleware order: `writeLimiter → authenticate → requireAdmin? →
   validator → validate → controller`.
7. **Frontend** — add the endpoints to `services/api.js`, then a
   `pages/study-groups.html` + `.js` pair, then a nav link in
   `components/navbar.js`.
8. **Seed** — add a few demo rows to `database/seed.sql` so the screen is not
   empty for the next person.
9. **Docs** — the endpoint table in §6 here, and the table list in
   `database/README.md` §4.

---

## 12. Conventions

- **`'use strict';`** at the top of every backend file. CommonJS `require`,
  not ESM.
- **Two-space indent**, semicolons, single quotes.
- **Names** — files `resource.layer.js` (`poll.service.js`); SQL tables and
  columns `snake_case`; JavaScript variables `camelCase`; the API speaks
  `snake_case` because it mirrors the columns.
- **Comments explain *why*.** The codebase is full of notes like "a trigger,
  not a CHECK, because MySQL 8.0 forbids…" — keep that habit. Do not write
  comments that restate the line below them.
- **No `console.log`.** Use `utils/logger.js`.
- **No `process.env` outside `config/env.js`.** Add the variable there, with a
  default, and to `.env.example`.
- **No SQL outside `repositories/`** and `database/`.
- **No `try/catch` in controllers.** Throw `ApiError`; `asyncHandler` and the
  error middleware do the rest.
- **Never edit an applied migration**, and never hand-edit
  `database/schema.sql` — it is generated.
- **Never commit `.env`.** It is gitignored; `.env.example` is the shared
  template.

---

## 13. Security checklist

| Concern | How it is handled |
|---|---|
| Passwords | bcrypt cost 12; plaintext never stored or logged |
| Auth | JWT signed with `JWT_SECRET`; the user is re-loaded from MySQL per request |
| Privilege | `authenticate` + `requireAdmin`, plus DB triggers on `created_by` |
| SQL injection | every value bound through `mysql2` prepared statements; `ORDER BY` and `LIMIT` come from allow-lists |
| Input | express-validator on every write endpoint; 422 with per-field errors |
| Private data | contact columns are excluded at the projection level, not filtered afterwards |
| Headers | helmet |
| CORS | explicit origin allow-list from `CLIENT_URL` |
| Rate limits | global, strict on auth, moderate on content creation |
| Uploads | multer with a type and size cap; `public/uploads/` is gitignored |
| Errors | one central formatter; stack traces never sent in production |
| Secrets | `.env` only, gitignored, no hard-coded credentials anywhere |
| Boot | env validated and MySQL proven reachable before the port is bound |

---

Setup and running: [README.md](README.md) ·
the database in detail: [`database/README.md`](database/README.md)
