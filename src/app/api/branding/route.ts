import { NextResponse } from "next/server";
import { getBrand } from "@/lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: the current brand (name, tagline, accent, logo).
export async function GET() {
  const b = await getBrand();
  return NextResponse.json(b);
}
