import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { withToken } from "@/lib/respond";
import type { Session } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  const user = await db.user.findUnique({ where: { email: String(email || "").toLowerCase() } });
  if (!user || !user.passwordHash || !(await bcrypt.compare(String(password || ""), user.passwordHash)))
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });

  const session: Session = {
    sub: user.id,
    kind: "user",
    name: user.name,
    role: user.role,
    scope: "NATIONAL",
  };
  return withToken(session);
}
