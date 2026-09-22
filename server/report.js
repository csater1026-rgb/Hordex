// Hordex report — turns raw findings into something a non-engineer can act on.
// Plain-language "what it means" + "how to fix", grouped by severity, with a
// Markdown export. Also surfaces the trained-memory effect on repeat runs.
import { ALL_CHECKS } from "./checks-data.js";

const CHECK = Object.fromEntries(ALL_CHECKS.map((c) => [c.id, c]));
const plain = (h = "") => String(h).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const SEV_LABEL = { crit: "Critical", high: "High", med: "Medium", low: "Low" };
const SEV_ORDER = ["crit", "high", "med", "low"];

// Fix guidance keyed by check id, then by category, then a generic fallback.
const FIX_BY_CHECK = {
  "rec-keys": "Move the secret to the server. Never ship live keys in browser JS — rotate any that leaked and use a server endpoint or a publishable/restricted key instead.",
  "rec-env": "Stop serving dotfiles. Block /.env and similar from the web root, and rotate every secret that was exposed — treat them as compromised.",
  "az-idor": "Check ownership on every request. The server must confirm the logged-in user owns the object before returning it — never trust the id in the URL.",
  "au-rate": "Add rate limiting and lockout on auth endpoints (e.g. per-IP + per-account throttling) so credentials can't be brute-forced.",
  "xss-reflect": "Escape user input before putting it in the page, and add a Content-Security-Policy. Never build HTML by concatenating raw input.",
  "cl-storage": "Don't keep tokens in localStorage (any script can read them). Prefer httpOnly, Secure cookies.",
  "th-headers": "Add security headers — at minimum Content-Security-Policy and X-Frame-Options — on every HTML response.",
  "th-hsts": "Add Strict-Transport-Security so browsers only ever connect over HTTPS.",
  "cl-logic": "Enforce paid/entitlement logic on the server. A client-side flag can be flipped by anyone in devtools — the server must gate the feature.",
};
const FIX_BY_CATEGORY = {
  "JavaScript error": "A code path throws an unhandled error, so the feature just breaks for the user. Reproduce the click, read the console, and guard the failing call.",
  "Server error": "An endpoint returns a 5xx, so the feature fails. Check the server logs for that route and handle the error instead of crashing.",
  "Broken flow": "A form submit is silently failing. Fix the endpoint it posts to (or the payload it sends) and show the user a real success/error state.",
  "Broken link": "A link points at a page that doesn't exist. Fix the href or add the missing route.",
};

export function guidance(f) {
  if (f.check_id && FIX_BY_CHECK[f.check_id]) return FIX_BY_CHECK[f.check_id];
  if (FIX_BY_CATEGORY[f.category]) return FIX_BY_CATEGORY[f.category];
  return "Reproduce the issue, confirm the impact, and fix at the source.";
}

export function meaning(f) {
  if (f.type === "security" && f.check_id && CHECK[f.check_id]?.d) {
    const d = CHECK[f.check_id].d;
    return plain(d.what) + (d.why ? " " + plain(d.why) : "");
  }
  return f.detail || "";
}

export function buildReport(memory, runId, target, prior = { states: 0, findings: 0 }) {
  const findings = memory.findings(runId).map((f) => ({
    severity: f.severity, severityLabel: SEV_LABEL[f.severity] || f.severity,
    type: f.type, category: f.category, title: f.title, url: f.url,
    evidence: f.evidence, check_id: f.check_id, foundBy: f.bot, persona: f.persona,
    meaning: meaning(f), fix: guidance(f),
  }));
  const stats = memory.stats(runId);
  const states = memory.states(runId);

  return {
    target,
    generatedAt: new Date().toISOString(),
    summary: {
      statesExplored: stats.states,
      findings: stats.findings,
      bySeverity: stats.bySeverity,
      security: findings.filter((f) => f.type === "security").length,
      functional: findings.filter((f) => f.type === "functional").length,
    },
    trainedMemory: prior.states > 0 || prior.findings > 0
      ? { seenBefore: true, priorStates: prior.states, priorFindings: prior.findings,
          note: `This target was scanned before — the swarm already knew ${prior.states} app states and ${prior.findings} issue signatures, so it spent this run pushing into new ground.` }
      : { seenBefore: false, note: "First scan of this target — the swarm is building its memory of it now. Re-scan to see it get faster and go deeper." },
    findings,
    statesExplored: states.map((s) => ({ url: s.url, title: s.title, firstBot: s.first_bot, visits: s.visits })),
    markdown: toMarkdown(target, findings, stats),
  };
}

export function toMarkdown(target, findings, stats) {
  const lines = [];
  lines.push(`# Hordex report — ${target}`, "");
  lines.push(`Scanned ${new Date().toLocaleString()} · ${stats.states} app states explored · **${stats.findings} findings**`, "");
  lines.push(`| Critical | High | Medium | Low |`, `|---|---|---|---|`,
    `| ${stats.bySeverity.crit} | ${stats.bySeverity.high} | ${stats.bySeverity.med} | ${stats.bySeverity.low} |`, "");
  for (const sev of SEV_ORDER) {
    const group = findings.filter((f) => f.severity === sev);
    if (!group.length) continue;
    lines.push(`## ${SEV_LABEL[sev]} (${group.length})`, "");
    for (const f of group) {
      lines.push(`### ${f.title}`);
      lines.push(`- **Where:** ${f.url || "—"}${f.check_id ? ` · check \`${f.check_id}\`` : ""}`);
      if (f.evidence) lines.push(`- **Evidence:** ${f.evidence}`);
      if (f.meaning) lines.push(`- **What it means:** ${f.meaning}`);
      lines.push(`- **How to fix:** ${f.fix}`);
      lines.push(`- **Found by:** ${f.foundBy} (${f.persona})`, "");
    }
  }
  lines.push("---", "_Generated by Hordex — the swarm that tests your app before your users do._");
  return lines.join("\n");
}
