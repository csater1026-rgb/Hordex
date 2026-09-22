// Hordex bot personas — the "imperfect humans" the swarm impersonates.
//
// Each persona biases how a bot behaves: where it goes, how carefully it reads,
// how it fills forms, and what "noise" (typos, back-button, double-submit) it
// introduces. The malformed-input attacker is the one that carries payloads.

export const PERSONAS = [
  {
    id: "skimmer",
    label: "Impatient skimmer",
    emoji: "⚡",
    // Clicks fast, rarely reads, abandons flows halfway.
    bias: { explore: 0.7, forms: 0.3, back: 0.25, doubleSubmit: 0.15, malicious: 0 },
    blurb: "Clicks the first thing, bounces between pages, leaves forms half-filled.",
  },
  {
    id: "newcomer",
    label: "Unfamiliar user",
    emoji: "🧭",
    // Cautious, mis-clicks, tries obvious things, gets lost.
    bias: { explore: 0.5, forms: 0.6, back: 0.35, doubleSubmit: 0.2, malicious: 0 },
    blurb: "New to the UI — hovers, mis-clicks, backtracks, re-reads.",
  },
  {
    id: "power",
    label: "Keyboard power-user",
    emoji: "⌨️",
    // Fills forms fast and completely, opens many pages.
    bias: { explore: 0.8, forms: 0.85, back: 0.1, doubleSubmit: 0.3, malicious: 0 },
    blurb: "Blazes through forms, opens everything, submits fast (and twice).",
  },
  {
    id: "flaky",
    label: "Bad-connection mobile",
    emoji: "📶",
    // Retries, double-submits, leaves tabs idle.
    bias: { explore: 0.45, forms: 0.5, back: 0.3, doubleSubmit: 0.45, malicious: 0 },
    blurb: "Laggy taps, retries, double-submits, idles mid-flow.",
  },
  {
    id: "attacker",
    label: "Malformed-input attacker",
    emoji: "🕷️",
    // Probes inputs and URLs with hostile payloads. Authorized target only.
    bias: { explore: 0.6, forms: 0.9, back: 0.1, doubleSubmit: 0.2, malicious: 1 },
    blurb: "Feeds every input hostile data, fuzzes ids and hidden paths.",
  },
];

// Hostile-but-safe probe payloads the attacker persona injects into text inputs.
// These are detection probes (reflection, error-triggering), not exploits.
export const ATTACK_PAYLOADS = [
  `<img src=x onerror="window.__hordex_xss=1">`,
  `"><svg onload="window.__hordex_xss=1">`,
  `' OR '1'='1`,
  `{{7*7}}`,
  `../../../../etc/passwd`,
  `\u0000\u0000\u0000`,
  `A`.repeat(2048),
];

export function personaById(id) {
  return PERSONAS.find((p) => p.id === id) || PERSONAS[0];
}

// Assign personas round-robin across a swarm of n bots, guaranteeing that the
// attacker persona is present whenever there are at least two bots (its
// origin-level probes are a core part of every scan).
export function assignPersonas(n) {
  const out = Array.from({ length: n }, (_, i) => PERSONAS[i % PERSONAS.length]);
  if (n >= 2 && !out.some((p) => p.id === "attacker")) out[n - 1] = personaById("attacker");
  return out;
}
