import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// Public read of the INEC party registry (factual party details).
//   (no param) -> all parties (summary)
//   ?code=APC  -> one party + its recent change history
export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code");
  if (code) {
    const p = await db.partyRegistry.findUnique({
      where: { code: code.toUpperCase() },
      include: { changes: { orderBy: { changedAt: "desc" }, take: 30 } },
    });
    if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ party: p });
  }
  const parties = await db.partyRegistry.findMany({
    orderBy: { code: "asc" },
    select: { code: true, name: true, chairman: true, logoUrl: true, address: true, phone: true, email: true, checkedAt: true, updatedAt: true },
  });
  return NextResponse.json({ count: parties.length, parties });
}
