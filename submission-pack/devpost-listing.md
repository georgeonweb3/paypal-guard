# Devpost listing — DRAFT (not submitted)

> Paste-ready drafts for the PayPal AI Hackathon Devpost form.
> Everything marked [SANDBOX] must be true when submitted: only submit the
> sandbox wording once a real sandbox run has been recorded (see
> george-steps.md). Until then the honest status is the mock note at the end.

## Project name

Guarded Agent Checkout

## Tagline

An AI agent that can pay is an AI agent that can be robbed — this is the guard in front of the money: pre-flight checks and hard spend limits before any PayPal payment moves.

## Inspiration

AI agents are getting wallets and checkout buttons faster than they are
getting brakes. A prompt-injected or simply confused agent can overpay,
pay the wrong merchant, or drain a budget in minutes. I already build the
brakes on-chain (Aegis, spend control for agents on Base) and in front of
agent data (tgp-guard, pre-flight checks for autonomous agents). This
project puts the same guard in front of the most mainstream payment rail
there is: PayPal.

## What it does

An AI agent proposes a purchase. Before any money moves, the guard runs:

- **Merchant sanity** — known merchant, or block-listed?
- **Price sanity** — quoted price vs a reference median; more than 1% off is an off-market BLOCK.
- **Quote consistency** — the total must equal unit price × quantity + shipping.
- **Spend policy** — per-transaction cap, daily limit, owner freeze switch.

Verdicts: **ALLOW** (the PayPal sandbox payment executes), **HOLD** (a human
must approve), **BLOCK** (no PayPal call is ever made). The demo ships six
scenarios: a clean purchase, a block-listed merchant, an over-limit amount,
an off-market price, an unknown merchant (HOLD), and the freeze switch.

## How I built it

- Node.js (zero runtime dependencies), one CLI entry point (`demo.mjs`).
- Checks ported from tgp-guard: same ALLOW / HOLD / BLOCK semantics and the
  same thresholds (sources-agree 0.5%, disagreement BLOCK 2%, off-market 1%).
  For a $0, offline demo they read local reference data — a demo block list
  and catalogue reference prices — instead of tgp-guard's live paid oracle
  network. That substitution is labelled in the code and here.
- Policy engine ported from Aegis's on-chain model: per-tx cap, daily limit
  with a persistent ledger that only records completed payments, and freeze.
- PayPal Orders v2 (sandbox): OAuth client-credentials → create order →
  buyer approval → capture, via `api-m.sandbox.paypal.com` — the API the
  PayPal Agent Toolkit and MCP server wrap for agents. The sandbox host is
  hardcoded; there is no live mode.
- Without credentials the client runs a clearly labelled MOCK mode so anyone
  can run the guard logic; simulated output is watermarked SIMULATED in
  every line and is never presented as a PayPal result.

## Built during the hackathon window vs pre-existing

- **Pre-existing:** tgp-guard (check design, verdict logic) and Aegis (spend
  policy model), both public and built before this hackathon window.
- **Built during the window (1 Oct – 12 Nov 2026), for this entry:** the
  checkout flow itself, the ports of the checks and policy, the PayPal
  Orders v2 sandbox integration, the six-scenario demo, and these materials.
  The significant update is the combination: neither earlier project could
  gate a PayPal payment; this one exists specifically to do that.

## AI tools used (required disclosure)

Muse (Anthropic) was used as a coding and documentation assistant under my
direction; the check and policy designs are ports of my own earlier
projects (tgp-guard, Aegis). The demo's "agent" proposals are scripted
scenarios, not a live LLM — the guard is the product, and it is designed to
sit in front of any agent, scripted or LLM-driven.

## Built with

Node.js, PayPal Orders v2 API (sandbox), PayPal Agent Toolkit / MCP
(architecture reference), tgp-guard, Aegis

## Try it

Repo run instructions are in the README: `node demo.mjs all --fresh`.
No install, no dependencies. Add sandbox credentials (`.env`, see
`.env.example`) to run the identical flow against the real PayPal sandbox.

## Sandbox run — verified (updated 5 Nov 2026)

The full sandbox happy path is DONE and recorded: on 5 Nov 2026 the demo
ran with real sandbox credentials, the guard returned ALLOW, a real
sandbox order was created, a sandbox buyer approved it, and the capture
returned **COMPLETED** (order 48492101JX0814434, $42.00, sandbox test
money). Two findings from that run are documented in the README: the
merchant account's country must be able to receive payments (a send-only
country merchant is seller-restricted), and the Pay Now experience flow
completes where the default review flow hung. A bank-funded approval
captured PENDING; the card-funded approval captured COMPLETED.
