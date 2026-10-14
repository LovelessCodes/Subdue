# Subdue

**Self-hosted subscription tracker.** Your subscriptions, their due dates, and what they actually cost — in one place you own.

> Subdue: subscription **due** dates — and a good verb for taking control of them.

**Status: early, but alive.** Dashboard (with pay-period budgets), calendar, subscriptions, and the reminder inbox are live in the browser, backed by a tested engine for recurrence, currencies, and monthly totals. Reminders deliver through email, ntfy, Telegram, Discord, and webhooks, and your data moves in and out freely — JSON, CSV, a one-file backup, and a Wallos importer that reads the real thing.

## Why

Subscription trackers keep getting solved and unsolved at the same time: clouds that charge a monthly fee to track your monthly fees, self-hosted tools that get 90% right and stall on the last 10%, and "simple CRUD" apps where the recurrence math quietly lies to you.

Subdue is our answer to all three. Four principles:

- **Your data is yours.** One SQLite file, one folder of logos. A backup is a file copy; a restore is putting it back.
- **Boring deployment.** One container, one volume, fine on a NAS. No database to babysit, no account to create.
- **Boringly correct.** Recurrence, time zones, currencies — pure functions with tests. The 31st of January exists; we plan for it.
- **Typed through the stack.** Database schema to rendered DOM, no stringly-typed handshakes in between.

## Stack

