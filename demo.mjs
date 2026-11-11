// Guarded Agent Checkout - demo CLI.
//
// An AI shopping agent proposes a purchase. Before any money moves, the
// guard runs tgp-guard-style pre-flight checks (merchant sanity, price
// sanity, quote consistency) and the Aegis-style spend policy (per-tx cap,
// daily limit, freeze). Only an ALLOW reaches the PayPal payment step.
//
// Usage:
//   node demo.mjs agent "<goal>"       AI agent mode: a real LLM turns the
//                                      plain-English goal into a purchase
//                                      proposal, the guard checks it, and
//                                      an AI risk reviewer reviews it
//                                      before any payment (see src/ai.mjs)
//   node demo.mjs all [--fresh]        run every scenario
//   node demo.mjs allow|merchant|overlimit|offmarket|hold|freeze
//   node demo.mjs capture <ORDER_ID>   finish a sandbox order after buyer approval
//
// Payment mode: real PayPal SANDBOX when PAYPAL_CLIENT_ID and
// PAYPAL_CLIENT_SECRET are set in the environment; otherwise a clearly
// labelled MOCK mode. See src/paypal.mjs.

import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { merchantCheck, priceCheck, quoteCheck, worst, KNOWN_MERCHANTS } from "./src/checks.mjs";
import { SpendPolicy } from "./src/policy.mjs";
import { createPayPalClient, paypalMode } from "./src/paypal.mjs";
import { proposePurchase, reviewPurchase, aiConfig } from "./src/ai.mjs";

const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const cmd = args.find((a) => !a.startsWith("--")) || "all";

const config = JSON.parse(readFileSync(new URL("./policy.json", import.meta.url), "utf8"));
const paypal = createPayPalClient();
const mode = paypalMode();

const CATALOG = {
  "USB-C docking hub": 42.4,
  "Laptop stand": 35.2,
  "RTX workstation GPU": 452.0,
  "Mechanical keyboard": 25.1,
};

// Each scenario intent is a fixed test case for the guard, so the six
// verdicts are reproducible offline. For a live AI agent making the
// proposal instead, use `node demo.mjs agent "<goal>"` (src/ai.mjs):
// the guard does not care where the proposal came from, which is the
// point - and the agent mode proves it with a real model call.
const SCENARIOS = {
  allow: {
    title: "Legit purchase - should go through",
    intent: { merchant: "AnkerDirect", item: "USB-C docking hub", unitPrice: 42.0, qty: 1, shipping: 0, total: 42.0 },
  },
  merchant: {
    title: "Blocked merchant - should BLOCK before payment",
    intent: { merchant: "Shadow Imports Ltd", item: "Laptop stand", unitPrice: 35.0, qty: 1, shipping: 0, total: 35.0 },
  },
  overlimit: {
    title: "Over the per-transaction cap - policy BLOCK",
    intent: { merchant: "BaseMart", item: "RTX workstation GPU", unitPrice: 450.0, qty: 1, shipping: 0, total: 450.0 },
  },
  offmarket: {
    title: "Off-market price (the classic agent overpay) - price BLOCK",
    intent: { merchant: "AnkerDirect", item: "USB-C docking hub", unitPrice: 79.0, qty: 1, shipping: 0, total: 79.0 },
  },
  hold: {
    title: "Unknown merchant - HOLD for a human",
    intent: { merchant: "RandomSeller99", item: "Mechanical keyboard", unitPrice: 25.0, qty: 1, shipping: 0, total: 25.0 },
  },
  freeze: {
    title: "Owner freeze switch on - everything BLOCKs",
    intent: { merchant: "AnkerDirect", item: "USB-C docking hub", unitPrice: 42.0, qty: 1, shipping: 0, total: 42.0 },
    frozen: true,
  },
};

function banner() {
  console.log("=".repeat(72));
  console.log("GUARDED AGENT CHECKOUT - an AI agent pays, a guard decides first");
  if (mode === "mock") {
    console.log("PAYMENT MODE: *** MOCK ***  No PayPal credentials found, so the");
    console.log("payment step is SIMULATED locally. Nothing below is a real PayPal");
    console.log("call. Set PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET (sandbox app)");
    console.log("to run the identical flow against the real PayPal sandbox.");
  } else {
    console.log("PAYMENT MODE: PayPal SANDBOX (api-m.sandbox.paypal.com) - test money only");
  }
  console.log("=".repeat(72));
}

