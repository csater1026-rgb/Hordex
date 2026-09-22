// Hordex self-test — proof the swarm works, offline and headless.
//
// Boots the deliberately-buggy demo target on a random port, runs the swarm
// against it (see demo-target/app.js), and asserts that every planted bug is found and that the shared
// memory dedupes. Also runs a second scan to prove cross-run "trained memory".
// Exit code 0 = all planted bugs found; non-zero = something regressed.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createDemoApp } from "../demo-target/app.js";
import { Orchestrator } from "./orchestrator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Every planted bug the swarm must catch (see demo-target/app.js).
const EXPECT_SECURITY = ["rec-keys", "rec-env", "az-idor", "au-rate", "xss-reflect", "cl-storage", "th-headers", "cl-logic"];
const EXPECT_FUNCTIONAL = ["JavaScript error", "Server error", "Broken flow", "Broken link"];

function startDemo() {
  return new Promise((resolve) => {
    const server = http.createServer(createDemoApp());
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  const { server, port } = await startDemo();
  const target = `http://127.0.0.1:${port}/`;
  const dbPath = path.join(os.tmpdir(), `hordex-selftest-${Date.now()}.sqlite`);
  const events = [];
  const emit = (e) => events.push(e);

  console.log(`▶ Scanning demo target ${target} with the swarm…\n`);
  const t0 = Date.now();
  const report = await new Orchestrator({ target, bots: 6, authorized: true, dbPath, emit }).run();
  const ms = Date.now() - t0;

  const foundChecks = new Set(report.findings.filter((f) => f.type === "security").map((f) => f.check_id));
  const foundCats = new Set(report.findings.filter((f) => f.type === "functional").map((f) => f.category));

  // Report table.
  const s = report.summary;
  console.log(`Explored ${s.statesExplored} states · ${s.findings} findings (${s.security} security, ${s.functional} functional) in ${ms}ms`);
  console.log(`Severity → crit:${s.bySeverity.crit} high:${s.bySeverity.high} med:${s.bySeverity.med} low:${s.bySeverity.low}\n`);
  for (const f of report.findings) {
    console.log(`  [${f.severityLabel.padEnd(8)}] ${f.title}  ·  ${f.check_id || f.category}  ·  ${f.foundBy}/${f.persona}`);
  }

  // Assertions.
  const missSec = EXPECT_SECURITY.filter((c) => !foundChecks.has(c));
  const missFn = EXPECT_FUNCTIONAL.filter((c) => !foundCats.has(c));

  // Dedupe sanity: every finding signature is unique in the report.
  const sigs = report.findings.map((f) => (f.check_id || f.category) + "|" + f.url);
  const deduped = sigs.length === new Set(sigs).size;

  // Trained-memory: a second scan must know the origin from the first.
  const events2 = [];
  await new Orchestrator({ target, bots: 4, authorized: true, dbPath, emit: (e) => events2.push(e) }).run();
  const start2 = events2.find((e) => e.t === "run:start");
  const learned = start2 && start2.prior && start2.prior.states > 0;

  server.close();
  try { fs.rmSync(dbPath, { force: true }); fs.rmSync(dbPath + "-wal", { force: true }); fs.rmSync(dbPath + "-shm", { force: true }); } catch {}

  console.log("\n── Checks ──");
  console.log(`${missSec.length === 0 ? "✓" : "✗"} security bugs found${missSec.length ? " — MISSING: " + missSec.join(", ") : ""}`);
  console.log(`${missFn.length === 0 ? "✓" : "✗"} functional bugs found${missFn.length ? " — MISSING: " + missFn.join(", ") : ""}`);
  console.log(`${deduped ? "✓" : "✗"} findings deduped by shared memory`);
  console.log(`${learned ? "✓" : "✗"} trained memory carried into re-scan (knew ${start2?.prior?.states || 0} states)`);

  const ok = missSec.length === 0 && missFn.length === 0 && deduped && learned;
  console.log(`\n${ok ? "✅ PASS" : "❌ FAIL"} — Hordex swarm self-test\n`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error("self-test crashed:", e); process.exit(1); });
