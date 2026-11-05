// Pre-flight checks, adapted from tgp-guard (Telegraph Hackathon Season II).
//
// tgp-guard's originals ask paid oracle/sanctions "miners" over the Telegraph
// devnode and take a quorum verdict. This port keeps the same verdict logic
// (ALLOW / HOLD / BLOCK, same thresholds) but runs against local reference
// data so the demo works offline and costs $0. The check *semantics* are the
// reuse; the data source is a local stand-in, and the submission says so.
//
// Thresholds carried over from tgp-guard/guard.mjs:
//   ALLOW_PCT = 0.5 (sources agree), BLOCK_PCT = 2 (sources disagree),
//   OFFMARKET_PCT = 1 (quoted price too far off the reference median).

export const ALLOW_PCT = 0.5;
export const BLOCK_PCT = 2;
export const OFFMARKET_PCT = 1;

// --- Merchant / counterparty sanity (port of tgp-guard/screen.mjs) ---------
// screen.mjs verdicts: listed -> BLOCK; a list unavailable -> HOLD;
// no match anywhere -> ALLOW. Here the "lists" are local demo data.
const BLOCKED_MERCHANTS = [
  { name: "Shadow Imports Ltd", list: "demo sanctions list", note: "exact name match" },
  { name: "QuickCryptoDeals", list: "demo fraud list", note: "chargeback fraud reports" },
];

const KNOWN_MERCHANTS = ["AnkerDirect", "BaseMart", "Lagos Gadgets Hub"];

export function merchantCheck(merchant) {
  const hit = BLOCKED_MERCHANTS.find(
    (m) => m.name.toLowerCase() === String(merchant).toLowerCase()
  );
  if (hit) {
    return {
      check: "merchant",
      verdict: "BLOCK",
      reason: `"${merchant}" is listed on the ${hit.list} (${hit.note})`,
    };
  }
  if (!KNOWN_MERCHANTS.some((m) => m.toLowerCase() === String(merchant).toLowerCase())) {
    // Mirrors screen.mjs HOLD: we cannot clear a counterparty we cannot check.
    return {
      check: "merchant",
      verdict: "HOLD",
      reason: `"${merchant}" is not a known merchant and cannot be cleared - a human must approve`,
    };
  }
  return {
    check: "merchant",
    verdict: "ALLOW",
    reason: `"${merchant}" is a known merchant, no list match`,
  };
}

// --- Price sanity (port of tgp-guard/guard.mjs) -----------------------------
// guard.mjs takes the median of 3 independent price sources, BLOCKs when the
// sources disagree by >2%, and BLOCKs when the quoted price is >1% off the
// median ("off-market quote"). Here the 3 "sources" are deterministic local
// reference feeds derived from the catalogue reference price, so runs are
// reproducible offline. Same math, same thresholds.
export function priceCheck({ item, quoted, reference }) {
  const sources = [
    { name: "RefFeed A", price: reference * 1.0 },
    { name: "RefFeed B", price: reference * 1.002 },
    { name: "RefFeed C", price: reference * 0.998 },
  ];
  const ps = sources.map((s) => s.price).sort((a, b) => a - b);
  const med = ps[1];
  const spread = ((ps.at(-1) - ps[0]) / med) * 100;
  const lines = sources.map((s) => `${s.name} ${s.price.toFixed(2)}`);
  if (spread > BLOCK_PCT) {
    return {
      check: "price",
      verdict: "BLOCK",
      reason: `reference sources disagree by ${spread.toFixed(2)}% (${lines.join(", ")})`,
      median: med,
    };
  }
  const dev = (Math.abs(quoted - med) / med) * 100;
  if (dev > OFFMARKET_PCT) {
    return {
      check: "price",
      verdict: "BLOCK",
      reason: `quoted ${quoted.toFixed(2)} for "${item}" is ${dev.toFixed(2)}% off the reference median ${med.toFixed(2)} - off-market quote`,
      median: med,
    };
  }
  return {
    check: "price",
    verdict: "ALLOW",
    reason: `quoted ${quoted.toFixed(2)} within ${dev.toFixed(2)}% of reference median ${med.toFixed(2)} (sources agree within ${spread.toFixed(2)}%)`,
    median: med,
  };
}

// --- Quote consistency ------------------------------------------------------
// The total the agent asks to pay must equal unit price x qty + shipping.
// A mismatch is how "the page said $42, the charge is $420" attacks show up.
export function quoteCheck({ unitPrice, qty, shipping, total }) {
  const expected = unitPrice * qty + shipping;
  if (Math.abs(expected - total) > 0.005) {
    return {
      check: "quote",
      verdict: "BLOCK",
      reason: `quote inconsistent: ${unitPrice.toFixed(2)} x ${qty} + ${shipping.toFixed(2)} shipping = ${expected.toFixed(2)}, but the agent asked to pay ${total.toFixed(2)}`,
    };
  }
  return {
    check: "quote",
    verdict: "ALLOW",
    reason: `quote consistent: total ${total.toFixed(2)} = ${unitPrice.toFixed(2)} x ${qty} + ${shipping.toFixed(2)} shipping`,
  };
}

export const RANK = { ALLOW: 0, HOLD: 1, BLOCK: 2 };
export const worst = (verdicts) =>
  verdicts.reduce((m, v) => (RANK[v] > RANK[m] ? v : m), "ALLOW");