| Concern   | Choice                                                                                       |
| --------- | -------------------------------------------------------------------------------------------- |
| Framework | [TanStack Start](https://tanstack.com/start) — React 19, file-based routes, server functions |
| Language  | TypeScript, strict                                                                           |
| Styling   | Tailwind CSS v4                                                                              |
| UI        | [shadcn/ui](https://ui.shadcn.com) on [Base UI](https://base-ui.com) — Nova preset, copy-in  |
| Auth      | [better-auth](https://better-auth.com) — email/password, API keys, admin; CRUD as plugins    |
| Tooling   | [oxlint](https://oxc.rs) + [oxfmt](https://oxc.rs) (lint + format)                           |
| Database  | SQLite — Drizzle + better-sqlite3, WAL + busy timeout                                        |
| Build     | Vite                                                                                         |

## Roadmap

Directions, not promises. Each milestone should end in something usable and tested.

### M0 — Foundation (current)

- [x] TanStack Start + TypeScript scaffold
- [x] SQLite with WAL and a sane busy timeout, from the first migration
- [x] Drizzle schema + migrations that run on boot
- [x] Single-user login (multi-user designed in, not bolted on later)
- [x] User settings (currency, locale, week start, theme)

### M1 — Track

- [x] Subscriptions: price, cycle (custom N× days/weeks/months/years), categories, payment methods, notes
- [x] Recurrence engine: next payment, prior payments, overdue — specified and tested before it ships
- [x] Currencies with daily exchange rates (ECB, no API key needed)

### M2 — See

- [x] Dashboard: monthly cost, upcoming payments, what changed since last month
- [x] Calendar view
- [x] Budgets, including pay-period anchoring

### M3 — Get told

- [x] Reminders: N days before a charge, with per-subscription overrides
- [x] Channels: SMTP email first, then ntfy / Telegram / Discord / generic webhooks
- [x] An in-app inbox so nothing gets missed

### M4 — Fit into the house

- [x] Import from Wallos backups and CSV
- [x] Export: JSON/CSV and a one-file backup
- [x] iCal feed
- [x] REST API (API keys) — for scripts, dashboards, and MCP servers
- [x] MCP server — OAuth-protected tools for MCP clients (read-only for now)
- [x] PWA (installable; offline behaviour is [#8](https://github.com/LovelessCodes/Subdue/issues/8))

### M5 — Ship it properly

- [x] Docker image: one volume, healthcheck, self-migrating
- [x] CI that runs lint, typecheck, and tests on every pull request
- [x] Release automation (tag-driven image + notes; the first tag is yours to cut)

### Explicit non-goals (for now)

- Feature parity with anything — parity with how people actually use it is the goal.
- AI recommendations, gamification, engagement loops.
- A mobile app before the web app is excellent on a phone.

## Development

Needs [Bun](https://bun.sh) (preferred) or a recent Node.

First run: `cp .env.example .env`. Everything in it is optional — the auth secret is generated on first boot (stored next to the database) and the base URL is derived from requests.

```bash
bun install                # dependencies
bun run dev                # http://localhost:3000
bun run build              # production build
bun run check              # oxlint + oxfmt --check
bun run format             # rewrite files with oxfmt
bun run typecheck          # tsc --noEmit
bun run test               # vitest
bun run start              # production server (after bun run build)
```

`src/routeTree.gen.ts` is generated by TanStack Router on dev/build — don't edit it by hand. `src/lib/auth-schema.ts` is generated from the better-auth config (`bunx auth@latest generate`) — don't edit it by hand either. Migrations in `drizzle/` apply automatically on server boot; after schema changes, create the next one with `bunx drizzle-kit generate`.

UI components are copy-in files in `src/components/ui` (shadcn/ui on Base UI — add more with `bunx --bun shadcn@latest add <name>`). The theme lives in `src/styles.css`, and scroll containers can use the shipped `scroll-fade` utility: `<ScrollArea viewportClassName="scroll-fade">`.

## Deploy

**Docker, built locally:**

```bash
docker build -t subdue .
docker run -d --name subdue -p 3000:3000 -v ./data:/data subdue
```

**Docker Compose:** copy `.env.example` to `.env` (all values optional) and `docker compose up -d`.

One volume (`/data`) holds the SQLite database — WAL mode, so the `-wal` and `-shm` files travel with it — and migrations run automatically on every boot: upgrading is pulling a new image. Tagged releases publish a multi-arch image to `ghcr.io/lovelesscodes/subdue`:

```bash
git tag v0.1.0 && git push origin v0.1.0   # builds amd64 + arm64, writes release notes
```

Three settings matter when the instance is not on `http://localhost:3000`:

- `BETTER_AUTH_URL` must match the URL you browse (host **and** port) — better-auth rejects requests from other origins. Multi-host setups are [#9](https://github.com/LovelessCodes/Subdue/issues/9).
- `MCP_RESOURCE_URL` should point at your public `/api/mcp` if you use MCP clients.
- The container runs as root and writes to `/data`; on a NAS, pre-create that folder with your own ownership if it matters to you.

## API & docs

- **Interactive reference** (Scalar): `/api/auth/reference` on a running instance — covers every endpoint, including the plugin ones.
- **Machine-readable spec**: [`openapi.json`](./openapi.json); regenerate with `bun run openapi` after endpoint changes.
- **MCP**: the app serves an MCP endpoint at `/api/mcp`, protected by OAuth (dynamic client registration, CIMD, PKCE). Point an MCP client at `http://localhost:3000/api/mcp` — it discovers the authorization server, and you approve access on the consent page.
- **Scripts & API keys**: `POST /api/auth/api-key/create` returns a key (shown once). Call any endpoint with `x-api-key: <key>` instead of a session cookie — keys are full-access per user, rate-limited (600 requests/hour), and revocable through the same API. A management UI is [#7](https://github.com/LovelessCodes/Subdue/issues/7).

## Notifications

Reminders deliver through any combination of channels — configured per user via the API for now (a settings UI is coming):

| Type       | Config                                                   |
| ---------- | -------------------------------------------------------- |
| `email`    | `{ host, port, secure, username, password, from, to }`   |
| `ntfy`     | `{ server, topic, token? }`                              |
| `telegram` | `{ botToken, chatId }`                                   |
| `discord`  | `{ webhookUrl }`                                         |
| `webhook`  | `{ url, secret? }` — JSON POST `{ title, body, source }` |

```bash
# with your session cookie in cookies.txt
curl -X POST http://localhost:3000/api/auth/channels/create \
  -H 'content-type: application/json' -b cookies.txt \
  -d '{"type":"ntfy","name":"Phone","config":{"topic":"my-subs"}}'
```

Every send is queued and retried up to three times; `/api/auth/channels/deliveries` shows what was sent, and `/api/auth/channels/test` fires a test message through one channel. The reminder tick runs in-process every five minutes — no cron to configure.

## Moving your data

Three exports, all session-gated file downloads:

```bash
curl -b cookies.txt -O -J http://localhost:3000/api/export/json     # versioned JSON bundle
curl -b cookies.txt -O -J http://localhost:3000/api/export/csv      # round-trippable CSV
curl -b cookies.txt -O -J http://localhost:3000/api/export/backup   # full SQLite copy (VACUUM INTO)
```

Two imports, both with a dry run that reports exactly what would happen without writing anything:

```bash
curl -b cookies.txt -X POST 'http://localhost:3000/api/import/wallos?dryRun=1' \
  --data-binary @Wallos-Backup-20260101-120000.zip
curl -b cookies.txt -X POST 'http://localhost:3000/api/import/csv?dryRun=1' \
  --data-binary @subdue-subscriptions-2026-01-01.csv
```

The Wallos importer reads the raw `wallos.db` inside a backup zip (a bare `.db` works too) and follows Wallos semantics: cycle days plus frequency become Subdue cycles, decimal prices become minor units, and per-subscription reminder overrides carry over. Duplicate names are skipped; inactive subscriptions and one-time payments are reported rather than imported.

## Calendar feed

Subscribe your calendar to Subdue — every payment in the next 12 months, expanded by the same recurrence engine that powers the app, with an alarm set from each subscription's reminder days (per-subscription overrides included):

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/auth/ical/enable
# → { "token": "...", "path": "/api/ical/<token>" }
```

Add `http://localhost:3000/api/ical/<token>` as a calendar subscription in anything that speaks iCal (Google Calendar, Apple Calendar, Fastmail…). Rotate with `/api/auth/ical/rotate`, revoke with `/api/auth/ical/disable`. The URL is a bearer credential — treat it like a password.

## Install it

Subdue is a PWA: it installs from any modern browser (manifest, icons, theme color). The service worker is deliberately non-caching — a stale due date is worse than an offline screen — so "offline support" is honest for now: the app needs its server. Making offline real is [#8](https://github.com/LovelessCodes/Subdue/issues/8).

## Contributing

Very early days: for anything structural, please open an issue before a big pull request so we can agree on the shape first. Small fixes are welcome as-is.

## Credits & thanks

- **[Wallos](https://github.com/ellite/Wallos)** — the self-hosted subscription tracker that showed this category deserves to exist. Subdue is an independent, from-scratch rebuild: it shares no code with Wallos and is not affiliated with it. The nod is one of respect — if you want a mature tracker today, go run Wallos.
- **[TanStack](https://tanstack.com)** — for Start, Router, and making the web fun again.
- Every self-hoster who would rather run `docker compose up` than rent another subscription.

## License

[MIT](./LICENSE) © 2026 LovelessCodes
