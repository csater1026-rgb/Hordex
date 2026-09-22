// Hordex shared memory — the swarm's collective, trained brain.
//
// Three jobs:
//   1. Dedupe work WITHIN a run: bots share one map of visited app states and a
//      single frontier of URLs to explore, so N bots divide the app instead of
//      all crawling the homepage. Claims are atomic (better-sqlite3 is sync).
//   2. Dedupe findings: the same bug found by five bots is reported once.
//   3. Learn ACROSS runs: every state + finding signature is remembered per
//      target origin, so a second scan of the same app knows where the bodies
//      are buried and can go straight for new ground. This is the "trained
//      memory" — it compounds.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function sig(...parts) {
  return crypto.createHash("sha1").update(parts.join("\u0000")).digest("hex").slice(0, 16);
}

export function originOf(url) {
  try { return new URL(url).origin; } catch { return url; }
}

export class Memory {
  constructor(dbPath = ":memory:") {
    this.active = 0; // URLs currently being processed by some bot (for drain detection)
    if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs(
        id INTEGER PRIMARY KEY, target TEXT, origin TEXT,
        started INTEGER, finished INTEGER, status TEXT);
      CREATE TABLE IF NOT EXISTS states(
        run_id INTEGER, sig TEXT, url TEXT, title TEXT,
        first_bot TEXT, visits INTEGER DEFAULT 1, ts INTEGER,
        PRIMARY KEY(run_id, sig));
      CREATE TABLE IF NOT EXISTS frontier(
        id INTEGER PRIMARY KEY, run_id INTEGER, url TEXT, depth INTEGER,
        claimed_by TEXT, visited INTEGER DEFAULT 0, ts INTEGER);
      CREATE UNIQUE INDEX IF NOT EXISTS frontier_uniq ON frontier(run_id, url);
      CREATE TABLE IF NOT EXISTS findings(
        run_id INTEGER, sig TEXT, type TEXT, category TEXT, severity TEXT,
        title TEXT, detail TEXT, url TEXT, evidence TEXT, check_id TEXT,
        persona TEXT, bot TEXT, screenshot TEXT, ts INTEGER,
        PRIMARY KEY(run_id, sig));
      /* Cross-run knowledge, keyed by target origin. */
      CREATE TABLE IF NOT EXISTS knowledge(
        origin TEXT, kind TEXT, sig TEXT, label TEXT,
        seen_count INTEGER DEFAULT 1, last_seen INTEGER,
        PRIMARY KEY(origin, kind, sig));
    `);
  }

  createRun(target) {
    const origin = originOf(target);
    const info = this.db.prepare(
      `INSERT INTO runs(target, origin, started, status) VALUES(?,?,?,?)`
    ).run(target, origin, Date.now(), "running");
    return info.lastInsertRowid;
  }

  finishRun(runId, status = "done") {
    this.db.prepare(`UPDATE runs SET finished=?, status=? WHERE id=?`).run(Date.now(), status, runId);
  }

  // Prior knowledge about this origin from earlier runs (drives "smarter" reruns).
  priorKnowledge(target) {
    const origin = originOf(target);
    const row = this.db.prepare(
      `SELECT
         SUM(kind='state') AS states,
         SUM(kind='finding') AS findings
       FROM knowledge WHERE origin=?`
    ).get(origin);
    return { origin, states: row?.states || 0, findings: row?.findings || 0 };
  }

  // Record a visited state. Returns {isNew, isNewToOrigin, visits}.
  // isNew  -> first time this run (coverage reward).
  // isNewToOrigin -> never seen in ANY past run (the truly novel ground).
  recordState(runId, origin, s, botId) {
    const existing = this.db.prepare(`SELECT visits FROM states WHERE run_id=? AND sig=?`).get(runId, s.sig);
    let isNew = false;
    if (existing) {
      this.db.prepare(`UPDATE states SET visits=visits+1 WHERE run_id=? AND sig=?`).run(runId, s.sig);
    } else {
      isNew = true;
      this.db.prepare(
        `INSERT INTO states(run_id, sig, url, title, first_bot, visits, ts) VALUES(?,?,?,?,?,1,?)`
      ).run(runId, s.sig, s.url, s.title || "", botId, Date.now());
    }
    const known = this.db.prepare(`SELECT sig FROM knowledge WHERE origin=? AND kind='state' AND sig=?`).get(origin, s.sig);
    this._remember(origin, "state", s.sig, s.url);
    return { isNew, isNewToOrigin: isNew && !known, visits: existing ? existing.visits + 1 : 1 };
  }

  _remember(origin, kind, s, label) {
    this.db.prepare(
      `INSERT INTO knowledge(origin, kind, sig, label, seen_count, last_seen) VALUES(?,?,?,?,1,?)
       ON CONFLICT(origin, kind, sig) DO UPDATE SET seen_count=seen_count+1, last_seen=excluded.last_seen`
    ).run(origin, kind, s, label || "", Date.now());
  }

  // --- Frontier (coverage-guided exploration queue) ---
  enqueue(runId, url, depth = 0) {
    try {
      this.db.prepare(
        `INSERT OR IGNORE INTO frontier(run_id, url, depth, ts) VALUES(?,?,?,?)`
      ).run(runId, url, depth, Date.now());
    } catch { /* unique url per run */ }
  }

  // Atomically hand the next unclaimed URL to a bot. null if the frontier is empty.
  claim = this._claimImpl.bind(this);
  _claimImpl(runId, botId) {
    const tx = this.db.transaction(() => {
      const row = this.db.prepare(
        `SELECT id, url, depth FROM frontier
         WHERE run_id=? AND visited=0 AND claimed_by IS NULL
         ORDER BY depth ASC, id ASC LIMIT 1`
      ).get(runId);
      if (!row) return null;
      this.db.prepare(`UPDATE frontier SET claimed_by=? WHERE id=?`).run(botId, row.id);
      return row;
    });
    const row = tx();
    if (row) this.active++; // count this URL as in-flight until released
    return row;
  }

  markVisited(id) {
    this.db.prepare(`UPDATE frontier SET visited=1 WHERE id=?`).run(id);
  }

  // Called after a claimed URL is fully processed. When active hits 0 and the
  // frontier is empty, no bot can add more work, so waiting bots may exit.
  release() { this.active = Math.max(0, this.active - 1); }

  frontierPending(runId) {
    return this.db.prepare(`SELECT COUNT(*) c FROM frontier WHERE run_id=? AND visited=0`).get(runId).c;
  }

  // --- Findings ---
  // Returns {isNew}. Deduped by finding signature within the run.
  addFinding(runId, origin, f) {
    const s = f.sig || sig(f.type, f.url || "", f.check_id || "", f.title || "");
    const existing = this.db.prepare(`SELECT sig FROM findings WHERE run_id=? AND sig=?`).get(runId, s);
    if (existing) return { isNew: false, sig: s };
    this.db.prepare(
      `INSERT INTO findings(run_id, sig, type, category, severity, title, detail, url, evidence, check_id, persona, bot, screenshot, ts)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(runId, s, f.type, f.category || "", f.severity || "med", f.title || "", f.detail || "",
          f.url || "", f.evidence || "", f.check_id || "", f.persona || "", f.bot || "", f.screenshot || "", Date.now());
    this._remember(origin, "finding", s, f.title || f.type);
    return { isNew: true, sig: s };
  }

  // --- Read models for the dashboard / report ---
  findings(runId) {
    return this.db.prepare(`SELECT * FROM findings WHERE run_id=? ORDER BY
      CASE severity WHEN 'crit' THEN 4 WHEN 'high' THEN 3 WHEN 'med' THEN 2 ELSE 1 END DESC, ts ASC`).all(runId);
  }
  states(runId) {
    return this.db.prepare(`SELECT * FROM states WHERE run_id=? ORDER BY ts ASC`).all(runId);
  }
  stats(runId) {
    const f = this.db.prepare(
      `SELECT severity, COUNT(*) c FROM findings WHERE run_id=? GROUP BY severity`).all(runId);
    const bySev = { crit: 0, high: 0, med: 0, low: 0 };
    for (const r of f) bySev[r.severity] = r.c;
    return {
      states: this.db.prepare(`SELECT COUNT(*) c FROM states WHERE run_id=?`).get(runId).c,
      findings: this.db.prepare(`SELECT COUNT(*) c FROM findings WHERE run_id=?`).get(runId).c,
      bySeverity: bySev,
      pending: this.frontierPending(runId),
    };
  }

  close() { this.db.close(); }
}
