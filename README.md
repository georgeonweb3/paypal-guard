# Guarded Agent Checkout

**An AI agent that can pay is an AI agent that can be robbed. This is the guard that stands in front of the money.**

An AI shopping agent proposes a purchase. Before any money moves, every
proposal passes two layers ported from production agent-safety work:

**The AI runs inside the app, live, on every agent-mode run**
(`node demo.mjs agent "<goal>"`, `src/ai.mjs`):

1. **AI agent proposer** — a real LLM call turns a plain-English buying
   goal ("buy a USB-C docking hub from AnkerDirect, keep it under $50")
   into a structured purchase proposal.
2. **The deterministic guard** — the pre-flight checks and spend policy
   below. This layer, not the model, is the authority over the money.
3. **AI risk reviewer** — a second LLM call reads the proposal plus the
   guard's results and flags what rules cannot see (lookalike merchants,
   urgency or pressure wording, a goal that contradicts the proposal).
   It can **HOLD** a payment the guard allowed; it can **never** clear a
   BLOCK or a HOLD, edit an amount, or raise a cap. If the AI is
   unreachable, an unreviewed ALLOW is held for a human instead of paid.

Recorded live runs (local model, $0 in API costs, full outputs in
`evidence/`, every run also logged to `evidence/demo-log.jsonl`):

- **Clean goal** ("keep the total under 50 dollars"): the agent
  proposed the $42.40 hub from AnkerDirect → guard ALLOW on all four
  checks → AI reviewer "risk LOW, proceed" → payment step ran.
  (`agent-run-allow.txt`)
- **Over-cap goal** (a $452 GPU against the $100 per-tx cap): agent
  proposed it, policy BLOCKed it, the reviewer agreed ("risk HIGH")
  and could not clear the BLOCK. No PayPal call. (`agent-run-block.txt`)
