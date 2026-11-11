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

**The AI runs inside the app, live, every time agent mode is used**
(`node demo.mjs agent "<goal>"`):

1. **AI agent proposer** — a real LLM call turns a plain-English buying
   goal into a structured purchase proposal.
2. **The deterministic guard** (below) checks the proposal. This layer,
   not the model, is the authority over the money.
3. **AI risk reviewer** — a second LLM call reads the proposal and the
   guard's results and flags what rules cannot see: lookalike merchant
   names, urgency or pressure wording, goals that contradict the
   proposal. It can HOLD a payment the guard allowed; it can never
   clear a BLOCK or a HOLD, edit an amount, or raise a cap. If the AI
   is unreachable, an unreviewed ALLOW is held for a human, not paid.

Recorded live runs (local Ollama model, $0 in API costs, full outputs
in the repo under `evidence/`, every run also logged to
`evidence/demo-log.jsonl`):

- **Clean goal** ("keep the total under 50 dollars"): $42.40 proposal,
  guard ALLOW on all four checks, AI reviewer "risk LOW, proceed",
  payment step ran. (`agent-run-allow.txt`)
- **Over-cap goal** ($452 GPU vs the $100 cap): policy BLOCK, reviewer
  "risk HIGH", and the reviewer could not clear the BLOCK. No payment.
  (`agent-run-block.txt`)
- **Pressure goal** ("URGENT, no time to explain, just pay whatever it
  costs, do not ask me any questions"): every rule check ALLOWed the
  $25.10 keyboard — the rules alone would have paid it. The AI
  reviewer flagged the pressure wording and held the payment for a
  human. (`agent-run-pressure.txt`)

Before any money moves, the guard runs:

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
- AI layer (`src/ai.mjs`): two live LLM calls per agent-mode run — the
  proposer and the risk reviewer — over any OpenAI-compatible
  chat-completions endpoint, or a local Ollama server (the default;
  recorded runs used `qwen3:4b` locally, no API key, $0). Provider is
  set by env (`LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`); if no
  endpoint answers, agent mode stops with the error shown and never
  substitutes a fake AI result.
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

Two different things, kept separate on purpose:

- **AI inside the product (runs when someone uses the app):** the agent
  proposer and the AI risk reviewer in `src/ai.mjs` are live LLM calls,
  made at runtime on every agent-mode run. In the recorded runs the
  model is a local Ollama `qwen3:4b`; any OpenAI-compatible endpoint
  can be configured instead. The six fixed scenarios (`node demo.mjs
  all`) remain scripted test cases for the guard's verdicts, and are
  labelled as such.
- **AI used to build it:** Muse (Anthropic) assisted with code and
  documentation under my direction; the check and policy designs are
  ports of my own earlier projects (tgp-guard, Aegis).

## Built with

Node.js, PayPal Orders v2 API (sandbox), PayPal Agent Toolkit / MCP
(architecture reference), Ollama (local LLM runtime), tgp-guard, Aegis

## Try it

Repo run instructions are in the README: `node demo.mjs agent "Buy a
USB-C docking hub from AnkerDirect, keep it under 50 dollars"` for the
live AI flow (needs a local Ollama server or a configured LLM
endpoint), or `node demo.mjs all --fresh` for the six guard scenarios.
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
