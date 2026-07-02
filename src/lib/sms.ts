// Pluggable OTP sender. Default "log" prints the code to server logs so the
// system is usable without an SMS account. Swap SMS_PROVIDER for production.
export async function sendSms(to: string, message: string): Promise<void> {
  const provider = process.env.SMS_PROVIDER || "log";
  if (provider === "termii") {
    await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        from: "N-Alert",
        sms: message,
        type: "plain",
        channel: "generic",
        api_key: process.env.TERMII_API_KEY,
      }),
    });
    return;
  }
  if (provider === "twilio") {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: message }),
    });
    return;
  }
  console.log(`[SMS:log] to=${to} :: ${message}`);
}
