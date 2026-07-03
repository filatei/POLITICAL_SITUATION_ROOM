import crypto from "crypto";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";
// Live SQUAD_SECRET_KEY takes precedence; else fall back to the sandbox secret.
const SQUAD_LIVE = process.env.SQUAD_SECRET_KEY || "";
const SQUAD_SANDBOX = process.env.SQUAD_SANDBOX_SECRET || "";
const SQUAD_SECRET = SQUAD_LIVE || SQUAD_SANDBOX;
// Squad base auto-selects: live if a live key is set, sandbox if only sandbox key.
const SQUAD_BASE = process.env.SQUAD_BASE_URL || (SQUAD_LIVE ? "https://api-d.squadco.com" : "https://sandbox-api-d.squadco.com");
const SQUAD_MERCHANT_ID = process.env.SQUAD_MERCHANT_ID || "";

export const paystackEnabled = !!PAYSTACK_SECRET;
export const squadEnabled = !!SQUAD_SECRET;

// Reference prefix namespaces this outlet so a shared merchant's single webhook
// (a central hub) can route events to the right app by prefix.
export const REF_PREFIX = process.env.BILLING_REF_PREFIX || "psr";

type InitOpts = { email: string; amountKobo: number; reference: string; callbackUrl: string; metadata?: any };

// ---- Paystack ----
export async function paystackInit(o: InitOpts) {
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: o.email, amount: o.amountKobo, reference: o.reference, callback_url: o.callbackUrl, metadata: o.metadata }),
  });
  const j = await res.json();
  if (!j.status) throw new Error(j.message || "Paystack init failed");
  return { url: j.data.authorization_url as string, reference: j.data.reference as string };
}

export async function paystackVerify(reference: string) {
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
  });
  const j = await res.json();
  return { ok: j?.data?.status === "success", amount: Number(j?.data?.amount) || 0, raw: j?.data };
}

export function paystackValidSignature(rawBody: string, signature: string | null) {
  if (!signature || !PAYSTACK_SECRET) return false;
  const hash = crypto.createHmac("sha512", PAYSTACK_SECRET).update(rawBody).digest("hex");
  return hash === signature;
}

// ---- Squad (GTCO) ----
export async function squadInit(o: InitOpts) {
  const res = await fetch(`${SQUAD_BASE}/transaction/initiate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SQUAD_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: o.email, amount: o.amountKobo, currency: "NGN",
      transaction_ref: o.reference, callback_url: o.callbackUrl, metadata: o.metadata,
      ...(SQUAD_MERCHANT_ID ? { merchant_id: SQUAD_MERCHANT_ID } : {}),
    }),
  });
  const j = await res.json();
  const url = j?.data?.checkout_url;
  if (!url) throw new Error(j?.message || "Squad init failed");
  return { url: url as string, reference: (j?.data?.transaction_ref as string) || o.reference };
}

export async function squadVerify(reference: string) {
  const res = await fetch(`${SQUAD_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${SQUAD_SECRET}` },
  });
  const j = await res.json();
  const d = j?.data || {};
  const status = String(d.transaction_status || d.status || "").toLowerCase();
  return { ok: status === "success", amount: Number(d.transaction_amount || d.amount) || 0, raw: d };
}

export function squadValidSignature(rawBody: string, signature: string | null) {
  if (!signature || !SQUAD_SECRET) return false;
  const hash = crypto.createHmac("sha512", SQUAD_SECRET).update(rawBody).digest("hex");
  return hash.toUpperCase() === signature.toUpperCase();
}
