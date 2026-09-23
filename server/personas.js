// Hordex bot personas — the "imperfect humans" the swarm impersonates.
//
// Each persona biases how a bot behaves: where it goes, how it fills forms, and
// what human "noise" (typos, back-button, double-submit) it introduces. The
// chaos user is the one that feeds inputs the messy stuff real people actually
// type — emojis, giant pastes, empty fields — which is how real users trip
// validation bugs and crashes. Nothing here attacks or exploits an app.

export const PERSONAS = [
  {
    id: "skimmer",
    label: "Impatient skimmer",
    emoji: "⚡",
    bias: { explore: 0.7, forms: 0.3, back: 0.25, doubleSubmit: 0.15, chaos: 0 },
    blurb: "Clicks the first thing, bounces between pages, leaves forms half-filled.",
  },
  {
    id: "newcomer",
    label: "Unfamiliar user",
    emoji: "🧭",
    bias: { explore: 0.5, forms: 0.6, back: 0.35, doubleSubmit: 0.2, chaos: 0 },
    blurb: "New to the UI — hovers, mis-clicks, backtracks, re-reads.",
  },
  {
    id: "power",
    label: "Keyboard power-user",
    emoji: "⌨️",
    bias: { explore: 0.8, forms: 0.85, back: 0.1, doubleSubmit: 0.3, chaos: 0 },
    blurb: "Blazes through forms, opens everything, submits fast (and twice).",
  },
  {
    id: "flaky",
    label: "Bad-connection mobile",
    emoji: "📶",
    bias: { explore: 0.45, forms: 0.5, back: 0.3, doubleSubmit: 0.45, chaos: 0 },
    blurb: "Laggy taps, retries, double-submits, idles mid-flow.",
  },
  {
    id: "chaos",
    label: "Chaos user",
    emoji: "🌀",
    // Types the messy things real users type. Not an attacker — just unpredictable.
    bias: { explore: 0.6, forms: 0.9, back: 0.15, doubleSubmit: 0.25, chaos: 1 },
    blurb: "Pastes emojis and giant text, submits empty forms, mashes buttons.",
  },
];

// Messy-but-ordinary input a real, careless user might type. These surface
// validation gaps, overflow, and crashes — they are NOT injection payloads.
export const CHAOS_INPUTS = [
  "😀🎉🔥✨🚀".repeat(12),
  "a".repeat(5000),
  "",
  "     ",
  "0",
  "-1",
  "not an email",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA AAAAAAAAAAAAAAAAAAAAAAAA",
  "🇺🇳🏳️‍🌈👨‍👩‍👧‍👦",
  "\n\n\n\t\t",
  "١٢٣٤٥٦",
  "ЗдравствуйтеПриветПока",
];

export function personaById(id) {
  return PERSONAS.find((p) => p.id === id) || PERSONAS[0];
}

// Assign personas round-robin across a swarm of n bots.
export function assignPersonas(n) {
  return Array.from({ length: n }, (_, i) => PERSONAS[i % PERSONAS.length]);
}
