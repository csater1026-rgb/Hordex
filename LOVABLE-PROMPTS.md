# Lovable prompts for Hordex

Copy-paste prompts to have [Lovable](https://lovable.dev) rebuild Hordex's
front-ends with a polished look **while keeping them wired to the real backend**.

**How to use this file**
- Make **two Lovable projects** (they're different shapes): one for the desktop
  **dashboard**, one for the phone **app**. Or one responsive app — but two is
  simpler.
- For each project, paste **Prompt 1 (context)** first, then the build prompt
  (Prompt 2 for the dashboard, Prompt 3 for the app). Iterate from there.
- Then follow **After Lovable** to point it at your backend and (for the app)
  wrap it with Capacitor + RevenueCat.

> ⚠️ Lovable builds a fresh React/Tailwind app. It **replaces** the current
> `public/index.html` (dashboard) and `app/www/index.html` (app). The backend
> (`server/`), the swarm, the scope, recon, and the RevenueCat verification all
> stay exactly as they are — only the UI is rebuilt.

---

## Prompt 1 — Project context, design system & backend API (paste FIRST)

```
You are building the front-end for "Hordex" — a tool that sends a swarm of
AI-driven bots through a web app to test it like real, imperfect users and
report what breaks (crashes, server errors, failed forms, broken links). It is
NOT a security scanner. Tagline: "the swarm that tests your app before your
users do."

DESIGN SYSTEM (dark, modern, a little sci-fi — a swarm/hive feel):
- Background #0b0e18; panels #141a2b; nested panels #1b2236; borders #28304d.
- Text #eef1fb; muted text #98a2c8.
- Primary accent (violet) #7c5cff with a soft glow; secondary accent (cyan) #22d3ee.
- Severity colors: critical #ff4d6d, high #ff9f43, medium #ffd43b, low #7bd88f.
  "Kept safe"/success #7bd88f.
- Rounded cards (14–16px), subtle borders, generous spacing, tabular-figures for
  numbers, system-ui font. Smooth micro-animations (a soft pulse on an active
  bot, gentle fade-in for streaming feed items). Fully responsive; looks great in
  dark mode (default). Accessible contrast.
- Personas (show emoji + label): skimmer ⚡ "Impatient skimmer", newcomer 🧭
  "Unfamiliar user", power ⌨️ "Keyboard power-user", flaky 📶 "Bad-connection
  mobile", chaos 🌀 "Chaos user".

BACKEND CONTRACT — the UI talks to a running Hordex backend at a base URL
(configurable; default http://localhost:3000). CORS is open. Do NOT build a
backend; only integrate with this one.

REST:
- POST {base}/api/scan   body JSON:
    { target, bots, authorized, scope, appUserId, pro }
    - target: string URL, or the literal "demo" to scan a bundled test app
    - bots: number
    - authorized: boolean (must be true; it's the "I own this" confirmation)
    - scope: { noGoPaths: string[], noGoActions: string[], includeOnly: string[] }
    - appUserId: string (identifier for the user/install)
    - pro: boolean (client hint; server verifies)
  Responses: 200 { ok, target, bots, plan:"free"|"pro" } ;
    402 { error, code:"free_used" } (free demo already used) ;
    403 { error } (not authorized / blocked target) ;
    409 { error } (a scan is already running).
- POST {base}/api/stop   -> { ok:true }
- GET  {base}/api/report  -> the last report object (same as run:done.report)
- GET  {base}/api/health  -> { ok:true }

WEBSOCKET — connect to {base}/ws (use ws:// for http, wss:// for https). The
server streams JSON messages; branch on the "t" field:
- {t:"run:start", target, bots, prior:{states,findings}, scope}
- {t:"recon:start", target}                      // "understanding the app…"
- {t:"brief", brief:{summary, appType, goals:[{id,title,hint}]}}
- {t:"roster", bots:[{id, persona:{id,label}, goal:{id,title,hint}|null}]}
- {t:"state", bot, url, title, isNew, isNewToOrigin, persona}
- {t:"think", bot, url, by:"claude"|"heuristic", actions:number, persona}
- {t:"act", bot, kind:"type"|"click"|"submit", reason, persona}
- {t:"skip", bot, kind, label, url, reason, persona}   // a no-go item avoided
- {t:"finding", bot, finding:{ category, severity:"crit"|"high"|"med"|"low",
     title, detail, url, fix, foundBy, persona, goal, isNewToOrigin }}
- {t:"stats", states, findings, bySeverity:{crit,high,med,low}, pending}
- {t:"run:done", runId, report}
- {t:"run:error", error}

report object (from run:done): {
  target, understood:{summary,appType,goals[]}|null,
  goalsCoverage:[{goal, issues}],
  summary:{statesExplored, findings, bySeverity, newlyBroken, skipped, goals},
  findings:[{severity, category, title, url, detail, fix, foundBy, persona, goal, newlyBroken}],
  skipped:[{kind, label, url, reason}],
  statesExplored:[{url,title,firstBot,visits}],
  markdown  // a full Markdown report string, for the Export button
}

KEY BEHAVIORS:
- "Kept safe" = count of {t:"skip"} events; show them proudly (green) — it means
  the swarm avoided destructive actions.
- A finding's NEW badge (cyan) should ONLY show when this is a RE-SCAN, i.e.
  run:start.prior.states > 0 AND finding.isNewToOrigin. First scans show 0 new.
- Show each bot's current goal (🎯) and, on a finding, "while trying to: <goal>".
- Store the base URL and remember it (localStorage).
```

---

## Prompt 2 — Build the DASHBOARD (desktop operator view)

```
Build the Hordex operator dashboard as a single responsive page using the design
system and backend contract above.

Layout (3 columns on desktop, stacking on mobile):
LEFT column:
  - "Test a target" card: text input for target URL (default "demo"); a swarm-
    size slider 1–20 with a live label; an "I own this target / I'm authorized to
    test it" checkbox (Release button disabled until checked); a big gradient
    "Release the swarm" primary button; a "Stop scan" button shown only while
    running.
  - "Safety scope · always on" card: helper text "Destructive actions (delete,
    pay, log out…) are skipped automatically." A "Customize scope" disclosure
    that reveals three inputs: No-go pages (comma-separated paths), Extra no-go
    words, Only-test-these-pages. Note: "Tip: add data-hordex-skip to any element
    to mark it off-limits."
  - "The swarm" card: a live list of bot chips (persona emoji + id + label), each
    showing its 🎯 goal and its current action; a soft pulse/glow while active;
    a per-bot issue counter.
CENTER column:
  - "What the swarm understands" card (hidden until a {t:"brief"} arrives): the
    app summary + a row of goal chips (🎯 title).
  - "Live coverage" card: four stat tiles — Pages, Issues, Actions, Kept safe
    (green) — fed by {t:"stats"} and the skip count; plus a wrapping row of
    visited-page chips.
  - "Live feed" card: a reverse-chronological stream of events (state/think/act/
    skip/finding/hordex notes). Skip events render green with a 🚫. Cap length.
RIGHT column:
  - "Issues found" card: four tiles — Critical, High, Medium, New — then a
    scrollable list of finding cards. Each card: a severity pill (colored), the
    title, a NEW pill (only on re-scans), the URL, "🎯 while trying to: <goal>"
    when present, and a highlighted "🔧 <fix>" box. A "⬇ Export report
    (Markdown)" button that downloads report.markdown as hordex-report.md.

Behavior:
- On "Release the swarm": open the WebSocket, then POST /api/scan with
  { target, bots, authorized:true, scope, pro:true, appUserId:"web-operator" }.
  Reset all panels on run:start. Handle run:done (freeze, keep results) and
  run:error (toast + reset).
- Make it feel alive: streaming feed, animated stat counters, active-bot glow.
- Header: "Hordex" wordmark with a small glowing violet dot, the tagline, and a
  gear icon opening a Settings dialog with the backend URL (saved to localStorage).
Keep it a single React app, no backend, TypeScript + Tailwind, clean components.
```

---

## Prompt 3 — Build the MOBILE APP UI (phone, the Next Gen deliverable)

```
Build the Hordex mobile app UI as a phone-first, single-column responsive React
app using the design system and backend contract above. This will be wrapped in
Capacitor for Android, so design for a 390–430px width, respect safe-area insets,
and use large tap targets.

Screens/sections (one scroll):
- Top bar: "Hordex" wordmark + a plan badge (FREE / PRO) + a gear (Settings).
- "Test a target" card: target URL input; swarm-size slider (see plan rules);
  "I own this target" checkbox; a big "Release the swarm" button; a "Stop scan"
  button while running; a small line showing the configured backend.
- "Safety scope · always on" card: same three inputs as the dashboard, behind a
  "Customize scope" disclosure, with the data-hordex-skip tip.
- "What the swarm understands" card (hidden until {t:"brief"}): summary + goal chips.
- "The swarm" card: horizontally scrollable bot chips with persona emoji, id,
  and 🎯 goal; active glow.
- "Live coverage": four tiles — Pages, Issues, Actions, Kept safe (green).
- "Live feed": streaming events (skips green with 🚫).
- "Issues found": tiles (Crit/High/Med/New) + finding cards (severity pill, title,
  NEW pill on re-scans, URL, "🎯 while trying to", "🔧 fix"). Export button (Pro).
- Bottom sheets: Settings (backend URL, Restore purchases) and a Paywall sheet.

PLAN / PAYWALL RULES (Free vs Pro):
- Free = ONE demo scan with 5 bots. After it's used, the Release button becomes
  "Unlock Pro to scan again" and opens the paywall.
- Pro = unlimited scans, swarm slider up to 20, before-vs-after re-runs, and
  report export. FREE caps the slider at 5.
- Abstract all purchases behind a small async interface named RC so the real
  RevenueCat plugin can be injected later:
    RC.init(), RC.isPro():bool, RC.offerings():[{id,title,price}],
    RC.purchase(pkg):bool, RC.restore():bool, RC.appUserId():string
  Provide a WEB MOCK of RC now (isPro persisted in localStorage; offerings =
  [{id:"monthly",title:"Hordex Pro (monthly)",price:"$9.99"},
   {id:"lifetime",title:"Hordex Pro (lifetime)",price:"$49.99"}];
  purchase() flips isPro to true). Do NOT add any real payment SDK — it will be
  wired after export.
- Paywall sheet lists RC.offerings() and sells: unlimited scans, up to 20 bots,
  before-vs-after, downloadable reports.
- On scan: POST /api/scan with { target, bots, authorized, scope,
  appUserId: await RC.appUserId(), pro: await RC.isPro() }. If the response is
  402 (code "free_used"), open the paywall and mark the free demo used.

Header badge reflects RC.isPro(). Keep it TypeScript + Tailwind, no backend.
```

---

## After Lovable (wire it up)

**Both:** in Settings, set the backend URL to your deployed Hordex backend
(`https://…` from `DEPLOY.md`) or `http://localhost:3000` in dev. Confirm the
WebSocket connects and a `demo` scan streams.

**Dashboard:** export Lovable → build the Vite app → serve its `dist/` however
you like (or replace `public/` and have the Hordex server host it — it already
serves `public/` as static).

**Mobile app → Android:**
1. Export the Lovable project to GitHub and `git clone` it.
2. `npm i && npm run build` → produces `dist/`.
3. Add Capacitor: `npm i @capacitor/core @capacitor/cli @capacitor/android`
   `@revenuecat/purchases-capacitor`; `npx cap init Hordex com.hordex.app`;
   set `webDir: "dist"` in `capacitor.config.ts`; `npx cap add android`.
4. Replace the mock `RC` with the real one: reuse this repo's
   `app/www/revenuecat.js` (it already implements init/isPro/offerings/purchase/
   restore/appUserId against `@revenuecat/purchases-capacitor`'s Test Store, with
   the same shape the mock uses) — port it to your RC module.
5. Put your Test Store public key + entitlement/offering ids in a config (see
   `paywall/revenuecat-setup.md`), set `REVENUECAT_SECRET_KEY` on the backend,
   `npx cap sync android`, and run in Android Studio.

Nothing in `server/` changes — the rebuilt UIs are drop-in replacements that
speak the same contract.
```
