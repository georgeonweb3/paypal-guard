// Guarded Agent Checkout - demo CLI.
//
// An AI shopping agent proposes a purchase. Before any money moves, the
// guard runs tgp-guard-style pre-flight checks (merchant sanity, price
// sanity, quote consistency) and the Aegis-style spend policy (per-tx cap,
// daily limit, freeze). Only an ALLOW reaches the PayPal payment step.
//
// Usage:
//   node demo.mjs all [--fresh]        run every scenario
//   node demo.mjs allow|merchant|overlimit|offmarket|hold|freeze
//   node demo.mjs capture <ORDER_ID>   finish a sandbox order after buyer approval
//
// Payment mode: real PayPal SANDBOX when PAYPAL_CLIENT_ID and
// PAYPAL_CLIENT_SECRET are set in the environment; otherwise a clearly
// labelled MOCK mode. See src/paypal.mjs.

import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { merchantCheck, priceCheck, quoteCheck, worst } from "./src/checks.mjs";
import { SpendPolicy } from "./src/policy.mjs";
import { createPayPalClient, paypalMode } from "./src/paypal.mjs";

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

// Each intent is what the (simulated) AI agent asks to buy. In a full build
// this proposal comes from an LLM agent; the guard does not care where the
// proposal came from, which is the point.
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

async function runScenario(name, policy) {
  const sc = SCENARIOS[name];
  const it = sc.intent;
  console.log(`\n--- SCENARIO: ${name} - ${sc.title} ---`);
  console.log(
    `AGENT proposes: buy ${it.qty} x "${it.item}" from ${it.merchant} for $${it.total.toFixed(2)}`
  );
  const checks = [
    merchantCheck(it.merchant),
    priceCheck({ item: it.item, quoted: it.unitPrice, reference: CATALOG[it.item] }),
    quoteCheck(it),
    (sc.frozen ? new SpendPolicy({ ...config, frozen: true }, { fresh: true }) : policy).check(it.total),
  ];
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

if (cmd === "capture") {
  const id = args[args.indexOf("capture") + 1];
  if (!id) { console.error("usage: node demo.mjs capture <ORDER_ID>"); process.exit(1); }
  banner();
  const cap = await paypal.captureOrder(id);
  console.log(`Capture for ${id}: ${cap.status}` + (cap.mode === "mock" ? "  [SIMULATED]" : ""));
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
