import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sessionIsSuper } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!s) return NextResponse.json({ session: null }, { status: 401 });
  return NextResponse.json({ session: s, isSuper: await sessionIsSuper(s) });
}
