// Hordex bot brain — decides what a bot does on the page it's looking at.
//
// With an ANTHROPIC_API_KEY, Claude is handed a compact description of the page
// (url, title, the interactable elements) plus the bot's persona, and returns a
// short plan of human-like actions. This is what makes the swarm "AI-driven"
// rather than a fixed script — Claude improvises like the persona would.
//
// With no key, a deterministic heuristic produces a thorough plan (fill every
// input, submit every form, click every button). The heuristic alone achieves
// full coverage of the demo target, which keeps the offline self-test honest.
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } from "./env.js";
import { CHAOS_INPUTS } from "./personas.js";

// Realistic-ish values a normal user would type, by input type/name.
function humanValue(input) {
  const t = (input.type || "").toLowerCase();
  const n = (input.name || "").toLowerCase();
  if (t === "email" || n.includes("email")) return "test.user@example.com";
  if (t === "password" || n.includes("pass")) return "Password123!";
  if (n.includes("search") || n === "q") return "meeting notes";
  if (t === "number") return "42";
  return "hello world";
}

function chaosValue(step) {
  return CHAOS_INPUTS[step % CHAOS_INPUTS.length];
}

// The deterministic plan. `obs` = observed page; returns an ordered action list.
export function heuristicPlan(obs) {
  const chaos = obs.persona?.bias?.chaos === 1;
  const actions = [];

  // Fill inputs, then submit forms — this is what surfaces validation/state bugs.
  obs.inputs?.forEach((inp, i) => {
    actions.push({ kind: "type", idx: inp.idx, value: chaos ? chaosValue(i) : humanValue(inp), reason: chaos ? "type messy input a real user might paste" : "fill the field" });
  });
  obs.forms?.forEach((f) => actions.push({ kind: "submit", idx: f.idx, reason: "submit the form" }));

  // Click standalone buttons (not the form submits) — triggers handlers/crashes.
  obs.buttons?.forEach((b) => actions.push({ kind: "click", idx: b.idx, reason: `click "${b.text || "button"}"` }));

  // Double-submit noise for the personas prone to it (race/state bugs).
  if ((obs.persona?.bias?.doubleSubmit || 0) > 0.3 && obs.forms?.length) {
    actions.push({ kind: "submit", idx: obs.forms[0].idx, reason: "double-submit (impatient retry)" });
  }
  return actions;
}

async function claudePlan(obs, signal) {
  const sys =
    "You are one bot in a swarm testing a web app the user OWNS, by behaving like a real, imperfect end user of that persona. " +
    "You are NOT attacking or probing for vulnerabilities — you are exercising the app's normal features to surface broken flows, dead buttons, and crashes. " +
    "Given the current page and your persona, return a short JSON plan of human-like actions to try. " +
    'Reply ONLY with JSON: {"actions":[{"kind":"type|click|submit","idx":<number>,"value":"<for type>","reason":"<short>"}]}. ' +
    "Use the idx values exactly as given. Keep it to at most 8 actions.";
  const user = JSON.stringify({
    persona: { id: obs.persona?.id, label: obs.persona?.label, style: obs.persona?.blurb },
    url: obs.url, title: obs.title,
    inputs: obs.inputs, buttons: obs.buttons, forms: obs.forms,
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 700,
      system: sys,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || "").join("");
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  if (!Array.isArray(json.actions)) throw new Error("no actions");
  return json.actions;
}

// Decide the page plan. Always resolves (falls back to heuristic on any error).
export async function decidePlan(obs) {
  if (!ANTHROPIC_API_KEY) return { plan: heuristicPlan(obs), by: "heuristic" };
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    try {
      const plan = await claudePlan(obs, ctl.signal);
      return { plan, by: "claude" };
    } finally { clearTimeout(t); }
  } catch (e) {
    return { plan: heuristicPlan(obs), by: "heuristic", note: `claude fallback: ${e.message}` };
  }
}
