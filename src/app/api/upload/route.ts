import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";
import { tokenIsCurrent } from "@/lib/token-guard";
import { sniffMedia } from "@/lib/filetype";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const s = await getSession(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await tokenIsCurrent(s))) return NextResponse.json({ error: "Session expired — please sign in again." }, { status: 401 });

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
  // Flat storage under the served /uploads directory (matches the static route /
  // Caddy mapping). The election id is embedded in the filename for traceability
  // instead of a subfolder, so the file always resolves at /uploads/<name>.
  const eid = s.electionId ? s.electionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(-8) : "x";
  const dir = process.env.UPLOAD_DIR || "./public/uploads";
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${eid}-${randomUUID()}.${sniff.ext}`;
  await writeFile(path.join(dir, name), buf);

  return NextResponse.json({ url: `/uploads/${name}`, mime: sniff.mime, size: buf.length, sha256 });
}
