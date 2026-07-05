import { sendMail } from "@/lib/mailer";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export type AgentInvite = {
  name: string;
  email?: string | null;
  code: string;
  unitLabel: string;
  electionName: string;
  slug: string;
  origin: string;
};

export function agentLoginUrl(o: { origin: string; slug: string; code: string }): string {
  return `${o.origin}/${o.slug}/agent/login?code=${encodeURIComponent(o.code)}`;
}

// Rich, branded agent-invite email (table layout for broad mail-client support).
export function agentInviteHtml(o: AgentInvite): string {
  const loginUrl = agentLoginUrl(o);
  const name = esc(o.name || "Field agent");
  const unit = esc(o.unitLabel || "");
  const election = esc(o.electionName || "your election");
  const code = esc(o.code);
  const logo = `${o.origin}/PSR_LOGO.jpeg`;
  const ink = "#0b1220", accent = "#16a34a", muted = "#6b7280", line = "#e5e7eb", bg = "#f4f6f8";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:24px 12px;"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${line};border-radius:16px;overflow:hidden;">
    <tr><td style="background:${ink};padding:26px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td align="left" style="vertical-align:middle;">
          <img src="${logo}" width="44" height="44" alt="PSR" style="display:inline-block;vertical-align:middle;border-radius:10px;background:#fff;">
          <span style="display:inline-block;vertical-align:middle;margin-left:12px;color:#fff;font-size:20px;font-weight:800;letter-spacing:.5px;">PSR</span>
        </td>
        <td align="right" style="vertical-align:middle;">
          <span style="display:inline-block;background:${accent};color:#fff;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;padding:6px 12px;border-radius:999px;">Field Agent</span>
        </td>
      </tr></table>
    </td></tr>

    <tr><td style="padding:36px 32px 8px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${accent};">${election}</div>
      <h1 style="margin:8px 0 6px;font-size:25px;line-height:1.25;font-weight:800;color:${ink};">You're accredited, ${name}</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;color:${muted};">You've been added as a field agent for <strong style="color:${ink};">${election}</strong>. Use the details below to sign in from your phone and start reporting from your polling unit.</p>
    </td></tr>

    ${unit ? `<tr><td style="padding:18px 32px 0;">
      <div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${muted};">📍 Your polling unit</div>
      <div style="margin-top:4px;font-size:15px;font-weight:700;color:${ink};">${unit}</div>
    </td></tr>` : ""}

    <!-- Access code -->
    <tr><td style="padding:22px 32px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px dashed ${accent};border-radius:12px;">
        <tr><td align="center" style="padding:18px 20px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${muted};">Your access code</div>
          <div style="margin-top:6px;font-size:30px;font-weight:800;letter-spacing:3px;color:${ink};font-family:'Courier New',monospace;">${code}</div>
        </td></tr>
      </table>
    </td></tr>

    <!-- CTA -->
    <tr><td align="center" style="padding:22px 32px 6px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" style="border-radius:10px;background:${accent};">
        <a href="${loginUrl}" style="display:inline-block;padding:15px 30px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">Sign in &amp; set your PIN →</a>
      </td></tr></table>
      <div style="margin-top:12px;font-size:12px;color:${muted};">Or open this link on your phone:<br>
        <a href="${loginUrl}" style="color:${accent};text-decoration:none;word-break:break-all;">${esc(loginUrl)}</a>
      </div>
    </td></tr>

    <!-- How it works -->
    <tr><td style="padding:22px 32px 8px;">
      <div style="font-size:13px;font-weight:700;color:${ink};margin-bottom:10px;">How to get started</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.5;color:${muted};">
        <tr><td style="padding:5px 0;"><span style="color:${accent};font-weight:800;">1.</span>&nbsp; Tap the button above on your phone</td></tr>
        <tr><td style="padding:5px 0;"><span style="color:${accent};font-weight:800;">2.</span>&nbsp; Your code fills in automatically — set a private PIN</td></tr>
        <tr><td style="padding:5px 0;"><span style="color:${accent};font-weight:800;">3.</span>&nbsp; Report scores &amp; incidents from your polling unit</td></tr>
        <tr><td style="padding:5px 0;"><span style="color:${accent};font-weight:800;">4.</span>&nbsp; Add the app to your home screen for one-tap access</td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:16px 32px 28px;">
      <div style="font-size:12px;line-height:1.6;color:${muted};background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 16px;">
        🔐 <strong style="color:#9a3412;">Keep your code private.</strong> Anyone with it can report as you. Don't share it or forward this email.
      </div>
    </td></tr>

    <tr><td style="padding:22px 32px;background:#fafafa;border-top:1px solid ${line};">
      <div style="font-size:12px;line-height:1.6;color:${muted};">
        <strong style="color:${ink};">Political Situation Room</strong> — real-time, agent-verified election monitoring.<br>
        <a href="${o.origin}" style="color:${accent};text-decoration:none;">${esc(o.origin.replace(/^https?:\/\//, ""))}</a>
        &nbsp;·&nbsp; A <a href="https://torama.money" style="color:${muted};text-decoration:none;">Torama</a> platform
      </div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

export function agentInviteText(o: AgentInvite): string {
  const loginUrl = agentLoginUrl(o);
  return [
    `You're accredited as a field agent for ${o.electionName}.`,
    o.unitLabel ? `Polling unit: ${o.unitLabel}` : "",
    ``,
    `Your access code: ${o.code}`,
    `Sign in (opens on your phone, fills your code in): ${loginUrl}`,
    ``,
    `Set a private PIN, then report scores and incidents from your polling unit.`,
    `Keep your code private — anyone with it can report as you.`,
    ``,
    `Political Situation Room — ${o.origin}`,
  ].filter(Boolean).join("\n");
}

// Fire-and-forget: email an agent their invite code + sign-in link. No-op if no email.
export async function sendAgentInvite(o: AgentInvite): Promise<{ ok: boolean; reason?: string }> {
  if (!o.email) return { ok: false, reason: "no-email" };
  try {
    await sendMail({
      to: o.email,
      subject: `Your field-agent access code — ${o.electionName}`,
      text: agentInviteText(o),
      html: agentInviteHtml(o),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "send-failed" };
  }
}
