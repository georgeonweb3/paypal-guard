# Demo video script — target 2:30, hard limit 3:00 (Devpost rule)

Record AFTER a real sandbox run works (george-steps.md step 4), so the video
shows a genuine PayPal sandbox order, not the mock. Terminal font large,
dark theme. Voice: George, plain and direct. Total spoken words ≈ 330.

---

**[0:00–0:15] Hook — face or terminal title card**
"AI agents are getting checkout buttons. Nobody is giving them brakes.
This is the brake. An agent proposes a purchase, my guard checks it, and
only then does PayPal move money."

**[0:15–0:50] The clean purchase — run: `node demo.mjs allow` (sandbox mode)**
"This agent wants a 42-dollar USB hub from a known merchant. Merchant
check: clean. Price check: within 1% of the reference. Quote adds up.
Policy: under my 100-dollar per-transaction cap. ALLOW — and here is a
real PayPal sandbox order being created." [show order ID + status]
"The buyer approves with a sandbox test account, I capture — COMPLETED.
And the spend is written into the daily ledger. 42 of 150 dollars today."

**[0:50–1:25] The blocks — run: `node demo.mjs merchant` then `node demo.mjs offmarket`**
"Same agent, bad merchant — block-listed. BLOCK. No PayPal call is even
made. Now the classic agent failure: the same hub, but quoted at 79
dollars against a 42-dollar reference. 86% off-market. BLOCK. An agent
that cannot be overcharged is an agent you can actually leave running."

**[1:25–1:55] Policy and the human — run: `node demo.mjs overlimit` then `node demo.mjs hold`**
"A 450-dollar GPU hits my per-transaction cap: BLOCK, even though the
merchant and price are fine. And an unknown merchant? HOLD. The agent
cannot clear a counterparty it cannot check, so a human decides. Allow,
hold, block — that is the whole language of the guard."

**[1:55–2:20] The freeze — run: `node demo.mjs freeze`**
"Last one. I freeze the policy — one flag in policy.json — and even the
clean purchase stops. If your agent starts behaving strangely at 3am,
you want this switch."

**[2:20–2:30] Close**
"The checks come from tgp-guard, the spend policy from Aegis, my agent
safety work on-chain. Now they guard PayPal too. Code is public, MIT.
Thank you."

---

## Shot / recording notes

- Record each scenario as its own terminal take; cut, don't re-run live.
- The sandbox order ID and the `COMPLETED` capture must be readable on
  screen — pause 2 seconds on each.
- If the sandbox run is not ready by recording day, the fallback is mock
  mode — but then SAY "simulated payment step" out loud at the hook, and
  the submission text must be downgraded to match (see devpost-listing.md
  honest-status note). Never let mock footage pass as sandbox footage.
- Upload: public YouTube, title "Guarded Agent Checkout — PayPal AI Hackathon".

## Gallery / screenshot list (Devpost image gallery)

1. Terminal: full `all` run overview (six verdicts visible) — the money shot.
2. Terminal close-up: `allow` scenario with sandbox order ID + COMPLETED capture.
3. Terminal close-up: `offmarket` BLOCK line (86% off the reference median).
4. `policy.json` open in an editor — caps and freeze flag visible.
5. PayPal developer dashboard: the sandbox app (credentials BLURRED) — proves the real integration point.
6. PayPal sandbox order details page for the captured test order.
7. Repo tree / README top section.
