import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  mp4: "video/mp4", webm: "video/webm", ogg: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4",
};

// Serve uploaded media from UPLOAD_DIR directly, so the URL resolves regardless
// of how the static folder / volume is mounted. Filenames are our own generated
// tokens; we still hard-reject anything that isn't a plain safe filename.
export async function GET(_req: NextRequest, { params }: { params: { name: string } }) {
  const name = params.name;
  if (!name || !/^[A-Za-z0-9._-]+$/.test(name) || name.includes("..")) {
    return NextResponse.json({ error: "Bad file name." }, { status: 400 });
  }
  const dir = process.env.UPLOAD_DIR || "./public/uploads";
  const file = path.join(dir, name);
  // Ensure the resolved path stays inside the upload dir.
  if (!path.resolve(file).startsWith(path.resolve(dir))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  try {
    await stat(file);
    const buf = await readFile(file);
    const ext = name.split(".").pop()?.toLowerCase() || "";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
