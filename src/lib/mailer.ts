import nodemailer from "nodemailer";

// Email via Google Workspace SMTP relay (default) — the server's IP is allow-listed
// in Admin → Apps → Gmail → Routing → SMTP relay, so NO SMTP credentials are needed.
//   SMTP_HOST=smtp-relay.gmail.com  SMTP_PORT=587  SMTP_SECURE=false  (STARTTLS/TLS required)
//   SMTP_FROM="PSR <psr@torama.money>"   CONTACT_TO=psr@torama.money
// To use authenticated Gmail SMTP instead, also set SMTP_USER + SMTP_PASS (app password).
const HOST = process.env.SMTP_HOST || "smtp-relay.gmail.com";
const PORT = Number(process.env.SMTP_PORT || 587);
const SECURE = (process.env.SMTP_SECURE ?? "false") === "true"; // 465=true; relay 587=false (STARTTLS)
const USER = process.env.SMTP_USER || "";
const PASS = process.env.SMTP_PASS || "";
const FROM = process.env.SMTP_FROM || `PSR <${process.env.CONTACT_TO || "psr@torama.money"}>`;
const USE_AUTH = !!(USER && PASS) && (process.env.SMTP_AUTH ?? "true") !== "false";

// Relay needs no creds (IP-allow-listed); auth mode needs USER+PASS. Either way we
// just need a host + a from address to send.
export const mailEnabled = !!(HOST && FROM);
export const CONTACT_TO = process.env.CONTACT_TO || "psr@torama.money";

let transport: nodemailer.Transporter | null = null;
function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: SECURE,
      requireTLS: !SECURE, // enforce STARTTLS on 587 (matches "Require TLS" in the relay config)
      ...(USE_AUTH ? { auth: { user: USER, pass: PASS } } : {}),
    });
  }
  return transport;
}

export async function sendMail(opts: { to: string; subject: string; text: string; replyTo?: string }) {
  if (!mailEnabled) return { ok: false, reason: "mail-not-configured" };
  await getTransport().sendMail({ from: FROM, to: opts.to, subject: opts.subject, text: opts.text, replyTo: opts.replyTo });
  return { ok: true };
}
