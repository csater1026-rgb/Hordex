// Hordex orchestrator — runs one scan: spin up the swarm, divide the app, stop
// on drain or the hard time cap, and stream everything to the caller.
import { Memory } from "./memory.js";
import { Bot, launchBrowser } from "./bot.js";
import { assignPersonas } from "./personas.js";
import { buildReport } from "./report.js";
import { SCAN_HARD_CAP_MS, MAX_BOTS } from "./env.js";

// --- Authorization gate. You may only scan what you own or are cleared to test.
// Public targets are refused unless the operator opts in AND confirms ownership.
export function targetAllowed(url) {
  let u;
  try { u = new URL(url); } catch { return { ok: false, why: "Not a valid URL." }; }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, why: "Only http/https targets." };
  const host = u.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" ||
    /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith(".local");
  if (isLocal) return { ok: true, local: true };
  if (process.env.HORDEX_ALLOW_PUBLIC === "1") return { ok: true, local: false };
  return { ok: false, why: "Public targets are blocked in this build. Scan localhost/your own dev server, or set HORDEX_ALLOW_PUBLIC=1 to test a site you own." };
}

export class Orchestrator {
  constructor({ target, bots = 5, emit = () => {}, dbPath = ":memory:", authorized = false }) {
    this.target = target;
    this.bots = Math.max(1, Math.min(MAX_BOTS, bots | 0));
    this.emit = emit;
    this.dbPath = dbPath;
    this.authorized = authorized;
    this.stopped = false;
    this._bots = [];
  }

  stop() { this.stopped = true; this._bots.forEach((b) => b.stop()); }

  async run() {
    const gate = targetAllowed(this.target);
    if (!gate.ok) throw new Error(`Blocked: ${gate.why}`);
    if (!this.authorized) throw new Error("Blocked: you must confirm you own or are authorized to test this target.");

    const memory = new Memory(this.dbPath);
    const prior = memory.priorKnowledge(this.target);
    const runId = memory.createRun(this.target);
    const origin = new URL(this.target).origin;

    this.emit({ t: "run:start", runId, target: this.target, bots: this.bots, prior });

    const browser = await launchBrowser();
    const personas = assignPersonas(this.bots);
    this._bots = personas.map((persona, i) => new Bot({
      id: `bot-${i + 1}`, persona, memory, runId, origin,
      startUrl: this.target, emit: this.emit, browser,
    }));
    this.emit({ t: "roster", bots: this._bots.map((b) => ({ id: b.id, persona: b.persona })) });

    // Hard time cap.
    const cap = setTimeout(() => this.stop(), SCAN_HARD_CAP_MS);
    // Live stats ticker for the dashboard.
    const ticker = setInterval(() => this.emit({ t: "stats", ...memory.stats(runId) }), 500);

    try {
      await Promise.all(this._bots.map((b) => b.run().catch((e) => this.emit({ t: "bot:error", bot: b.id, error: String(e.message) }))));
    } finally {
      clearTimeout(cap);
      clearInterval(ticker);
      await browser.close().catch(() => {});
    }

    memory.finishRun(runId, this.stopped ? "stopped" : "done");
    const report = buildReport(memory, runId, this.target, prior);
    this.emit({ t: "stats", ...memory.stats(runId) });
    this.emit({ t: "run:done", runId, report });
    memory.close();
    return report;
  }
}
