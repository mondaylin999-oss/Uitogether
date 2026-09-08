# UITogether — Database

Everything the database needs lives in this one folder. No SQL file is stored
anywhere else in the repository.

```
database/
├── migrations/     the source of truth — 9 numbered .sql files, applied in order
├── schema.sql      all 9 migrations concatenated (generated, for import/review)
├── seed.sql        optional demo data — fake students, polls, competitions
└── reset.sql       drops everything, by hand (destructive)
```

**MySQL 8.0+** (or MariaDB 10.6+). The project was developed against MAMP's
MySQL, which listens on port **8889**; a standard MySQL install uses 3306.

---

## 1. The one command you need

You do not have to write SQL or create a table by hand. From `backend/`:

```bash
npm run db:setup     # creates uitogether_db + all tables, views and triggers
npm run db:seed      # optional: loads database/seed.sql (demo data)
```

`db:setup` reads `backend/.env` for the connection details, creates the
database if it is missing, then applies every file in `migrations/` that has
not been applied yet.

| Command (run inside `backend/`) | What it does |
|---|---|
| `npm run db:create` | Create the empty `uitogether_db` database only |
| `npm run db:migrate` | Apply pending migrations only |
| `npm run db:setup` | `db:create` + `db:migrate` — the normal first-run command |
| `npm run db:seed` | Load `seed.sql`. Re-runnable (`INSERT IGNORE`) |
| `npm run db:status` | Report applied / pending migrations and row counts |
| `npm run db:reset` | **Destructive.** Drop → setup → seed. Asks for confirmation |
| `npm run db:schema` | Regenerate `schema.sql` from `migrations/` |

The scripts themselves are Node files in `backend/scripts/db/` — they live
inside `backend/` because they import the backend's config and its installed
`mysql2` driver. This folder stays pure SQL.

---

## 2. Doing it by hand instead

If you would rather use MySQL Workbench, phpMyAdmin or the `mysql` client:

```bash
# 1. create the database
mysql -u root -p -P 8889 -h 127.0.0.1 -e "CREATE DATABASE uitogether_db
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. create the tables
mysql -u root -p -P 8889 -h 127.0.0.1 uitogether_db < database/schema.sql

# 3. optional demo data
mysql -u root -p -P 8889 -h 127.0.0.1 uitogether_db < database/seed.sql
```

Drop the `-P 8889 -h 127.0.0.1` if your MySQL is on the default 3306.

To start over: run `reset.sql`, then `schema.sql` again.

> One difference between the two routes: importing `schema.sql` by hand does
> **not** write the `schema_migrations` ledger, so the next `npm run db:migrate`
> will try to apply all 9 migrations again. The migrations are written with
> `CREATE TABLE IF NOT EXISTS`, so this is harmless — but `npm run db:setup` is
> the tidier path.

---

## 3. Migrations are the source of truth

`schema.sql` is **generated**. Never edit it by hand — your change would be
overwritten the next time anyone runs `npm run db:schema`.

To change the schema, add a new numbered file:

```
database/migrations/010_add_something.sql
```

Rules the migrator relies on:

- **Numbered prefix, applied in filename order.** `010_` comes after `009_`.
- **Never edit an applied migration.** Each file's checksum is recorded in
  `schema_migrations`; changing a file after it has run makes `db:migrate`
  stop and tell you. Write `011_fix_it.sql` instead.
- **Idempotent where possible** — `CREATE TABLE IF NOT EXISTS`,
  `CREATE OR REPLACE VIEW`.

Then regenerate the convenience file and check the result in:

```bash
cd backend && npm run db:schema && npm run db:migrate && npm run db:status
```

---

## 4. What is in the database

**9 tables, 2 views, 7 triggers**, plus the `schema_migrations` ledger the
migrator maintains for itself.

