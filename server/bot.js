// Hordex bot — one AI-driven browser in the swarm.
//
// A bot claims URLs from the shared frontier, drives a real (headless) Chromium
// page like its persona would, and reports two kinds of trouble:
//   • functional bugs — caught live from the browser: uncaught JS errors, 5xx
//     responses, failed form submits, broken links.
//   • security findings — the passive 84-check layer, plus the attacker
//     persona's safe probes (reflected-XSS marker, IDOR id-fuzzing, unthrottled
//     login, exposed /.env).
// Everything flows through shared Memory so the swarm dedupes and divides work.
import { chromium } from "playwright";
import { CHROMIUM_PATH } from "./env.js";
import { decidePlan } from "./brain.js";
import { sig } from "./memory.js";
import * as security from "./security.js";
import { guidance, meaning } from "./report.js";

// Script run in the page to index interactable elements and same-origin links.
const INDEX_FN = `() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  let idx = 0; const tag = (el) => { el.setAttribute('data-hordex-idx', idx); return idx++; };
  const inputs = [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),textarea')]
    .filter(vis).map(el => ({ idx: tag(el), name: el.name || '', type: el.type || 'text' }));
  const forms = [...document.querySelectorAll('form')].map(el => ({ idx: tag(el), action: el.getAttribute('action') || '', method: (el.getAttribute('method') || 'get').toLowerCase() }));
  const buttons = [...document.querySelectorAll('button,input[type=submit],[role=button]')]
    .filter(el => !el.closest('form') && vis(el)).map(el => ({ idx: tag(el), text: (el.textContent || el.value || '').trim().slice(0, 40) }));
  const links = [...document.querySelectorAll('a[href]')].map(a => a.href);
  return { title: document.title, inputs, forms, buttons, links,
    clientGate: /isPro|unlockPro|data-pro|dataset\\.pro/.test(document.documentElement.innerHTML) };
}`;
// page.evaluate treats a string as an EXPRESSION, so we must invoke the arrow fn.
const INDEX_CALL = `(${INDEX_FN})()`;

export class Bot {
  constructor({ id, persona, memory, runId, origin, startUrl, emit, browser }) {
    Object.assign(this, { id, persona, memory, runId, origin, startUrl, emit, browser });
    this.stopped = false;
    this.steps = 0;
  }

  stop() { this.stopped = true; }

  report(f) {
    // Attach the plain-language "what it means" + "how to fix" at creation time,
    // so live finding cards are complete without waiting for the final report.
    const finding = { ...f, persona: this.persona.id, bot: this.id, foundBy: this.id,
      meaning: f.meaning || meaning(f), fix: f.fix || guidance(f) };
    const { isNew } = this.memory.addFinding(this.runId, this.origin, finding);
    if (isNew) this.emit({ t: "finding", bot: this.id, finding });
  }

  sameOrigin(url) { try { return new URL(url).origin === this.origin; } catch { return false; } }

  async run() {
    const context = await this.browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();

    // --- Live functional-bug detection from browser events ---
    page.on("pageerror", (err) => {
      this.report({ type: "functional", category: "JavaScript error", severity: "high",
        title: "Uncaught JavaScript error", detail: String(err.message || err).slice(0, 200), url: page.url() });
    });
    page.on("response", (res) => {
      const req = res.request();
      if (!this.sameOrigin(res.url())) return;
      const status = res.status();
      const method = req.method();
      if (status >= 500) {
        this.report({ type: "functional", category: "Server error", severity: "high",
          title: `Server error (${status})`, detail: `${method} ${res.url()} returned ${status}`, url: res.url() });
      } else if (status >= 400 && method === "POST") {
        this.report({ type: "functional", category: "Broken flow", severity: "med",
          title: `Form submit failed (${status})`, detail: `${method} ${res.url()} returned ${status} — the user's action silently fails`, url: res.url() });
      }
    });

    try {
      // The attacker's origin-level probes (exposed config, IDOR, unthrottled
      // auth) don't depend on any particular page, so run them once up front —
      // that way they happen even if the crawl frontier drains first.
      if (this.persona.bias?.malicious === 1) await this.attackerProbes(page).catch(() => {});

      // Seed the frontier from the start URL if we're first here.
      this.memory.enqueue(this.runId, this.startUrl, 0);

      while (!this.stopped) {
        const claim = this.memory.claim(this.runId, this.id);
        if (!claim) {
          // Nothing to claim right now. If peers are still working they may
          // enqueue more, so wait; only exit once the frontier is truly drained.
          if (this.memory.active === 0 && this.memory.frontierPending(this.runId) === 0) break;
          await new Promise((r) => setTimeout(r, 120));
          continue;
        }
        try {
          await this.visit(page, claim);
        } finally {
          this.memory.markVisited(claim.id);
          this.memory.release();
        }
      }
    } finally {
      await context.close().catch(() => {});
    }
  }

