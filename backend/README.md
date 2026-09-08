# UITogether — Backend API

Node.js + Express + MySQL REST API for the UITogether student community app.
JWT authentication, bcrypt password hashing, fully automated database setup.

> The frontend is **not** part of this folder — it is a separate plain
> HTML/CSS/JS app that calls this API.
>
> **The SQL is not in this folder either.** Migrations, `schema.sql`,
> `seed.sql` and `reset.sql` all live in [`../database/`](../database/README.md).
> Only the Node automation that drives them stays here, in `scripts/db/`,
> because it needs this folder's config and its installed `mysql2` driver.

---

## 1. Quick start

```bash
cd backend
npm install
# put your MySQL password in .env (the ONE manual step)
npm run db:setup     # creates uitogether_db + all tables/views/triggers
npm run db:seed      # optional demo data
npm run dev
```

Then open <http://localhost:5050/api/health>.

### The one manual prerequisite

MySQL will not give a script its own credentials. Open `backend/.env` and set:

```
DB_PASSWORD=your_mysql_password
```

Everything else (creating the database, all 9 tables, 2 views, 7 triggers) is
automatic. **You never write SQL or create a table by hand.**

If your MySQL user is not allowed to create databases, `npm run db:setup`
prints the exact one-line `CREATE DATABASE` statement to run once — and
nothing more.

---

## 2. npm scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start with nodemon (auto-restart) |
| `npm start` | Start normally |
| `npm run db:setup` | **Create the database + apply all migrations** |
| `npm run db:seed` | Load `../database/seed.sql` (demo data, re-runnable) |
| `npm run db:migrate` | Apply pending migrations only |
| `npm run db:create` | Create the database only |
| `npm run db:status` | Show applied/pending migrations + row counts |
| `npm run db:reset` | **Destructive.** Drop → setup → seed (asks for confirmation) |
| `npm run db:schema` | Regenerate `../database/schema.sql` from the migrations |

---

## 3. Architecture

```
routes/        HTTP surface + which middleware guards each endpoint
controllers/   thin: read req, call a service, format the response
services/      ALL business rules (match rules, ownership, admin checks)
repositories/  ALL SQL. Nothing else in the app writes a query.
middleware/    auth, admin, validation, rate limit, error handling
validators/    express-validator chains
utils/         errors, responses, jwt, bcrypt, contact links, serializers
config/        env, MySQL pool, shared enums
scripts/db/    the automation behind the npm run db:* commands
```

Request flow:

```
route -> rateLimit -> authenticate -> requireAdmin? -> validator -> validate
      -> controller -> service -> repository -> MySQL
                                    |
                       errors ------+--> error.middleware (single formatter)
```

---

## 4. Response format

Success:

```json
{
  "success": true,
  "message": "Study buddies",
  "data": { "profiles": [] },
  "meta": { "page": 1, "limit": 20, "total": 42, "total_pages": 3, "has_next_page": true }
}
```