| Migration | Creates | Notes |
|---|---|---|
| `001_create_users.sql` | `users` | one row per account; `role` is `student` or `admin` |
| `002_create_study_buddy_profiles.sql` | `study_buddy_profiles` | one per user; `telegram` / `viber` are the private columns |
| `003_create_buddy_requests.sql` | `buddy_requests` + 2 triggers | a match *is* a row with `status = 'accepted'` |
| `004_create_competitions.sql` | `competitions` | admin writes only |
| `005_create_lost_found.sql` | `lost_found` | any student posts; owner or admin edits |
| `006_create_polls.sql` | `polls`, `poll_options`, `votes` | one vote per user per poll, enforced by a UNIQUE key |
| `007_create_notifications.sql` | `notifications` | one row per recipient |
| `008_create_views_and_triggers.sql` | `v_buddy_matches`, `v_poll_results` + 5 triggers | see below |
| `009_relax_email_domain.sql` | — | relaxes the email CHECK to accept any valid domain |

### The two views

- **`v_buddy_matches`** — expands each accepted request into *both*
  directions, so "who am I matched with" is one indexed lookup instead of an
  `OR` across `sender_id` and `receiver_id`.
- **`v_poll_results`** — per-option vote counts and percentages.

### The seven triggers

These duplicate rules the API already enforces. That is deliberate: if
something ever reaches MySQL by another route, the database still says no.

| Trigger | Refuses |
|---|---|
| `trg_requests_not_self_bi` / `_bu` | a buddy request where sender = receiver |
| `trg_competitions_admin_bi` / `_bu` | a competition whose `created_by` is not an admin |
| `trg_polls_admin_bi` / `_bu` | a poll whose `created_by` is not an admin |
| `trg_votes_poll_open_bi` | a vote on a closed or expired poll |

### Privacy note

`study_buddy_profiles.telegram` and `.viber` are private. The repository layer
has a "public" projection that does not even select those columns, so a
browse response cannot leak them. They are read only through the match-aware
query path — when the viewer is the owner, or an accepted `buddy_requests` row
links the two users. Do not add a query that selects `sb.*`.

---

## 5. Demo accounts (after `npm run db:seed`)

| Email | Password | Role |
|---|---|---|
| `admin.uitogether@gmail.com` | `Admin@123` | admin |
| `aung.kyaw.dev@gmail.com` | `Student@123` | student |
| `su.myat.noe.dev@gmail.com` | `Student@123` | student |
| `kyaw.zin.dev@gmail.com` | `Student@123` | student |
| `thiri.aung.dev@gmail.com` | `Student@123` | student |
| `min.khant.dev@gmail.com` | `Student@123` | student |
| `ei.phyu.dev@gmail.com` | `Student@123` | student |

Aung Kyaw and Su Myat Noe are seeded as already matched, so contact details
are unlocked between them the moment you log in.

Every row in `seed.sql` is fake local-development data. Never load it into a
real deployment.

There is no seeded way to become an admin other than the account above. To
promote yourself after registering:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

---

## 6. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `ER_ACCESS_DENIED_ERROR` | Wrong `DB_USER` / `DB_PASSWORD` in `backend/.env`. MAMP's default is `root` / `root` |
| `ECONNREFUSED 127.0.0.1:8889` | MySQL is not running, or it is on 3306. Start MAMP, or set `DB_PORT=3306` |
| `ER_BAD_DB_ERROR: Unknown database` | Run `npm run db:setup` |
| `ER_CHECK_CONSTRAINT_VIOLATED` on register | The email failed `chk_users_email_format`. Migration 009 must be applied — check `npm run db:status` |
| A migration is stuck as "pending" | Its checksum changed since it was applied. Restore the file, or add a new migration instead of editing it |
| Connecting over a socket, not TCP | Set `DB_SOCKET=/Applications/MAMP/tmp/mysql/mysql.sock` in `.env`; `DB_HOST`/`DB_PORT` are then ignored |

Full setup instructions: [`../README.md`](../README.md) ·
architecture and API: [`../README1.md`](../README1.md)
