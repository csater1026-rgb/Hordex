// Hordex security layer — passive checks mapped onto the Rootline 84-check
// framework. As bots browse, we inspect the same things a black-box tester
// would: response headers, page bodies, inline scripts, browser storage, and a
// handful of well-known paths. Each hit is tagged with the framework check id it
// evidences, so the report speaks the same language as the manual checklist.
//
// "Passive" = observed from normal browsing plus a few safe GET probes and one
// throttling probe. Nothing destructive; authorized-target testing only.
import { ALL_CHECKS } from "./checks-data.js";
import { CHROMIUM_PATH } from "./env.js";

const CHECK = Object.fromEntries(ALL_CHECKS.map((c) => [c.id, c]));

// Strip the HTML tags the framework notes use, for clean report text.
function plain(html = "") {
  return String(html).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// Build a finding pre-filled from a framework check.
function fromCheck(id, extra) {
  const c = CHECK[id] || {};
  return {
    type: "security",
    check_id: id,
    category: c.cat || "Security",
    severity: c.sev || "med",
    title: c.t || id,
    detail: c.d ? plain(c.d.what) + " " + plain(c.d.why) : "",
    ...extra,
  };
}

// Secret-key fingerprints that must never reach the browser bundle.
const SECRET_PATTERNS = [
  { re: /sk_live_[A-Za-z0-9]{16,}/, what: "Stripe live secret key" },
  { re: /sk-[A-Za-z0-9]{20,}/, what: "OpenAI-style secret key" },
  { re: /AIza[0-9A-Za-z_\-]{30,}/, what: "Google API key" },
  { re: /service_role/, what: "Supabase service_role reference" },
  { re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, what: "Private key" },
];

const SECURITY_HEADERS = [
  { key: "content-security-policy", id: "th-headers", label: "Content-Security-Policy" },
  { key: "x-frame-options", id: "th-headers", label: "X-Frame-Options" },
  { key: "strict-transport-security", id: "th-hsts", label: "Strict-Transport-Security" },
];

// Common paths that should never be readable but often are on vibe-coded hosts.
export const PROBE_PATHS = ["/.env", "/.git/config", "/config.json", "/.env.local"];

// --- Per-page passive scan. `ctx` carries page body, headers, storage, url. ---
export function scanPage(ctx) {
  const found = [];
  const { url, status, headers = {}, body = "", storage = {}, xssMarker = false } = ctx;

  // rec-keys — secrets inlined in the page/bundle.
  for (const p of SECRET_PATTERNS) {
    const m = body.match(p.re);
    if (m) found.push(fromCheck("rec-keys", { url, evidence: `${p.what}: ${m[0].slice(0, 12)}…` }));
  }

  // th-headers / th-hsts — missing transport & security headers (top-level docs).
  if ((headers["content-type"] || "").includes("text/html")) {
    for (const h of SECURITY_HEADERS) {
      if (!headers[h.key]) found.push(fromCheck(h.id, { url, evidence: `Missing ${h.label} response header` }));
    }
  }

  // cl-storage — tokens / secrets sitting in local/session storage.
  for (const [k, v] of Object.entries(storage)) {
    if (/token|jwt|secret|key|auth/i.test(k) || /^ey[A-Za-z0-9_-]+\./.test(String(v))) {
      found.push(fromCheck("cl-storage", { url, evidence: `localStorage["${k}"] holds a token-like value` }));
    }
  }

  // xss-reflect — our injected marker executed, i.e. input reflected as live HTML.
  if (xssMarker) found.push(fromCheck("xss-reflect", { url, evidence: "Injected marker executed — input reflected unescaped" }));

  // rec-env / config exposure — a probe path returned secrets.
  if (ctx.probe && status === 200 && /secret|password|key|postgres:\/\/|DATABASE_URL/i.test(body)) {
    found.push(fromCheck("rec-env", { url, evidence: `${url} is world-readable and leaks secrets` }));
  }

  return dedupe(found);
}

// --- IDOR probe: fetch object ids we were never given and see if they return. ---
export function scanIdor(url, otherUsersReturned) {
  if (!otherUsersReturned?.length) return [];
  return [fromCheck("az-idor", {
    url,
    evidence: `Object endpoint returned records for ids ${otherUsersReturned.join(", ")} with no auth`,
  })];
}

// --- Rate-limit probe: many rapid auth attempts, none throttled. ---
export function scanRateLimit(url, attempts, throttled) {
  if (throttled) return [];
  return [fromCheck("au-rate", {
    url,
    evidence: `${attempts} rapid attempts, zero throttling (no 429 / lockout)`,
  })];
}

// --- Client-only gate: a "pro/paid" feature toggled by a JS flag with no server call. ---
export function scanClientGate(url, present) {
  if (!present) return [];
  return [fromCheck("cl-logic", {
    url,
    evidence: "A paid/Pro feature unlocks from a client-side flag with no server check",
  })];
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((f) => {
    const k = f.check_id + "\u0000" + (f.url || "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export { CHROMIUM_PATH };