  async visit(page, claim) {
    const url = claim.url;
    let resp;
    try {
      resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    } catch (e) {
      this.emit({ t: "nav", bot: this.id, url, ok: false });
      return;
    }

    // Broken-link detection: a link that lands on a 4xx/5xx document.
    const status = resp ? resp.status() : 0;
    if (status >= 400) {
      this.report({ type: "functional", category: "Broken link", severity: "med",
        title: `Broken link (${status})`, detail: `Navigating to ${url} returned ${status}`, url });
      this.emit({ t: "nav", bot: this.id, url, status });
      return;
    }

    const headers = resp ? resp.headers() : {};
    const body = await page.content().catch(() => "");
    const obs = await page.evaluate(INDEX_CALL).catch(() => ({ inputs: [], forms: [], buttons: [], links: [] }));
    obs.url = url; obs.persona = this.persona;

    // Record the state (coverage). State signature = path + shape of the page.
    const path = (() => { try { return new URL(url).pathname; } catch { return url; } })();
    const s = { sig: sig(path, obs.title || "", `${obs.inputs.length}/${obs.forms.length}/${obs.buttons.length}`), url, title: obs.title };
    const rec = this.memory.recordState(this.runId, this.origin, s, this.id);
    this.emit({ t: "state", bot: this.id, url, title: obs.title, isNew: rec.isNew, isNewToOrigin: rec.isNewToOrigin, persona: this.persona.id });

    // Enqueue new same-origin links (coverage-guided expansion).
    for (const link of obs.links || []) {
      if (this.sameOrigin(link)) this.memory.enqueue(this.runId, link.split("#")[0], (claim.depth || 0) + 1);
    }

    // Passive security scan of what we can see.
    const storage = await page.evaluate(() => { const o = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } } catch (e) {} return o; }).catch(() => ({}));
    for (const f of security.scanPage({ url, status, headers, body, storage })) this.report(f);
    for (const f of security.scanClientGate(url, !!obs.clientGate)) this.report(f);

    // Decide and perform human-like in-page actions (fill, submit, click).
    const { plan, by } = await decidePlan(obs);
    this.emit({ t: "think", bot: this.id, url, by, actions: plan.length, persona: this.persona.id });
    await this.perform(page, plan, url);

    // Reflected-XSS probe: any bot that lands on a GET form with a text input
    // submits a safe marker payload and checks whether it executed. Deterministic
    // because the reflective pages are always crawled, not attacker-dependent.
    await this.xssProbe(page, obs, url);

    this.steps++;
  }

  // Execute the page plan robustly. Standalone buttons are clicked first (before
  // any form submit can navigate away), then each form is handled on a fresh load
  // of the page so a navigating submit never skips later actions. Element indices
  // are stable per URL, so re-indexing after a reload keeps the plan valid.
  async perform(page, plan, pageUrl) {
    const clicks = plan.filter((a) => a.kind === "click");
    const types = plan.filter((a) => a.kind === "type");
    const submits = plan.filter((a) => a.kind === "submit");

    for (const a of clicks) { if (this.stopped) break; await this.act(page, a, pageUrl); }

    for (const sub of submits) {
      if (this.stopped) break;
      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {});
      await page.evaluate(INDEX_CALL).catch(() => {});
      for (const t of types) { try { await page.fill(`[data-hordex-idx="${t.idx}"]`, String(t.value ?? ""), { timeout: 2500 }); } catch {} }
      await this.act(page, sub, pageUrl);
    }

    if (!submits.length) { for (const t of types) { if (this.stopped) break; await this.act(page, t, pageUrl); } }
  }

  async act(page, a, pageUrl) {
    try {
      await page.evaluate(INDEX_CALL).catch(() => {}); // (re)tag; idx is stable per URL state
      const sel = `[data-hordex-idx="${a.idx}"]`;
      const before = page.url().split("#")[0];
      if (a.kind === "type") {
        await page.fill(sel, String(a.value ?? ""), { timeout: 2500 });
      } else if (a.kind === "click") {
        await page.click(sel, { timeout: 2500 });
        await page.waitForTimeout(200);
      } else if (a.kind === "submit") {
        await page.$eval(sel, (f) => (f.requestSubmit ? f.requestSubmit() : f.submit()));
        await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(150);
      }
      this.emit({ t: "act", bot: this.id, kind: a.kind, reason: a.reason || "", persona: this.persona.id });
      if (page.url().split("#")[0] !== before) await this.captureXss(page);
    } catch { /* element gone / navigation / timeout — keep going */ }
  }

  // Poll briefly for the injected XSS marker (the reflected <img> fires onerror
  // asynchronously after the page settles).
  async captureXss(page) {
    let xss = false;
    for (let i = 0; i < 6 && !xss; i++) {
      xss = await page.evaluate(() => !!window.__hordex_xss).catch(() => false);
      if (!xss) await page.waitForTimeout(150);
    }
    if (xss) {
      for (const f of security.scanPage({ url: page.url(), xssMarker: true, headers: {}, body: "" })) this.report(f);
      await page.evaluate(() => { try { window.__hordex_xss = 0; } catch (e) {} }).catch(() => {});
    }
  }

  // Submit a safe reflected-XSS marker into the first GET form with a text input.
  async xssProbe(page, obs, pageUrl) {
    const form = (obs.forms || []).find((f) => (f.method || "get") === "get");
    const input = (obs.inputs || [])[0];
    if (!form || !input) return;
    try {
      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
      await page.evaluate(INDEX_CALL).catch(() => {});
      await page.fill(`[data-hordex-idx="${input.idx}"]`, `<img src=x onerror="window.__hordex_xss=1">`, { timeout: 3000 });
      await page.$eval(`[data-hordex-idx="${form.idx}"]`, (f) => (f.requestSubmit ? f.requestSubmit() : f.submit()));
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
      await this.captureXss(page);
    } catch { /* probe is best-effort */ }
  }

  // Safe, targeted probes for the attacker persona. Uses the page's request
  // context so probe traffic doesn't pollute the functional response listener.
  async attackerProbes(page) {
    const req = page.request;

    // Config/secret exposure at well-known paths.
    for (const p of security.PROBE_PATHS) {
      try {
        const r = await req.get(this.origin + p, { timeout: 5000 });
        if (r.status() === 200) {
          const text = (await r.text()).slice(0, 4000);
          for (const f of security.scanPage({ url: this.origin + p, status: 200, body: text, headers: {}, probe: true })) this.report(f);
        }
      } catch {}
    }

    // IDOR: fetch object ids we were never handed.
    const leaked = [];
    for (const id of [1, 2, 3]) {
      try {
        const r = await req.get(`${this.origin}/api/users/${id}`, { timeout: 5000 });
        if (r.status() === 200) { const j = await r.json().catch(() => null); if (j && (j.email || j.ssn)) leaked.push(id); }
      } catch {}
    }
    for (const f of security.scanIdor(`${this.origin}/api/users/:id`, leaked)) this.report(f);

    // Unthrottled auth: many rapid attempts, watch for any 429 / lockout.
    let throttled = false; const attempts = 12;
    for (let i = 0; i < attempts; i++) {
      try {
        const r = await req.post(`${this.origin}/api/login`, { data: { email: `a${i}@x.com`, password: "x" }, timeout: 5000 });
        if (r.status() === 429) { throttled = true; break; }
      } catch {}
    }
    for (const f of security.scanRateLimit(`${this.origin}/api/login`, attempts, throttled)) this.report(f);
  }
}

export async function launchBrowser() {
  return chromium.launch({ headless: true, executablePath: CHROMIUM_PATH, args: ["--no-sandbox"] });
}
