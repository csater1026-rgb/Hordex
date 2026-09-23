// Hordex bot — one AI-driven browser in the swarm.
//
// A bot claims URLs from the shared frontier, drives a real (headless) Chromium
// page like its persona would, and reports functional trouble caught live from
// the browser: uncaught JS errors, 5xx responses, failed form submits, and
// broken links. It is a user-simulation tester — it exercises the app's normal
// features, it does not attack or probe for vulnerabilities.
//
// Scope (the no-go list) is enforced here: blocked pages never enter the queue,
// and blocked controls (delete/pay/log-out/… and anything tagged
// data-hordex-skip) are removed before the bot decides what to do — so the
// swarm can't click something destructive on an app you actually use.
import { chromium } from "playwright";
import { CHROMIUM_PATH, MAX_DEPTH } from "./env.js";
import { decidePlan } from "./brain.js";
import { sig } from "./memory.js";
import { pathBlocked, actionBlocked, blockReason } from "./scope.js";
import { fixFor } from "./report.js";

// Script run in the page to index interactable elements and same-origin links.
// Elements tagged data-hordex-skip (or inside one) are marked skip.
const INDEX_FN = `() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const skip = (el) => !!el.closest('[data-hordex-skip]');
  let idx = 0; const tag = (el) => { el.setAttribute('data-hordex-idx', idx); return idx++; };
  const inputs = [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),textarea')]
    .filter(vis).map(el => ({ idx: tag(el), name: el.name || '', type: el.type || 'text', skip: skip(el) }));
  const forms = [...document.querySelectorAll('form')].map(el => {
    const btn = el.querySelector('button,input[type=submit]');
    return { idx: tag(el), action: el.getAttribute('action') || '', method: (el.getAttribute('method') || 'get').toLowerCase(),
      label: (btn ? (btn.textContent || btn.value || '') : '').trim().slice(0, 40), skip: skip(el) };
  });
  const buttons = [...document.querySelectorAll('button,input[type=submit],[role=button]')]
    .filter(el => !el.closest('form') && vis(el)).map(el => ({ idx: tag(el), text: (el.textContent || el.value || '').trim().slice(0, 40), skip: skip(el) }));
  const links = [...document.querySelectorAll('a[href]')].map(a => ({ href: a.href, text: (a.textContent || '').trim().slice(0, 60), skip: skip(a) }));
  return { title: document.title, inputs, forms, buttons, links };
}`;
const INDEX_CALL = `(${INDEX_FN})()`;

export class Bot {
  constructor({ id, persona, memory, runId, origin, startUrl, scope, brief, goal, emit, browser }) {
    Object.assign(this, { id, persona, memory, runId, origin, startUrl, scope, brief, goal, emit, browser });
    this.stopped = false;
    this.steps = 0;
  }

  stop() { this.stopped = true; }

  report(f) {
    const finding = { ...f, persona: this.persona.id, bot: this.id, foundBy: this.id, goal: this.goal?.title || "" };
    finding.fix = f.fix || fixFor(f);
    const { isNew, isNewToOrigin } = this.memory.addFinding(this.runId, this.origin, finding);
    if (isNew) this.emit({ t: "finding", bot: this.id, finding: { ...finding, isNewToOrigin } });
  }

  skip(kind, label, url, reason) {
    const { isNew } = this.memory.addSkip(this.runId, { kind, label, url, reason, bot: this.id, sig: sig(kind, url || "", label || "") });
    if (isNew) this.emit({ t: "skip", bot: this.id, kind, label, url, reason, persona: this.persona.id });
  }

  sameOrigin(url) { try { return new URL(url).origin === this.origin; } catch { return false; } }
  pathOf(url) { try { return new URL(url).pathname; } catch { return url; } }

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
      this.memory.enqueue(this.runId, this.startUrl, 0); // seed (entry is always allowed)

      while (!this.stopped) {
        const claim = this.memory.claim(this.runId, this.id);
        if (!claim) {
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

    const status = resp ? resp.status() : 0;
    if (status >= 400) {
      this.report({ type: "functional", category: "Broken link", severity: "med",
        title: `Broken link (${status})`, detail: `Navigating to ${url} returned ${status}`, url });
      this.emit({ t: "nav", bot: this.id, url, status });
      return;
    }

    const obs = await page.evaluate(INDEX_CALL).catch(() => ({ inputs: [], forms: [], buttons: [], links: [] }));
    obs.url = url; obs.persona = this.persona; obs.brief = this.brief; obs.goal = this.goal;

    // Record the state (coverage). State signature = path + shape of the page.
    const path = this.pathOf(url);
    const s = { sig: sig(path, obs.title || "", `${obs.inputs.length}/${obs.forms.length}/${obs.buttons.length}`), url, title: obs.title };
    const rec = this.memory.recordState(this.runId, this.origin, s, this.id);
    this.emit({ t: "state", bot: this.id, url, title: obs.title, isNew: rec.isNew, isNewToOrigin: rec.isNewToOrigin, persona: this.persona.id });

    // Enqueue new same-origin links, minus anything the scope forbids.
    for (const link of obs.links || []) {
      const href = (link.href || "").split("#")[0];
      if (!this.sameOrigin(href)) continue;
      const reason = blockReason(this.pathOf(href), link.text + " " + href, this.scope);
      if (reason) { this.skip("link", link.text || this.pathOf(href), href, reason); continue; }
      if ((claim.depth || 0) + 1 <= MAX_DEPTH) this.memory.enqueue(this.runId, href, (claim.depth || 0) + 1);
    }

    // Remove no-go controls before the bot decides anything, so it can't pick them.
    obs.buttons = (obs.buttons || []).filter((b) => {
      if (b.skip) { this.skip("button", b.text, url, "marked no-go (data-hordex-skip)"); return false; }
      if (actionBlocked(b.text, this.scope)) { this.skip("button", b.text, url, "no-go action"); return false; }
      return true;
    });
    obs.forms = (obs.forms || []).filter((f) => {
      if (f.skip) { this.skip("form", f.label, url, "marked no-go (data-hordex-skip)"); return false; }
      if (actionBlocked(f.label, this.scope)) { this.skip("form", f.label, url, "no-go action"); return false; }
      return true;
    });
    obs.inputs = (obs.inputs || []).filter((i) => !i.skip);

    // Decide and perform human-like in-page actions (fill, submit, click).
    const { plan, by } = await decidePlan(obs);
    this.emit({ t: "think", bot: this.id, url, by, actions: plan.length, persona: this.persona.id });
    await this.perform(page, plan, url);

    this.steps++;
  }

  // Standalone buttons are clicked first (before any form submit navigates away),
  // then each form is handled on a fresh load of the page so a navigating submit
  // never skips later actions. Element indices are stable per URL.
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
    } catch { /* element gone / navigation / timeout — keep going */ }
  }
}

export async function launchBrowser() {
  return chromium.launch({ headless: true, executablePath: CHROMIUM_PATH, args: ["--no-sandbox"] });
}
