# Guarded Agent Checkout

**An AI agent that can pay is an AI agent that can be robbed. This is the guard that stands in front of the money.**

An AI shopping agent proposes a purchase. Before any money moves, every
proposal passes two layers ported from production agent-safety work:

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
node demo.mjs all --fresh     # all six scenarios
node demo.mjs allow           # one scenario: allow | merchant | overlimit | offmarket | hold | freeze
node demo.mjs capture <ID>    # finish a sandbox order after buyer approval
```

Zero dependencies. Node ≥ 20. `--fresh` resets today's spend ledger.

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
  integration, the scenario demo, and all submission materials.
- **Honest stand-ins:** the checks run against local reference data (a demo
  block list, catalogue reference prices) instead of tgp-guard's live paid
  oracle network, so the demo runs offline at $0. The verdict semantics and
  thresholds are the originals; the data source is a local substitute, and it
  is labelled as one in the code.
- **AI tools used:** Muse (Anthropic) assisted with code and docs, under
  the author's direction and review.

## Layout

```
demo.mjs            scenario runner / CLI
policy.json         owner spend policy
src/checks.mjs      merchant, price, quote checks (tgp-guard port)
src/policy.mjs      spend policy engine (Aegis port)
src/paypal.mjs      PayPal Orders v2 sandbox client + labelled mock
evidence/           run logs (JSONL) and the daily spend state
submission-pack/    Devpost drafts, video script, sample output
```

## License

MIT — see `LICENSE`.
