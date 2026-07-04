// Sniff a file's REAL type from its magic bytes instead of trusting the
// client-supplied Content-Type. Returns the detected mime + our extension, or
// null if it's not an allowed media type.
export function sniffMedia(buf: Buffer): { mime: string; ext: string } | null {
  const b = buf;
  const ascii = (start: number, end: number) => b.toString("latin1", start, end);

  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (b.length >= 12 && ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (brand.startsWith("M4A")) return { mime: "audio/mp4", ext: "m4a" };
    if (/mp4|isom|iso2|mp41|mp42|avc1|M4V/.test(brand)) return { mime: "video/mp4", ext: "mp4" };
  }
  if (b.length >= 4 && ascii(0, 4) === "OggS") return { mime: "audio/ogg", ext: "ogg" };
  // EBML container → WebM (audio or video). We store as .webm either way.
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mime: "video/webm", ext: "webm" };
  // MP3: "ID3" tag or an MPEG audio frame sync.
  if (b.length >= 3 && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0))) return { mime: "audio/mpeg", ext: "mp3" };
  return null;
}
