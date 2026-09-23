# Hordex — the swarm that tests your app before your users do

Point Hordex at a web app you own and it unleashes a swarm of AI-driven bots
that use it the way real, imperfect people do — clicking, typing, mis-clicking,
backtracking, double-submitting, pasting emojis and giant text into forms — and
reports what breaks: **dead buttons, JavaScript crashes, failed form submits,
broken links, and server errors**, before your real users hit them. A
"reverse-engineered zombie attack": your own swarm finds the breakage first.

It's black-box — the bots only ever hit the app over HTTP, the way a real
visitor does. No source code, no SDK in your app, nothing installed.

> **This is a user-simulation testing tool, not a security scanner.** It
> exercises your app's normal features to find things that are broken. It does
> not probe for vulnerabilities.

> **Safe by design.** A **no-go scope** keeps the bots away from anything
> destructive (delete, pay, log out…) — see below. And Hordex only scans a
> target after you confirm you own it.

---

## Why it exists

Apps built fast with AI coding tools (Lovable, Bolt, Replit, Cursor, v0, …) ship
with predictable, recurring breakage and usually no QA. Clicking through an app
by hand is slow and misses the messy, concurrent, weird-input paths that
actually fail in production. Hordex gives solo builders far broader, faster
coverage than manual testing — many "users" at once, each behaving differently.
It does **not** claim to "test everything" (impossible for any real app); it's
coverage, not completeness.

---

## How it works

```
                    ┌──────────────────────────────────────────────┐
  Live dashboard ◄──┤ Orchestrator — spawns N bots, one shared brain │
   (WebSocket)      │   │                                            │
                    │   ├─ Bot: real headless Chromium + a persona   │
                    │   │    + Claude-driven decisions (heuristic     │
                    │   │    fallback when no API key)                │
                    │   │                                             │
                    │   ├─ Shared memory (SQLite): visited pages,     │
                    │   │    issues, and a coverage-guided frontier    │
                    │   │    → bots divide the app, dedupe, and get    │
                    │   │      smarter across runs ("trained memory")  │
                    │   └─ Scope guard: no-go pages/actions enforced   │
                    │        before a bot can ever click them         │
                    └──────────────────────────────────────────────┘
```

- **Personas** (`server/personas.js`) — impatient skimmer, unfamiliar user,
  keyboard power-user, bad-connection mobile, and a **chaos user** that types
  the messy things real people type (emojis, huge pastes, empty fields). None of
  them attack the app.
- **Coverage-guided exploration** (`server/memory.js`) — bots are rewarded for
  reaching *new* pages, not random wandering. The shared frontier is claimed
  atomically so N bots split the work instead of duplicating it. Crawl bounds
  (`MAX_PAGES`, `MAX_DEPTH`) keep a big site from ballooning the queue.
- **Trained memory + before-vs-after** — every page and issue is remembered per
  target, so a re-scan knows the app and flags what's **newly broken since last
  time** (the payoff of testing after each change).
- **The brain** (`server/brain.js`) — Claude gets a compact description of the
  page + the persona and returns a short plan of human-like actions. No key? A
  deterministic heuristic keeps the swarm (and the offline self-test) running.

### The no-go scope (safety)

Once bots behave like real users, they can do the damaging things real users can
do. Scope fences that off (`server/scope.js`), and it's enforced **inside the
bots** — blocked pages never enter the queue, blocked controls are removed
before a bot decides anything:

- **No-go actions** — button/link text that means "don't click". Destructive
  defaults (delete, pay, checkout, log out, unsubscribe, deactivate, …) are
  **always on and can't be switched off**; you can add your own words.
- **No-go pages** — path prefixes never visited (e.g. `/admin`, `/billing`).
- **`data-hordex-skip`** — tag any element in your own code to mark it off-limits.
- **Include-only** — optionally restrict the swarm to a section of the app.

Everything the swarm avoids is shown live ("🚫 avoided Delete account") and
listed in the report. Scope is never paywalled.

---

## Run it

```bash
cd hordex
npm install            # Chromium is used headless; in this env it's pre-provisioned
npm start              # dashboard at http://localhost:3000
```

Open the dashboard, tick **"I own / am authorized to test this"**, and hit
**Release the swarm**. Leave the target as `demo` to test the bundled
deliberately-buggy app (`demo-target/app.js`), or paste your own dev-server URL
(localhost / private hosts are allowed; set `HORDEX_ALLOW_PUBLIC=1` for a public
site you own).

**Optional — real AI brains:** set `ANTHROPIC_API_KEY` to have Claude drive the
bots. Without it, the heuristic brain is used (fully functional).

### Prove it works (offline, headless)

```bash
npm test               # boots the buggy demo, runs the swarm, and asserts:
                       #  • every planted functional bug is found
                       #  • the no-go scope blocks every destructive route
                       #  • findings dedupe and memory persists across runs
```

Expected: `✅ PASS`.

---

## Free vs Pro (RevenueCat)

Hordex monetizes with **one in-app purchase** via **RevenueCat**:

| | Free | **Pro** |
|---|---|---|
| Scans | **one demo scan** | **unlimited** |
| Swarm size | 5 bots | up to 20 |
| Before-vs-after re-runs | — | ✓ |
| Report export | — | ✓ |
| No-go scope (safety) | ✓ | ✓ |

The paywall is enforced **on the server** (`server/entitlements.js`): the backend
asks RevenueCat whether the app-user actually holds Pro, and tracks the one-time
free scan per install — so it can't be bypassed by calling the API directly. In
the mobile app the unlock is a real RevenueCat purchase via the **Test Store**,
which needs no paid Apple/Google account (see `paywall/`).

---

## Layout

```
hordex/
  server/
    index.js         Express + WebSocket server; REST to start/stop scans; Free/Pro gate
    orchestrator.js  spawns the swarm, enforces the authorization gate + caps
    bot.js           one bot: Chromium page + persona + brain loop + scope + detection
    brain.js         Claude decision (heuristic fallback)
    scope.js         the no-go list (default destructive actions + matchers)
    memory.js        shared SQLite: pages, issues, frontier, skips, cross-run, free ledger
    entitlements.js  server-side RevenueCat Pro verification
    personas.js      the five personas (incl. the chaos user)
    report.js        plain-language issues + fixes + before/after + Markdown export
    selftest.js      headless end-to-end proof (bugs found + scope honoured)
  demo-target/app.js a standalone buggy app to test (with no-go controls to avoid)
  public/index.html  the live dashboard
  app/               the Capacitor Android app (the Next Gen deliverable)
  paywall/           RevenueCat Test Store setup
```

Part of the Shipaton 2026 **Next Gen** entry. Unrelated to the Rootline site,
Gridiron GM draft board, and Recall that share the original repo.
