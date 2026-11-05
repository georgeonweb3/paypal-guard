// PayPal payment step.
//
// Integration route: PayPal Orders v2 REST API on the SANDBOX host. This is
// the same API that PayPal's Agent Toolkit (@paypal/agent-toolkit) and MCP
// server (@paypal/mcp, remote host mcp.sandbox.paypal.com) expose to agents
// as create_order / capture_order tools - the toolkit wraps these exact
// endpoints. A CLI demo has no MCP host, so it calls the wrapped API
// directly: zero dependencies, identical payment semantics.
//
//   OAuth:  POST https://api-m.sandbox.paypal.com/v1/oauth2/token
//           (client credentials grant, Basic auth with client id + secret)
//   Create: POST https://api-m.sandbox.paypal.com/v2/checkout/orders
//   Capture: POST https://api-m.sandbox.paypal.com/v2/checkout/orders/{id}/capture
//
// The base URL is HARDCODED to the sandbox host. There is no live mode in
// this codebase on purpose: a hackathon demo should not be one env var away
// from real money.
//
// Credentials come from the environment only:
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET  (sandbox app, developer.paypal.com)
// When they are absent the client runs in MOCK MODE and says so loudly in
// every line of output. Mock results are simulated locally; they are never
// PayPal responses and must never be described as such.

const BASE = "https://api-m.sandbox.paypal.com";

export function paypalMode() {
  return process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET
    ? "sandbox"
    : "mock";
}

class MockPayPal {
  constructor() {
    this.n = 0;
  }
  async createOrder({ amount, currency, description }) {
    this.n += 1;
    const id = `MOCK-ORDER-${String(this.n).padStart(4, "0")}`;
    return {
      mode: "mock",
      id,
      status: "CREATED (SIMULATED - no PayPal call was made)",
      amount,
      currency,
      description,
      approveUrl: null,
    };
  }
  async captureOrder(id) {
    return {
      mode: "mock",
      id,
      status: "COMPLETED (SIMULATED - no PayPal call was made)",
    };
  }
}

class SandboxPayPal {
  async #token() {
    const basic = Buffer.from(
      `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString("base64");
    const res = await fetch(`${BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`PayPal OAuth failed: HTTP ${res.status} ${await res.text()}`);
    return (await res.json()).access_token;
  }

  async createOrder({ amount, currency, description }) {
    const token = await this.#token();
    const res = await fetch(`${BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `paypal-guard-${Date.now()}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        payment_source: {
          paypal: {
            experience_context: {
              shipping_preference: "NO_SHIPPING",
              user_action: "PAY_NOW",
              return_url: "https://example.com/return",
              cancel_url: "https://example.com/cancel",
            },
          },
        },
        purchase_units: [
          {
            description,
            amount: { currency_code: currency, value: amount.toFixed(2) },
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`PayPal create order failed: HTTP ${res.status} ${await res.text()}`);
    const order = await res.json();
    const approve = (order.links || []).find((l) => l.rel === "payer-action" || l.rel === "approve");
    return {
      mode: "sandbox",
      id: order.id,
      status: order.status,
      amount,
      currency,
      description,
      approveUrl: approve ? approve.href : null,
    };
  }

  async captureOrder(id) {
    const token = await this.#token();
    const res = await fetch(`${BASE}/v2/checkout/orders/${id}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `paypal-guard-capture-${id}`,
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // The common sandbox case: the buyer has not approved the order yet, so
      // PayPal refuses capture. Report PayPal's real answer, do not fake one.
      return {
        mode: "sandbox",
        id,
        status: `CAPTURE NOT COMPLETED - PayPal said HTTP ${res.status} (${body?.details?.[0]?.issue || body?.name || "see approve step"})`,
        raw: body,
      };
    }
    const capture = body?.purchase_units?.[0]?.payments?.captures?.[0];
    return { mode: "sandbox", id, status: capture?.status || body.status, captureId: capture?.id };
  }
}

export function createPayPalClient() {
  return paypalMode() === "sandbox" ? new SandboxPayPal() : new MockPayPal();
}
