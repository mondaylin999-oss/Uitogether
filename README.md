# UITogether

> **Connect. Study. Grow Together.**
>
> A student community web app: find a study buddy whose strengths complement
> yours, unlock each other's contacts only when *both* of you agree, keep up
> with university competitions and events, recover lost items, and vote in
> community polls.

```
Student A  →  Interested  →  Student B  →  Accept  →  Mutual match  →  Contact unlocked
```

This file is the **setup guide** — everything you need to get the app running
on your own computer. If you are here to work on the code, read
[README1.md](README1.md) instead: architecture, folder-by-folder layout, the
full API reference and the conventions the project follows.

---

## Table of contents

1. [What you need installed](#1-what-you-need-installed)
2. [Repository layout](#2-repository-layout)
3. [Install & run — the short version](#3-install--run--the-short-version)
4. [Step by step, the first time](#4-step-by-step-the-first-time)
5. [MySQL & MAMP — the full guide](#5-mysql--mamp--the-full-guide)
6. [Demo logins & your first run](#6-demo-logins--your-first-run)
7. [Windows setup](#7-windows-setup)
8. [Opening it from your phone](#8-opening-it-from-your-phone)
9. [Every command in one table](#9-every-command-in-one-table)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. What you need installed

| | Version | Why | Check with |
|---|---|---|---|
| **Node.js** | 18 or newer | runs the backend API | `node -v` |
| **npm** | ships with Node | installs the backend's packages | `npm -v` |
| **MySQL** | 8.0+ (or MariaDB 10.6+) | stores everything | `mysql --version` |
| **Python 3** *or* any static server | — | serves the frontend | `python3 --version` |

The frontend is plain HTML, CSS and JavaScript. **There is no build step, no
bundler and no framework** — nothing to compile, nothing to install for it.

MySQL is the only piece that needs a decision. This project was developed
against **MAMP**, whose MySQL listens on port **8889** instead of the usual
3306. Either works; section 5 covers both.

---

## 2. Repository layout

```
UITogether/
├── README.md      ← you are here — setup and running
├── README1.md       developer guide — architecture, API, conventions
├── database/        ALL the SQL lives here
│   ├── migrations/    9 numbered files — the source of truth
│   ├── schema.sql     the migrations concatenated (generated)
│   ├── seed.sql       optional demo data
│   ├── reset.sql      drops everything (destructive)
│   └── README.md      the database guide
├── backend/         Node.js + Express REST API
└── frontend/        plain HTML/CSS/JS app (no build step)
```

Three independent parts. The frontend talks to the backend **only** over HTTP
and never touches MySQL directly:

```
Frontend (:5500)  ──HTTP──▶  Backend API (:5050)  ──▶  MySQL (:8889 or :3306)
```

Nothing is mixed between the folders: no frontend file lives under `backend/`,
no backend file lives under `frontend/`, and no `.sql` file lives outside
`database/`.

---

## 3. Install & run — the short version

Three terminals' worth of work, once:

```bash
# ── 1) BACKEND — install and configure ──────────────────────────────
cd backend
npm install
cp .env.example .env
#   → open .env and set two things:
#       DB_PASSWORD = your MySQL password   (MAMP's default is "root")
#       JWT_SECRET  = a long random string  (command below generates one)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# ── 2) DATABASE — create every table ────────────────────────────────
npm run db:setup     # creates uitogether_db + 9 tables, 2 views, 7 triggers
npm run db:seed      # optional: demo students, polls, competitions

# ── 3) RUN — two terminals, both stay open ──────────────────────────
npm run dev                                   # terminal 1  → :5050
cd ../frontend && python3 -m http.server 5500 --bind 127.0.0.1   # terminal 2
```

Then open **<http://localhost:5500/index.html>**.

Check the API separately at <http://localhost:5050/api/health> — it should
answer `{"success":true,...,"database":"up"}`.

---

## 4. Step by step, the first time

### 4.1 Get the backend's packages

```bash
cd backend
npm install
```

### 4.2 Create `backend/.env`

`.env` holds your passwords, so it is deliberately **not** in the repository.
Copy the template:

```bash
cp .env.example .env        # Windows PowerShell:  Copy-Item .env.example .env
```

Two values must be filled in. Everything else has a working default.

```ini
# your MySQL password — MAMP's default root password is "root"
DB_PASSWORD=root

# any long random string; this signs the login tokens
JWT_SECRET=paste-the-64-character-string-here
```

Generate the secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

It must be at least 32 characters — the server refuses to start otherwise, on
purpose, so a half-configured install fails loudly instead of quietly running
with a guessable secret.

**Not using MAMP?** Change the port too:

```ini
DB_PORT=3306
```

### 4.3 Build the database

```bash
npm run db:setup
```

That single command creates `uitogether_db` and applies all 9 migrations —
9 tables, 2 views and 7 triggers. **You never write SQL or create a table by
hand.**

Add demo data so there is something to look at:

```bash
npm run db:seed
```

Check it worked:

```bash
npm run db:status     # lists applied migrations + row counts
```

If your MySQL user is not allowed to create databases, `db:setup` prints the
exact one-line `CREATE DATABASE` statement for you to run once — and nothing
more.

Everything about the database, including doing it by hand in MySQL Workbench:
[`database/README.md`](database/README.md).

### 4.4 Start the backend

```bash
npm run dev          # auto-restarts when you edit a file
```

You should see:

```
UITogether API listening on http://localhost:5050 [development]
Health check:  http://localhost:5050/api/health
```

The server checks its configuration and proves MySQL is reachable **before**
it binds the port, so if something is wrong you get a readable message
immediately rather than a 500 on your first click.

### 4.5 Serve the frontend

In a **second terminal**, from the repository root:

```bash
cd frontend
python3 -m http.server 5500 --bind 127.0.0.1
```

Any static server works — `npx serve -l 5500`, VS Code's Live Server — as long
as it serves on a port listed in `CLIENT_URL` in `backend/.env`. Allowed out
of the box:

```
http://localhost:5500, http://127.0.0.1:5500, http://localhost:5173, http://localhost:3000
```

> **Do not open `index.html` by double-clicking it.** A `file://` page has no
> origin, so the browser blocks every call to the API and the screen stays
> empty. It must be served over HTTP, with `frontend/` as the web root — the
> app's paths are root-relative.

Open <http://localhost:5500/index.html>.

---

## 5. MySQL & MAMP — the full guide

### 5.1 With MAMP (what this project was built against)

1. Install MAMP and start it. Click **Start Servers**.
2. MAMP's MySQL listens on **8889**, its user is `root` and its password is
   `root`.
3. In `backend/.env`:

   ```ini
   DB_HOST=127.0.0.1
   DB_PORT=8889
   DB_USER=root
   DB_PASSWORD=root
   DB_NAME=uitogether_db
   ```

4. `cd backend && npm run db:setup`

### 5.2 With a normal MySQL install

Same thing, port 3306:

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=uitogether_db
```

### 5.3 If MySQL only listens on a socket

Some macOS builds have no TCP port at all. Point `.env` at the socket instead;
`DB_HOST` and `DB_PORT` are then ignored:

```ini
DB_SOCKET=/Applications/MAMP/tmp/mysql/mysql.sock
# /usr/local/mysql builds:  DB_SOCKET=/tmp/mysql.sock
```

### 5.4 Seeing the data

phpMyAdmin (bundled with MAMP at <http://localhost:8888/phpMyAdmin>) or MySQL
Workbench both work. Connect, select `uitogether_db`, and you will find the 9
tables listed in [`database/README.md`](database/README.md).

---

## 6. Demo logins & your first run

After `npm run db:seed`:

| Email | Password | Role |
|---|---|---|
| `admin.uitogether@gmail.com` | `Admin@123` | **admin** |
| `aung.kyaw.dev@gmail.com` | `Student@123` | student |
| `su.myat.noe.dev@gmail.com` | `Student@123` | student |
| `kyaw.zin.dev@gmail.com` | `Student@123` | student |
| `thiri.aung.dev@gmail.com` | `Student@123` | student |
| `min.khant.dev@gmail.com` | `Student@123` | student |
| `ei.phyu.dev@gmail.com` | `Student@123` | student |

### The whole app in three minutes

1. **Log in** as `aung.kyaw.dev@gmail.com` / `Student@123`.
2. **Study Buddy** → browse the other students. Notice that nobody's Telegram
   or Viber is shown. That is not the UI hiding it — the API does not send it.
3. Open **Su Myat Noe**. You two are seeded as already matched, so her contact
   links *are* there, ready to tap.
4. Press **Interested** on someone new, say Kyaw Zin. Nothing unlocks yet.
5. **Log out**, log in as `kyaw.zin.dev@gmail.com` / `Student@123`. There is a
   badge on the bell. **Accept** the request.
6. Now each of you can see the other's contacts. That is the entire product in
   one loop.
7. **Log in as the admin** to create a competition or a poll, and watch those
   controls disappear again when you go back to a student account.

Registering a new account always creates a **student**. The role is never
taken from the client — not from the form, not from `localStorage`, not from
the request body. To make yourself an admin, change it in the database:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

Any valid email domain may register — gmail, yahoo, outlook, a university
address. **This is not Google sign-in**: the password is a UITogether account
password, hashed with bcrypt.

---

## 7. Windows setup

Everything is the same; only the shell commands differ.

```powershell
# once
cd backend
npm install
Copy-Item .env.example .env
notepad .env                 # set DB_PASSWORD and JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm run db:setup
npm run db:seed
```

```powershell
# terminal 1 — backend
cd backend
npm run dev

# terminal 2 — frontend
cd frontend
python -m http.server 5500 --bind 127.0.0.1
```

If `python` is not installed, use Node instead:

```powershell
npx serve -l 5500 frontend
```

On Windows, MySQL is usually on **3306**, so set `DB_PORT=3306` in `.env`.

---

## 8. Opening it from your phone

Same Wi-Fi, no internet needed.

1. Find your computer's local address:
   `ipconfig` (Windows) or `ipconfig getifaddr en0` (macOS) — something like
   `192.168.1.24`.
2. Serve the frontend on all interfaces, not just localhost:

   ```bash
   cd frontend && python3 -m http.server 5500 --bind 0.0.0.0
   ```

3. Tell the frontend where the API is. In `frontend/services/api.js`:

   ```js
   const API_BASE_URL = 'http://192.168.1.24:5050/api';
   ```

4. Allow that origin in `backend/.env`, then restart the backend:

   ```ini
   CLIENT_URL=http://localhost:5500,http://127.0.0.1:5500,http://192.168.1.24:5500
   ```

5. On the phone, open `http://192.168.1.24:5500/index.html`.

Both devices talk to the same database, so a request sent on your laptop shows
up on the phone.

---

## 9. Every command in one table

All of these run inside `backend/`.

| Command | What it does |
|---|---|
| `npm install` | Install the API's packages (once) |
| `npm run dev` | Start the API with auto-restart — **the one you use** |
| `npm start` | Start the API without auto-restart |
| `npm run db:setup` | Create the database and apply all migrations |
| `npm run db:seed` | Load the demo data |
| `npm run db:status` | Which migrations are applied, and row counts |
| `npm run db:migrate` | Apply pending migrations only |
| `npm run db:create` | Create the empty database only |
| `npm run db:reset` | **Destructive.** Drop → setup → seed (asks first) |
| `npm run db:schema` | Regenerate `database/schema.sql` from the migrations |

And, from `frontend/`:

| Command | What it does |
|---|---|
| `python3 -m http.server 5500 --bind 127.0.0.1` | Serve the frontend |
| `npx serve -l 5500` | The same, without Python |

---

## 10. Troubleshooting

| What you see | What it means |
|---|---|
| `JWT_SECRET is missing` / `too short` | `backend/.env` has no secret, or fewer than 32 characters. Generate one with the `node -e` command in §4.2 |
| `Could not connect to MySQL` | MySQL is not running, or the port is wrong. Start MAMP; check `DB_PORT` (8889 for MAMP, 3306 otherwise) |
| `ER_ACCESS_DENIED_ERROR` | Wrong `DB_USER` / `DB_PASSWORD`. MAMP's default is `root` / `root` |
| `Unknown database 'uitogether_db'` | Run `npm run db:setup` |
| Page loads but every panel is empty | The backend is not running, or the frontend was opened with `file://`. Serve it over HTTP (§4.5) and check <http://localhost:5050/api/health> |
| Browser console: *blocked by CORS policy* | The port you served the frontend on is not in `CLIENT_URL` in `backend/.env`. Add it and restart the backend |
| `EADDRINUSE :5050` | Something else is on that port. Change `PORT` in `.env` — and then `API_BASE_URL` in `frontend/services/api.js` to match |
| `EADDRINUSE :5000` on macOS | That is the AirPlay Receiver. This project uses 5050 for exactly that reason |
| Logged in but the Admin link is missing | That account is a student. Promote it with the `UPDATE users` statement in §6 |
| Contact details never appear | They unlock only after the *other* person accepts. Follow the loop in §6 |
| `npm run db:migrate` says a migration changed | An already-applied file was edited. Restore it and add a new numbered migration instead — see [`database/README.md`](database/README.md) §3 |

Still stuck? [`database/README.md`](database/README.md) covers the database in
detail, and [README1.md](README1.md) explains how the pieces fit together.

---

## Stack

- **Backend** — Node.js, Express, MySQL (`mysql2`), REST
- **Auth** — JWT + bcrypt (cost 12)
- **Frontend** — plain HTML5, CSS3, vanilla JavaScript; no framework, no build
- **Database** — MySQL 8: 9 tables, 2 views, 7 triggers, 9 migrations