async function executePayment(it, policy) {
  const order = await paypal.createOrder({
    amount: it.total,
    currency: "USD",
    description: `${it.item} from ${it.merchant} (via Guarded Agent Checkout)`,
  });
  console.log(
    `PAYMENT: order ${order.id} - ${order.status}` +
      (order.mode === "mock" ? "  [SIMULATED]" : "")
  );
  if (order.approveUrl) {
    console.log(`  Buyer approval (sandbox test account): ${order.approveUrl}`);
    console.log(`  After approving, finish with: node demo.mjs capture ${order.id}`);
  }
  const cap = await paypal.captureOrder(order.id);
  console.log(`  Capture: ${cap.status}` + (cap.mode === "mock" ? "  [SIMULATED]" : ""));
  if (String(cap.status).startsWith("COMPLETED")) {
    policy.record(it.total, order.id);
    console.log(`  Policy ledger: $${it.total.toFixed(2)} recorded. Spent today: $${policy.spentToday.toFixed(2)} / $${config.dailyLimitUSD}`);
  } else {
    console.log("  Policy ledger: spend NOT recorded - payment has not completed.");
  }
  return { order, capture: cap };
}

function guardChecks(it, policy, frozen = false) {
  return [
    merchantCheck(it.merchant),
    priceCheck({ item: it.item, quoted: it.unitPrice, reference: CATALOG[it.item] }),
    quoteCheck(it),
    (frozen ? new SpendPolicy({ ...config, frozen: true }, { fresh: true }) : policy).check(it.total),
  ];
}

async function runScenario(name, policy) {
  const sc = SCENARIOS[name];
  const it = sc.intent;
  console.log(`\n--- SCENARIO: ${name} - ${sc.title} ---`);
  console.log(
    `AGENT proposes: buy ${it.qty} x "${it.item}" from ${it.merchant} for $${it.total.toFixed(2)}`
  );
  const checks = guardChecks(it, policy, Boolean(sc.frozen));
  for (const c of checks) console.log(`  ${c.verdict.padEnd(5)} [${c.check}] ${c.reason}`);
  const final = worst(checks.map((c) => c.verdict));
  console.log(`GUARD VERDICT: ${final}`);

  let payment = null;
  if (final === "ALLOW") {
    try {
      payment = await executePayment(it, policy);
    } catch (e) {
      // A failed payment step is a demo outcome, not a crash: report what
      // PayPal (or the network) actually said.
      console.log(`PAYMENT: FAILED - ${String(e.message).slice(0, 300)}`);
      payment = { error: String(e.message).slice(0, 300) };
    }
  } else if (final === "HOLD") {
    console.log("PAYMENT: none. Held for human approval - the agent cannot proceed alone.");
  } else {
    console.log("PAYMENT: none. Blocked by the guard - no PayPal call was made.");
  }

  mkdirSync(new URL("./evidence/", import.meta.url), { recursive: true });
  appendFileSync(
    new URL("./evidence/demo-log.jsonl", import.meta.url),
    JSON.stringify({ ts: new Date().toISOString(), scenario: name, intent: it, checks, final, paymentMode: mode, payment }) + "\n"
  );
  return final;
}

