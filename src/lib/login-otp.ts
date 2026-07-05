import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { normalizeMsisdn } from "@/lib/sms";

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

// Generate a 6-digit code, store its hash for the phone (replacing any prior),
// and return the plain code to send. Phone is normalised so lookups match.
export async function issueLoginOtp(phone: string): Promise<{ code: string; phone: string } | null> {
  const n = normalizeMsisdn(phone);
  if (!n) return null;
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  const codeHash = await bcrypt.hash(code, 10);
  await db.loginOtp.deleteMany({ where: { phone: n } });
  await db.loginOtp.create({ data: { phone: n, codeHash, expiresAt: new Date(Date.now() + TTL_MS) } });
  return { code, phone: n };
}

// Verify a code for a phone. Enforces expiry + attempt cap. Consumes on success.
export async function checkLoginOtp(phone: string, code: string): Promise<boolean> {
  const n = normalizeMsisdn(phone);
  if (!n) return false;
  const rec = await db.loginOtp.findFirst({ where: { phone: n }, orderBy: { createdAt: "desc" } });
  if (!rec) return false;
  if (rec.expiresAt < new Date()) { await db.loginOtp.delete({ where: { id: rec.id } }).catch(() => {}); return false; }
  if (rec.attempts >= MAX_ATTEMPTS) { await db.loginOtp.delete({ where: { id: rec.id } }).catch(() => {}); return false; }
  const ok = await bcrypt.compare(code, rec.codeHash);
  if (!ok) { await db.loginOtp.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } } }).catch(() => {}); return false; }
  await db.loginOtp.delete({ where: { id: rec.id } }).catch(() => {});
  return true;
}