- **Pressure goal** ("URGENT, no time to explain, just pay whatever it
  costs, do not ask me any questions"): every rule check ALLOWed the
  $25.10 keyboard — the rules alone would have paid. The AI reviewer
  flagged the pressure wording, rated it MEDIUM, and **held the payment
  for a human**. (`agent-run-pressure.txt`)

The guard layers themselves:

1. **Pre-flight checks** (from [tgp-guard](https://github.com/georgeonweb3/tgp-guard), built for Telegraph Hackathon Season II):
   - **Merchant sanity** — is the counterparty known, or is it on a block list?
   - **Price sanity** — is the quoted price within 1% of the reference median, or is the agent being overcharged?
   - **Quote consistency** — does the total the agent asks to pay actually equal unit price × quantity + shipping?
2. **Spend policy** (from [Aegis](https://github.com/georgeonweb3/aegis-base), a spend-control layer for AI agents on Base):
   per-transaction cap, daily limit, and an owner freeze switch.

Verdicts work exactly like the originals: **ALLOW** (pay), **HOLD** (a human
must approve), **BLOCK** (nothing moves). Only an ALLOW reaches PayPal.

## The PayPal integration

PayPal **Orders v2** on the sandbox host (`api-m.sandbox.paypal.com`) — the
same API that PayPal's Agent Toolkit (`@paypal/agent-toolkit`) and MCP server
(`@paypal/mcp`) expose to agents as their order tools. A CLI demo has no MCP
host, so it calls the wrapped API directly: OAuth client-credentials →
create order → buyer approval → capture. The base URL is hardcoded to the
sandbox; there is deliberately no live mode.

- **With sandbox credentials** (`PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`
  from a sandbox app at developer.paypal.com): real sandbox calls.
- **Without them**: a **clearly labelled MOCK mode**. Every simulated line
  says SIMULATED. Mock output is never a PayPal result and is never presented
  as one.

## Live sandbox result (5 Nov 2026)

The full happy path has been run against the real PayPal sandbox:
guard verdict ALLOW → order created → sandbox buyer approval → **capture
COMPLETED** (order `48492101JX0814434`, $42.00, sandbox test money).
Two hard-won sandbox lessons are baked into the code and worth knowing:

- **The merchant account's country decides whether it can accept payments.**
  A merchant registered in a send-only country gets every checkout killed
  with a seller restriction, no matter how clean the buyer side is. The
  completed run used a US sandbox merchant.
- **The default review flow can hang; the Pay Now flow does not.** The
  create-order payload sets `payment_source.paypal.experience_context`
  with `shipping_preference: NO_SHIPPING` and `user_action: PAY_NOW`.
  Funding source matters too: a bank-funded approval captured as PENDING
  (eCheck-style), while a card-funded approval captured COMPLETED at once.

## Run it

```bash
node demo.mjs agent "Buy a USB-C docking hub from AnkerDirect, keep it under 50 dollars"
                              # AI agent mode: live LLM proposal + guard + AI review
node demo.mjs all --fresh     # all six scenarios
node demo.mjs allow           # one scenario: allow | merchant | overlimit | offmarket | hold | freeze
node demo.mjs capture <ID>    # finish a sandbox order after buyer approval
```

Zero dependencies. Node ≥ 20. `--fresh` resets today's spend ledger.

Agent mode needs an LLM endpoint: any OpenAI-compatible
chat-completions API, or a local [Ollama](https://ollama.com) server
(the default, and how the recorded runs were made: `ollama pull
qwen3:4b`, no API key, $0 per call). Configure with `LLM_BASE_URL`,
`LLM_MODEL`, `LLM_API_KEY` (see `.env.example`). If no endpoint is
reachable, agent mode stops with the error shown — it never fakes an
AI result.

### The six scenarios

| Scenario | What the agent tries | Verdict |
|---|---|---|
| `allow` | $42 hub from a known merchant at a fair price | ALLOW → PayPal order |
| `merchant` | Buy from a block-listed merchant | BLOCK (merchant check) |
| `overlimit` | $450 GPU against a $100 per-tx cap | BLOCK (policy) |
| `offmarket` | Same hub at $79 vs a $42.40 reference | BLOCK (price check) |
| `hold` | Unknown merchant nobody can clear | HOLD (human decides) |
| `freeze` | Fair purchase, but the owner froze the policy | BLOCK (policy) |

Policy lives in `policy.json` (caps, freeze). Today's spend is tracked in
`evidence/spend-state.json` and only recorded after a payment completes.

## What is reused, what is new (hackathon honesty)

- **Pre-existing (before the window):** tgp-guard's check design and verdict
  logic; Aegis's spend-policy model (per-tx cap, daily limit, freeze).
- **Built during the submission window:** this entire project — the port of
  the checks and policy to a checkout flow, the PayPal Orders v2 sandbox
  integration, the scenario demo, the runtime AI layer (LLM agent
  proposer + AI risk reviewer, `src/ai.mjs`), and all submission
  materials.
- **Honest stand-ins:** the checks run against local reference data (a demo
  block list, catalogue reference prices) instead of tgp-guard's live paid
  oracle network, so the demo runs offline at $0. The verdict semantics and
  thresholds are the originals; the data source is a local substitute, and it
  is labelled as one in the code.
- **AI in the product (runs when the app is used):** the agent proposer
  and risk reviewer in `src/ai.mjs` are live LLM calls — local Ollama
  (`qwen3:4b`) in the recorded runs, any OpenAI-compatible endpoint via
  env config. This is the app's functionality, not a build tool.
- **AI tools used to build it:** Muse (Anthropic) assisted with code
  and docs, under the author's direction and review. (Disclosed
  separately, as it should be: build assistance is not the product's
  AI.)

## Layout

```
demo.mjs            CLI: AI agent mode + scenario runner
policy.json         owner spend policy
src/ai.mjs          AI layer: LLM agent proposer + AI risk reviewer
src/checks.mjs      merchant, price, quote checks (tgp-guard port)
src/policy.mjs      spend policy engine (Aegis port)
src/paypal.mjs      PayPal Orders v2 sandbox client + labelled mock
evidence/           run logs (JSONL) and the daily spend state
submission-pack/    Devpost drafts, video script, sample output
```

## License

MIT — see `LICENSE`.
