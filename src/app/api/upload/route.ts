import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "video/webm": "webm",
  "audio/webm": "webm", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg",
};

export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 25 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 25MB)" }, { status: 413 });

  const sha256 = createHash("sha256").update(buf).digest("hex");
  const mime = file.type || "application/octet-stream";
  const ext = EXT[mime] || "bin";
  const dir = process.env.UPLOAD_DIR || "./public/uploads";
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, name), buf);

  return NextResponse.json({ url: `/uploads/${name}`, mime, size: buf.length, sha256 });
}
