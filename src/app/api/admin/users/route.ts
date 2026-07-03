import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";

export const runtime = "nodejs";

// Admin enrols situation-room staff with an email + password + role. Staff then
// sign in on /room (or /admin) with those credentials. Only ADMINs can manage users.

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["ADMIN", "COORDINATOR", "ANALYST"]),
  password: z.string().min(6).optional(), // required on create; optional = keep existing on update
});

export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const users = await db.user.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id, email: u.email, name: u.name, role: u.role,
      hasPassword: !!u.passwordHash, hasGoogle: !!u.googleSub, createdAt: u.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!requireRole(s, ["ADMIN"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { email, name, role, password } = parsed.data;
  const key = email.toLowerCase();

  const existing = await db.user.findUnique({ where: { email: key } });
  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;

  if (existing) {
    // Update name/role, and password only if a new one was supplied.
    const updated = await db.user.update({
      where: { id: existing.id },
      data: { name, role, ...(passwordHash ? { passwordHash } : {}) },
    });
    return NextResponse.json({ ok: true, edited: true, user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role } });
  }

  if (!passwordHash) return NextResponse.json({ error: "Password is required for a new user." }, { status: 400 });
  const created = await db.user.create({ data: { email: key, name, role, passwordHash } });
  return NextResponse.json({ ok: true, edited: false, user: { id: created.id, email: created.email, name: created.name, role: created.role } });
}
