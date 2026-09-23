# Shipaton 2026 — Next Gen submission guide (Hordex)

Everything you need to submit Hordex to the **Next Gen Award** (student track).
Next Gen waives the store listing: you submit a **demo video + this open-source
repo**, with **no paid Apple/Google account**.

## The requirements, and how Hordex meets each

| Requirement | Status |
|---|---|
| A mobile app (iOS/iPadOS/macOS/**Android**) | ✅ Android app (`app/`, Capacitor) |
| RevenueCat SDK powering ≥1 in-app purchase | ✅ Pro unlock via RevenueCat **Test Store** (`paywall/`) |
| Open-source code | ✅ this repo |
| Public demo video ≤2 min (real device) | ⬜ you record it (script below) |
| Student eligibility | ⬜ you confirm (see below) |
| Free trial **or** promo code for judges | ✅ Free tier = one demo scan; Pro is a free Test Store sandbox purchase |

## Before you record

1. **Deploy the backend** → `DEPLOY.md`. Get your `https://…` URL.
2. **Set up RevenueCat Test Store** → `paywall/revenuecat-setup.md`. Get the
   `test_…` public key (app) and the `sk_…` v1 secret key (backend).
3. **Configure the app** → put the backend URL + public key into
   `app/www/config.js`; set the secret key as `REVENUECAT_SECRET_KEY` on the
   backend.
4. **Build & run on a device/emulator** → `app/README.md`.
5. Smoke-test: Settings → backend URL → run the free demo scan of `demo` (or
   your own URL) → watch issues stream in and the swarm skip the destructive
   items → **Unlock Pro** (sandbox purchase) → run again with more bots.

## Demo video script (~110 seconds)

Keep it to essential footage — judges may stop at 2:00.

1. **0:00–0:15 — Hook.** "Apps built fast with AI break in the same ways. Hordex
   sends a swarm of bots through your app like thousands of real users — so you
   find what's broken before your real users do."
2. **0:15–0:35 — Start the free demo scan.** On the phone: paste a target, tick
   "I own this", **Release the swarm**. Show the **"🔍 understanding the app"**
   beat and the goals it figured out ("Create a note," "Upgrade to Pro"), then
   the bots appear (skimmer, chaos user, …) each pursuing a goal. *(Recon needs
   your `ANTHROPIC_API_KEY` set on the backend.)*
3. **0:35–1:05 — The swarm working (the wow).** Bots moving through the app, the
   live feed scrolling, issues streaming in — call a couple out: "a button that
   crashes… a form that silently fails… a broken link." Point out the green
   **"🚫 avoided Delete account"** lines: "it never touches anything
   destructive."
4. **1:05–1:25 — The paywall (RevenueCat).** You've used the one free demo. Tap
   **Unlock Pro** → the paywall → complete the purchase → badge flips to
   **PRO**. Say "in-app purchase powered by RevenueCat." Bump the swarm to 20.
5. **1:25–1:50 — The payoff.** Re-run after a change and show the **NEW** badge
   on an issue: "before-vs-after — it shows exactly what your last change broke."
   Open an issue for the plain-language fix. Export the report.

Record on a real device or emulator screen capture. Upload to YouTube/Vimeo,
**public**. No copyrighted music.

## Assets to attach on Devpost

- **App icon 1024×1024** — a swarm/horde mark on the deep-indigo brand
  (`#7c5cff`). Create one (Figma/any tool) — not yet in the repo.
- **Screenshot 1179×2556, no device frame** — a portrait capture mid-scan with
  issues and the "kept safe" count visible.
- **Text description** — adapt `README.md`'s intro.
- **Repo link** — this GitHub repo (public).
- **Video link** — your YouTube/Vimeo URL.
- **Judge access** — the Free tier gives judges a full demo scan with no
  purchase; Pro unlocks via the RevenueCat Test Store sandbox (free, no card), so
  they can test everything.

## Student eligibility

Next Gen is for active students. Confirm what proof they accept (the rules
mention a `.edu` / equivalent email "or equivalent") and use an eligible
account. **If you're under 18**, a parent/guardian must consent and agree to the
rules on your behalf (rules §3). Sort this out before the deadline.

## The honest pitch (say this, don't oversell)

Hordex gives far broader, faster coverage than testing by hand — many "users" at
once, each behaving differently, built specifically for apps made with AI tools.
It's **user-simulation testing** (does the app work?), made safe by a no-go
scope, not a security scanner. And it does **not** claim to "test everything" —
exhaustive testing is impossible for any real app. That honesty plays well with
technical judges.

---

Deadline: **Sep 30, 2026** (submissions close end of day). Leave a buffer for the
video + Devpost form.
