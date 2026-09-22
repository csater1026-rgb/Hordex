# Hordex — the swarm that tests your app before your users do

Point Hordex at a web app you own and it unleashes a swarm of AI-driven bots
that explore it like thousands of real, imperfect users would — clicking,
typing, mis-clicking, backtracking, double-submitting, feeding forms junk — and
reports what breaks: **functional bugs** (dead buttons, JavaScript crashes,
failed forms, broken links, 500s) *and* **security holes** (exposed secrets,
missing auth checks, IDOR, no rate limiting, reflected XSS, tokens in storage,
missing headers). A "reverse-engineered zombie attack": your own swarm finds the
problems first.

It's black-box — the bots only ever hit the app over HTTP, the way a real
visitor does. No source code, no SDK in your app, nothing installed.

Built on the **Rootline 84-check** vibe-coded-app pentest framework
(`../tracker.html`), which seeds the security layer.

> **Authorized testing only.** Hordex requires you to confirm you own or are
> authorized to test a target before it will scan, and blocks public targets by
> default. Test your own apps.

---

## Why it exists

Apps built fast with AI coding tools (Lovable, Bolt, Replit, Cursor, v0, …) ship
with predictable, recurring failures and usually no QA process. Manual
test-user runs are slow and miss the messy, concurrent, hostile-input paths that
actually break in production. Hordex gives solo builders far broader, faster
coverage than manual QA — combining functional *and* security testing in one
sweep — without claiming the impossible ("test everything" is combinatorially
out of reach for any real app; this is coverage, not completeness).

---

## How it works

```
                    ┌──────────────────────────────────────────────┐
  Live dashboard ◄──┤ Orchestrator — spawns N bots, one shared brain │
   (WebSocket)      │   │                                            │
                    │   ├─ Bot: real headless Chromium + a persona   │
                    │   │    + Claude-driven decisions (with a        │
                    │   │    heuristic fallback when no API key)       │
                    │   │                                             │
                    │   ├─ Shared memory (SQLite): visited states,    │
                    │   │    findings, and a coverage-guided frontier  │
                    │   │    → bots divide the app, dedupe, and get    │
                    │   │      smarter across runs ("trained memory")  │
                    │   └─ Security layer: the 84 checks, run passively│
                    └──────────────────────────────────────────────┘
```

- **Personas** (`server/personas.js`) — impatient skimmer, unfamiliar user,
  keyboard power-user, bad-connection mobile, and a malformed-input attacker.
  The attacker runs safe probes (exposed config paths, IDOR id-fuzzing,
  unthrottled login) plus reflected-XSS markers.
- **Coverage-guided exploration** (`server/memory.js`) — bots are rewarded for
  reaching *new* app states, not random wandering (the UI-level cousin of
  coverage-guided fuzzing). The shared frontier is claimed atomically so N bots
  split the work instead of duplicating it.
- **Trained memory** — every state and finding signature is remembered per
  target origin, so a re-scan already knows the app and pushes into new ground.
- **The brain** (`server/brain.js`) — Claude gets a compact description of the
  page + the persona and returns a short plan of human-like actions. No key? A
  deterministic heuristic keeps the swarm (and the offline self-test) running.

---

## Run it

```bash
cd hordex
npm install            # Chromium is used headless; in this env it's pre-provisioned
npm start              # dashboard at http://localhost:3000
```

Open the dashboard, tick **“I own / am authorized to test this”**, and hit
**Release the swarm**. Leave the target as `demo` to scan the bundled
deliberately-buggy app (`demo-target/app.js`), or paste your own dev-server URL
(localhost / private hosts are allowed; set `HORDEX_ALLOW_PUBLIC=1` to scan a
public site you own).

**Optional — real AI brains:** set `ANTHROPIC_API_KEY` to have Claude drive the
bots. Without it, the heuristic brain is used (fully functional).

### Prove it works (offline, headless)

```bash
npm test               # boots the buggy demo, runs the swarm, asserts every
                       # planted bug is found, dedupe works, memory persists
```

Expected: `✅ PASS` — 12 planted bugs found (8 security + 4 functional) across
the demo target in a few seconds.

---

## Free vs Pro (RevenueCat)

Hordex monetizes with **one in-app purchase** via **RevenueCat**:

| | Free | **Pro** |
|---|---|---|
| Swarm size | up to 3 bots | up to 20 bots |
| Functional bugs | ✓ | ✓ |
| Full 84-check security sweep | 🔒 | ✓ |
| Report export | 🔒 | ✓ |

In the mobile app the Pro unlock is a real RevenueCat purchase (Test Store, so it
works with no paid Apple/Google account — see `paywall/`). The web dashboard shows
the same gate with an **Unlock Pro** button so the paywall is visible in the demo.

---

## Layout

```
hordex/
  server/
    index.js         Express + WebSocket server; REST to start/stop scans
    orchestrator.js  spawns the swarm, enforces the authorization gate + time cap
    bot.js           one bot: Chromium page + persona + brain loop + live detection
    brain.js         Claude decision (heuristic fallback)
    memory.js        shared SQLite memory: states, findings, frontier, cross-run
    security.js      passive 84-check scanner + attacker probes
    checks-data.js   the 84 checks, extracted from ../tracker.html
    personas.js      the five personas
    report.js        plain-language findings + fixes + Markdown export
    selftest.js      headless end-to-end proof
  demo-target/app.js a standalone deliberately-buggy app to scan
  public/index.html  the live dashboard
  paywall/           RevenueCat Test Store setup for the mobile app
```

Part of the Shipaton 2026 **Next Gen** entry. Unrelated to the Rootline site,
Gridiron GM draft board, and Recall that share this repo.
