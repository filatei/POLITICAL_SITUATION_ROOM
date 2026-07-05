// WhatsApp Cloud API rail (Meta). Business-initiated messages REQUIRE an approved
// template — we use one Utility template with a single body variable {{1}} that
// carries the same text we'd send by SMS (agent codes, broadcasts, reminders).
//
//   WHATSAPP_PHONE_NUMBER_ID   the sender's Phone Number ID (from the app's WhatsApp setup)
//   WHATSAPP_ACCESS_TOKEN      permanent System-User token (whatsapp_business_messaging)
//   WHATSAPP_TEMPLATE_NAME     name of the approved 1-variable Utility template
//   WHATSAPP_TEMPLATE_LANG     template language code (default en_US)
//   WHATSAPP_API_VERSION       Graph API version (default v21.0)
//
// Create the template in WhatsApp Manager → Message Templates:
//   Category: Utility · Language: English (US)
//   Body: "{{1}}"   (one variable — no header/footer/buttons needed)
// Links inside the text auto-render as tappable in WhatsApp.

const API_VER = process.env.WHATSAPP_API_VERSION || "v21.0";
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const TEMPLATE = process.env.WHATSAPP_TEMPLATE_NAME || "";
const LANG = process.env.WHATSAPP_TEMPLATE_LANG || "en_US";

export const whatsappEnabled = !!(PHONE_ID && TOKEN && TEMPLATE);

// WhatsApp wants the number in international format, digits only (no '+').
export function toWaNumber(phone: string | null | undefined): string | null {
  let p = (phone || "").replace(/[^\d+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  else if (p.startsWith("0")) p = "234" + p.slice(1);
  else if (p && !p.startsWith("234")) p = p.length <= 10 ? "234" + p : p;
  return p.length >= 11 ? p : null;
}

export type WaResult = { requested: number; sent: number; skipped: number; failed: number; errors: string[] };

async function post(to: string, message: string, withBody: boolean) {
  return fetch(`https://graph.facebook.com/${API_VER}/${PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: TEMPLATE,
        language: { code: LANG },
        // Templates with a {{1}} body variable need the parameter; templates with
        // no variables (e.g. hello_world) reject it — we retry without on mismatch.
        ...(withBody ? { components: [{ type: "body", parameters: [{ type: "text", text: message }] }] } : {}),
      },
    }),
  });
}

async function sendOne(to: string, message: string): Promise<void> {
  let res = await post(to, message, true);
  if (!res.ok) {
    const txt = await res.text();
    // 132000 / "number of parameters" ⇒ template has no variables → retry bare.
    if (/132000|number of parameters|does not match|no variable/i.test(txt)) {
      res = await post(to, message, false);
      if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 220)}`);
      return;
    }
    throw new Error(`WhatsApp ${res.status}: ${txt.slice(0, 220)}`);
  }
}

// Send the same text to many numbers via the utility template. WhatsApp has no
// bulk endpoint, so we fan out (bounded) and collect per-number outcomes.
export async function sendWhatsAppBulk(phones: (string | null | undefined)[], message: string): Promise<WaResult> {
  const valid = Array.from(new Set(phones.map(toWaNumber).filter((n): n is string => !!n)));
  const result: WaResult = { requested: phones.length, sent: 0, skipped: phones.length - valid.length, failed: 0, errors: [] };
  if (!whatsappEnabled) { result.errors.push("WhatsApp not configured (WHATSAPP_* env missing)."); result.failed = valid.length; return result; }
  for (const n of valid) {
    try { await sendOne(n, message); result.sent += 1; }
    catch (e: any) { result.failed += 1; if (result.errors.length < 3) result.errors.push(String(e?.message || e).slice(0, 220)); }
  }
  return result;
}