Failure:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "email", "message": "Only @gmail.com email addresses are accepted" }]
}
```

Status codes used: `200 201 204 400 401 403 404 409 422 429 500 503`.

> Project-wide docs: setup is in [`../README.md`](../README.md), the
> architecture and conventions in [`../README1.md`](../README1.md), the
> database in [`../database/README.md`](../database/README.md).

---

## 5. Authentication

- `POST /api/auth/register` and `/login` return `{ user, token }`.
- Send the token as `Authorization: Bearer <token>` (also set as an httpOnly
  cookie for convenience — either transport works).
- Any valid email domain may register (gmail, yahoo, outlook, university
  addresses). **This is not Google OAuth** — the password is a UITogether
  account password, hashed with bcrypt. The format rule is enforced in both
  `auth.validator.js` and the `chk_users_email_format` CHECK (migration 009).
- `role` is never accepted from the client. Registration always creates a
  `student`; admins are promoted directly in the database:

  ```sql
  UPDATE users SET role = 'admin' WHERE email = 'you@gmail.com';
  ```

- `password_hash` is never present in any API response.

---

## 6. API endpoints

`*` = requires a valid token &nbsp;•&nbsp; `**` = requires token **and** admin role

### Auth
| Method | Path | |
|---|---|---|
| POST | `/api/auth/register` | |
| POST | `/api/auth/login` | |
| GET | `/api/auth/me` | `*` |
| POST | `/api/auth/logout` | `*` |

### Profiles (account)
| Method | Path | |
|---|---|---|
| GET | `/api/profiles/me` | `*` |
| PATCH | `/api/profiles/me` | `*` |
| PATCH | `/api/profiles/me/password` | `*` |
| GET | `/api/profiles/:userId` | `*` |

### Study Buddy
| Method | Path | |
|---|---|---|
| POST | `/api/study-buddy/profile` | `*` create own (one per user) |
| GET | `/api/study-buddy/profile/me` | `*` |
| PATCH | `/api/study-buddy/profile/me` | `*` |
| DELETE | `/api/study-buddy/profile/me` | `*` |
| GET | `/api/study-buddy` | `*` browse — **no contact details** |
| GET | `/api/study-buddy/:userId` | `*` contacts only if matched |

Browse filters: `?semester=&study_style=&wanna_meet=&subject=&q=&sort=&page=&limit=`

### Buddy Requests — the core flow
| Method | Path | |
|---|---|---|
| POST | `/api/buddy-requests` | `*` body `{ "receiver_id": 3 }` |
| GET | `/api/buddy-requests/incoming` | `*` |
| GET | `/api/buddy-requests/outgoing` | `*` |
| GET | `/api/buddy-requests/pending-count` | `*` |
| PATCH | `/api/buddy-requests/:id/accept` | `*` receiver only |
| PATCH | `/api/buddy-requests/:id/reject` | `*` receiver only |
| DELETE | `/api/buddy-requests/:id` | `*` sender only, while pending |

### Matches — contact unlocked
| Method | Path | |
|---|---|---|
| GET | `/api/matches` | `*` |
| GET | `/api/matches/:userId` | `*` 404 if not matched |

### Competitions
| Method | Path | |
|---|---|---|
| GET | `/api/competitions` | `*` `?scope=upcoming\|past\|all` |
| GET | `/api/competitions/:id` | `*` |
| POST | `/api/competitions` | `**` |
| PUT | `/api/competitions/:id` | `**` |
| DELETE | `/api/competitions/:id` | `**` |

### Lost & Found
| Method | Path | |
|---|---|---|
| GET | `/api/lost-found` | `*` `?type=&status=&mine=true&q=` |
| GET | `/api/lost-found/:id` | `*` |
| POST | `/api/lost-found` | `*` |
| PATCH | `/api/lost-found/:id` | `*` owner or admin |
| PATCH | `/api/lost-found/:id/status` | `*` owner or admin |
| DELETE | `/api/lost-found/:id` | `*` owner or admin |

### Polls / Voting
| Method | Path | |
|---|---|---|
| GET | `/api/polls` | `*` |
| GET | `/api/polls/:id` | `*` |
| GET | `/api/polls/:id/results` | `*` |
| POST | `/api/polls/:id/vote` | `*` body `{ "option_id": 2 }` — one vote per poll |
| POST | `/api/polls` | `**` body includes `options: ["A","B"]` |
| PATCH | `/api/polls/:id` | `**` e.g. `{ "status": "closed" }` |
| DELETE | `/api/polls/:id` | `**` |

### Notifications
| Method | Path | |
|---|---|---|
| GET | `/api/notifications` | `*` own inbox only |
| GET | `/api/notifications/unread-count` | `*` |
| PATCH | `/api/notifications/read-all` | `*` |
| PATCH | `/api/notifications/:id/read` | `*` |
| DELETE | `/api/notifications/:id` | `*` |

### Health
`GET /api/health` — public, reports process + MySQL status.

---

## 7. Contact unlocking

`telegram` and `viber` live on `study_buddy_profiles` and are **private**.

- Browse and single-profile endpoints run a SQL projection that does not even
  select those columns.
- They are returned only when the viewer is the owner, or when
  `buddy_requests.status = 'accepted'` exists between the two users.

When unlocked, the API returns ready-to-use links:

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

`https://t.me/<user>` opens the Telegram app on mobile when installed and
falls back to Telegram Web otherwise — use it as the `href`.

---

## 8. Security

| Concern | How it is handled |
|---|---|
| Passwords | bcrypt (cost 12), plaintext never stored or logged |
| Auth | JWT signed with `JWT_SECRET`, user re-loaded from DB per request |
| Privilege | `authenticate` + `requireAdmin`, plus DB triggers on `created_by` |
| SQL injection | every value bound via `mysql2` prepared statements; ORDER BY / LIMIT come from allow-lists |
| Input | express-validator on every write endpoint |
| Headers | helmet |
| CORS | explicit origin allow-list from `CLIENT_URL` |
| Rate limits | global, stricter on auth, moderate on content creation |
| Errors | one central handler; stack traces never sent in production |
| Secrets | `.env` only, gitignored; no hard-coded credentials |

---

## 9. Demo accounts (after `npm run db:seed`)

| Email | Password | Role |
|---|---|---|
| `admin.uitogether@gmail.com` | `Admin@123` | admin |
| `aung.kyaw.dev@gmail.com` | `Student@123` | student |
| `su.myat.noe.dev@gmail.com` | `Student@123` | student |
| `kyaw.zin.dev@gmail.com` | `Student@123` | student |

Aung Kyaw and Su Myat Noe are already matched, so `/api/matches` shows an
unlocked contact immediately.
