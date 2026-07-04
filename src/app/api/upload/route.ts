import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";
import { sniffMedia } from "@/lib/filetype";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Per-uploader cap so one code can't fill the disk: 60 files / minute.
  if (!rateLimit(`upload:${s.sub}`, 60, 60_000))
    return NextResponse.json({ error: "Too many uploads — slow down." }, { status: 429 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 25 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 25MB)" }, { status: 413 });

  // Trust the bytes, not the header — reject anything that isn't real media.
  const sniff = sniffMedia(buf);
  if (!sniff) return NextResponse.json({ error: "Unsupported or unrecognized file type." }, { status: 415 });

  const sha256 = createHash("sha256").update(buf).digest("hex");
  // Partition storage per election so tenants never share a flat folder.
  const bucket = s.electionId ? s.electionId.replace(/[^a-zA-Z0-9_-]/g, "") : "shared";
  const baseDir = process.env.UPLOAD_DIR || "./public/uploads";
  const dir = path.join(baseDir, bucket);
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${randomUUID()}.${sniff.ext}`;
  await writeFile(path.join(dir, name), buf);

  return NextResponse.json({ url: `/uploads/${bucket}/${name}`, mime: sniff.mime, size: buf.length, sha256 });
}
