// SMS delivery — provider-agnostic, Nigeria-first.
//
// RECOMMENDED: Africa's Talking — transparent pay-as-you-go (no prepaid wallet
// surprises), a FREE sandbox for testing, and it works WITHOUT a pre-registered
// sender ID (uses a shared shortcode). Twilio is supported as a robust global
// fallback. Termii is still selectable but NOT recommended (opaque wallet
// charges even before sender-ID approval).
//
//   SMS_PROVIDER   africastalking | twilio | termii | log   (default: log)
//   SMS_API_KEY    provider API key (Africa's Talking / Termii)
//   SMS_SENDER     OPTIONAL sender ID. Leave UNSET to use the provider's shared
//                  shortcode — safest, needs no approval. Only set once your
//                  alphanumeric sender ID is approved.
//   SMS_USERNAME   Africa's Talking username ("sandbox" for free testing)
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM     (Twilio only)
//
// "log" just prints to server logs so the app is usable without an SMS account.

const PROVIDER = (process.env.SMS_PROVIDER || "log").toLowerCase();
const API_KEY = process.env.SMS_API_KEY || process.env.TERMII_API_KEY || "";
const SENDER = process.env.SMS_SENDER || ""; // unset = provider's shared shortcode (no approval needed)
const AT_USERNAME = process.env.SMS_USERNAME || "";

// True when a real provider is configured (so the UI can warn if not).
export const smsEnabled =
  (PROVIDER === "termii" || PROVIDER === "africastalking") ? !!API_KEY
  : PROVIDER === "twilio" ? !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM)
  : PROVIDER === "log";

// Normalise a Nigerian number to E.164 without '+': 0803… -> 234803…
export function normalizeMsisdn(phone: string | null | undefined): string | null {
  let p = (phone || "").replace(/[^\d+]/g, "");
  if (!p) return null;
  if (p.startsWith("+")) p = p.slice(1);
  else if (p.startsWith("0")) p = "234" + p.slice(1);
  else if (!p.startsWith("234")) p = p.length <= 10 ? "234" + p : p;
  return p.length >= 11 ? p : null;
}

// Send `message` to one or more already-normalised numbers via the chosen provider.
async function sendChunk(numbers: string[], message: string): Promise<void> {
  if (PROVIDER === "termii") {
    const res = await fetch("https://api.ng.termii.com/api/sms/send/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: numbers, from: SENDER || "N-Alert", sms: message, type: "plain", channel: "generic", api_key: API_KEY }),
    });
    if (!res.ok) throw new Error(`Termii ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }
  if (PROVIDER === "africastalking") {
    const body = new URLSearchParams({ username: AT_USERNAME, to: numbers.map((n) => "+" + n).join(","), message, ...(SENDER ? { from: SENDER } : {}) });
    const res = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", apiKey: API_KEY },
      body,
    });
    if (!res.ok) throw new Error(`AfricasTalking ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }
  if (PROVIDER === "twilio") {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    for (const n of numbers) {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: "+" + n, From: process.env.TWILIO_FROM!, Body: message }),
      });
      if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return;
  }
  console.log(`[SMS:log] to=${numbers.join(",")} :: ${message}`);
}

// OTP + single-recipient helper (kept for existing callers).
export async function sendSms(to: string, message: string): Promise<void> {
  const n = normalizeMsisdn(to) || to.replace(/[^\d]/g, "");
  await sendChunk([n], message);
}

export type SmsResult = { requested: number; sent: number; skipped: number; failed: number; errors: string[] };

// One message to many numbers. Invalid numbers are skipped (not failed). Chunked
// to stay within provider per-request limits.
export async function sendBulkSms(phones: (string | null | undefined)[], message: string): Promise<SmsResult> {
  const valid = Array.from(new Set(phones.map(normalizeMsisdn).filter((n): n is string => !!n)));
  const result: SmsResult = { requested: phones.length, sent: 0, skipped: phones.length - valid.length, failed: 0, errors: [] };
  const CHUNK = 100;
  for (let i = 0; i < valid.length; i += CHUNK) {
    const batch = valid.slice(i, i + CHUNK);
    try { await sendChunk(batch, message); result.sent += batch.length; }
    catch (e: any) { result.failed += batch.length; result.errors.push(String(e?.message || e).slice(0, 300)); }
  }
  return result;
}