// --- AI agent mode ---------------------------------------------------------
// A real LLM makes the proposal and reviews the risk; the guard still
// decides. The reviewer can hold an ALLOW for a human; it can never clear
// a BLOCK/HOLD, edit an amount, or raise a cap. If the AI is unreachable,
// an unreviewed ALLOW is held rather than paid - no fake AI output, ever.
async function runAgent(goal, policy) {
  const cfg = aiConfig();
  console.log(`\n--- AI AGENT MODE ---`);
  console.log(`GOAL: "${goal}"`);
  console.log(`AI: model "${cfg.model}" via ${cfg.baseUrl} - live LLM calls, nothing canned`);

  const log = (rec) => {
    mkdirSync(new URL("./evidence/", import.meta.url), { recursive: true });
    appendFileSync(
      new URL("./evidence/demo-log.jsonl", import.meta.url),
      JSON.stringify({ ts: new Date().toISOString(), scenario: "agent", goal, ai: { model: cfg.model, baseUrl: cfg.baseUrl }, ...rec }) + "\n"
    );
  };

  let proposal;
  try {
    proposal = await proposePurchase(goal, { catalog: CATALOG, knownMerchants: KNOWN_MERCHANTS });
  } catch (e) {
    console.log(`AI AGENT: FAILED - ${e.message}`);
    log({ error: String(e.message) });
    return "ERROR";
  }
  const it = {
    merchant: proposal.merchant,
    item: proposal.item,
    unitPrice: proposal.unitPrice,
    qty: proposal.qty,
    shipping: proposal.shipping,
    total: proposal.total,
  };
  // Models are loose with casing ("mechanical keyboard" vs the
  // catalogue's "Mechanical keyboard"); canonicalise to the catalogue
  // key when only the case differs. A genuinely unknown item still
  // HOLDs below.
  const canonical = Object.keys(CATALOG).find(
    (k) => k.toLowerCase() === String(it.item).toLowerCase()
  );
  if (canonical) it.item = canonical;
  console.log(`AI AGENT proposes: buy ${it.qty} x "${it.item}" from ${it.merchant} for $${Number(it.total).toFixed(2)}`);
  if (proposal.reasoning) console.log(`  Agent reasoning: ${proposal.reasoning}`);

  if (!Object.prototype.hasOwnProperty.call(CATALOG, it.item)) {
    console.log(`FINAL VERDICT: HOLD - the agent proposed an item outside the catalogue ("${it.item}"); a human must review it. No payment.`);
    log({ proposal, final: "HOLD", holdReason: "item outside catalogue" });
    return "HOLD";
  }

  const checks = guardChecks(it, policy);
  for (const c of checks) console.log(`  ${c.verdict.padEnd(5)} [${c.check}] ${c.reason}`);
  const guardFinal = worst(checks.map((c) => c.verdict));
  console.log(`GUARD VERDICT (deterministic rules): ${guardFinal}`);

  let review = null;
  let final = guardFinal;
  try {
    review = await reviewPurchase({ goal, intent: it, checks, guardVerdict: guardFinal });
    console.log(`AI REVIEWER: risk ${String(review.riskLevel).toUpperCase()} - ${review.summary}`);
    for (const f of review.flags) console.log(`  flag: ${f}`);
    console.log(`  Recommendation: ${review.recommendation}`);
    if (guardFinal === "ALLOW" && review.recommendation === "hold") {
      final = "HOLD";
      console.log("  The reviewer held an allowed payment for a human. (It can hold; it can never clear.)");
    } else if (guardFinal !== "ALLOW") {
      console.log(`  The reviewer cannot clear a guard ${guardFinal} - the verdict stands.`);
    }
  } catch (e) {
    console.log(`AI REVIEWER: FAILED - ${e.message}`);
    if (guardFinal === "ALLOW") {
      final = "HOLD";
      console.log("  No AI review, no payment: an unreviewed ALLOW is held for a human.");
    }
  }
  console.log(`FINAL VERDICT: ${final}`);

  let payment = null;
  if (final === "ALLOW") {
    try {
      payment = await executePayment(it, policy);
    } catch (e) {
      console.log(`PAYMENT: FAILED - ${String(e.message).slice(0, 300)}`);
      payment = { error: String(e.message).slice(0, 300) };
    }
  } else if (final === "HOLD") {
    console.log("PAYMENT: none. Held for human approval - the agent cannot proceed alone.");
  } else {
    console.log("PAYMENT: none. Blocked by the guard - no PayPal call was made.");
  }

  log({ proposal, checks, guardVerdict: guardFinal, aiReview: review, final, paymentMode: mode, payment });
  return final;
}

if (cmd === "capture") {
  const id = args[args.indexOf("capture") + 1];
  if (!id) { console.error("usage: node demo.mjs capture <ORDER_ID>"); process.exit(1); }
  banner();
  const cap = await paypal.captureOrder(id);
  console.log(`Capture for ${id}: ${cap.status}` + (cap.mode === "mock" ? "  [SIMULATED]" : ""));
  process.exit(0);
}

if (cmd === "agent") {
  const goal = args.filter((a) => a !== "agent" && !a.startsWith("--")).join(" ").trim();
  if (!goal) {
    console.error('usage: node demo.mjs agent "<buying goal in plain English>"');
    process.exit(1);
  }
  banner();
  const agentPolicy = new SpendPolicy(config, { fresh });
  await runAgent(goal, agentPolicy);
  console.log(`\nDone. Mode was ${mode.toUpperCase()}. Full log: evidence/demo-log.jsonl`);
  process.exit(0);
}

banner();
const policy = new SpendPolicy(config, { fresh });
const names = cmd === "all" ? Object.keys(SCENARIOS) : [cmd];
for (const n of names) {
  if (!SCENARIOS[n]) { console.error(`unknown scenario: ${n}`); process.exit(1); }
  await runScenario(n, policy);
}
console.log(`\nDone. Mode was ${mode.toUpperCase()}. Full log: evidence/demo-log.jsonl`);
