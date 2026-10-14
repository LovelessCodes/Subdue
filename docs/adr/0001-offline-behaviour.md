# ADR 0001 — Offline behaviour for the PWA

Status: accepted · 2026-10-14 · issue [#8](https://github.com/LovelessCodes/Subdue/issues/8)

## Context

Subdue installs as a PWA. The first service worker was deliberately a passthrough: caching a finance app's data without a story for staleness is how you end up showing someone a due date that already changed. But a passthrough means a flaky connection or a sleeping NAS produces a browser error page — poor for the self-hosted setting Subdue targets.

The candidates were: (a) stay online-only and document it, (b) cache the app shell, (c) shell plus a read-only cached dashboard with a freshness indicator.

## Decision

**Network-first for page navigations, cache-first for content-hashed assets, and no caching of API or server-function responses.**

- Online, every navigation hits the server and the cache is refreshed — there is no stale-while-online window.
- Offline or on network failure, a previously visited page is served from Cache Storage with an injected banner naming the timestamp of the cached copy ("showing a cached copy from …").
- A page never visited gets a plain offline notice, not a fabricated screen.
- The cache holds rendered HTML (which contains your data) — the same trust boundary as the browser's own cache, so it is per-device and cleared by normal browser-profile cleanup.
- `sw.js` is served `no-cache`, and the cache name is versioned so strategy changes evict old entries on activation.

## Consequences

- Your subscriptions survive dead wifi, visibly labelled as possibly stale.
- Offline only works for pages visited while the service worker was active — realistically from the second visit onwards. The worker cannot invent data it has never seen.
- Signing out or rotating the auth secret does not clear the cache; the last-rendered pages remain readable on that device until a successful visit replaces them. Treat a shared browser profile accordingly.
- If offline rendering ever needs richer semantics (deferred mutations, background sync), that is a new ADR.
