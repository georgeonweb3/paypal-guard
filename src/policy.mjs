// Spend policy, ported from Aegis (spend-control layer for AI agents on Base).
//
// On-chain Aegis enforces this in a contract: per-transaction cap, daily
// limit, instant freeze. This is the same policy shape in local form, sitting
// in front of a PayPal payment instead of an on-chain spend.
//
// State: today's spend is kept in evidence/spend-state.json so the daily
// limit means something across runs. Delete that file (or run with --fresh)
// to reset the day. Spend is only recorded AFTER a payment executes - a
// blocked or held purchase never consumes budget.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const STATE_FILE = new URL("../evidence/spend-state.json", import.meta.url).pathname;

export class SpendPolicy {
  constructor(config, { fresh = false } = {}) {
    this.perTxCap = config.perTxCapUSD;
    this.dailyLimit = config.dailyLimitUSD;
    this.frozen = Boolean(config.frozen);
    this.state = { day: today(), spent: 0, payments: [] };
    if (!fresh && existsSync(STATE_FILE)) {
      try {
        const saved = JSON.parse(readFileSync(STATE_FILE, "utf8"));
        if (saved.day === today()) this.state = saved;
      } catch {
        /* corrupt state file: start the day over rather than crash */
      }
    }
  }

  // Aegis semantics: frozen -> nothing moves; over per-tx cap -> BLOCK;
  // over remaining daily budget -> BLOCK; otherwise ALLOW.
  check(amount) {
    if (this.frozen) {
      return {
        check: "policy",
        verdict: "BLOCK",
        reason: `policy is FROZEN by the owner - no agent payments until unfrozen`,
      };
    }
    if (amount > this.perTxCap) {
      return {
        check: "policy",
        verdict: "BLOCK",
        reason: `${amount.toFixed(2)} exceeds the per-transaction cap of ${this.perTxCap.toFixed(2)}`,
      };
    }
    const remaining = this.dailyLimit - this.state.spent;
    if (amount > remaining) {
      return {
        check: "policy",
        verdict: "BLOCK",
        reason: `${amount.toFixed(2)} exceeds today's remaining budget: ${remaining.toFixed(2)} of ${this.dailyLimit.toFixed(2)} daily limit left (${this.state.spent.toFixed(2)} already spent)`,
      };
    }
    return {
      check: "policy",
      verdict: "ALLOW",
      reason: `within policy: per-tx cap ${this.perTxCap.toFixed(2)}, daily ${this.state.spent.toFixed(2)} + ${amount.toFixed(2)} <= ${this.dailyLimit.toFixed(2)}`,
    };
  }

  record(amount, ref) {
    this.state.spent += amount;
    this.state.payments.push({ ts: new Date().toISOString(), amount, ref });
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  get spentToday() {
    return this.state.spent;
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
