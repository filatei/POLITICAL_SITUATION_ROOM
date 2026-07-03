import nodemailer from "nodemailer";

// SMTP via Google Workspace (Gmail). Set:
//   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_SECURE=true
//   SMTP_USER=psr@torama.money  SMTP_PASS=<app password>
//   SMTP_FROM="Situation Room <psr@torama.money>"
//   CONTACT_TO=psr@torama.money
const HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const PORT = Number(process.env.SMTP_PORT || 465);
const SECURE = (process.env.SMTP_SECURE ?? "true") !== "false";
const USER = process.env.SMTP_USER || "";
const PASS = process.env.SMTP_PASS || "";
const FROM = process.env.SMTP_FROM || (USER ? `Situation Room <${USER}>` : "");

export const mailEnabled = !!(USER && PASS);
export const CONTACT_TO = process.env.CONTACT_TO || "psr@torama.money";

let transport: nodemailer.Transporter | null = null;
function getTransport() {
  if (!transport) transport = nodemailer.createTransport({ host: HOST, port: PORT, secure: SECURE, auth: { user: USER, pass: PASS } });
  return transport;
}

export async function sendMail(opts: { to: string; subject: string; text: string; replyTo?: string }) {
  if (!mailEnabled) return { ok: false, reason: "mail-not-configured" };
  await getTransport().sendMail({ from: FROM, to: opts.to, subject: opts.subject, text: opts.text, replyTo: opts.replyTo });
  return { ok: true };
}
