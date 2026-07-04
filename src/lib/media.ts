"use client";
// Shrink large field photos client-side so they survive slow uplinks and don't
// waste room bandwidth — while keeping result-sheet numbers legible.
//
// Strategy: leave already-small images untouched (no needless re-encode / quality
// loss); downscale big ones to `maxDim` on the long edge; then step JPEG quality
// down only as far as needed to fit `targetBytes`, never below a legibility floor.
// Never returns something larger than the original.
export async function compressImage(file: File, maxDim = 2000, targetBytes = 600_000): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  // Small enough already (and a format the canvas can re-encode) → keep as-is.
  if (file.size <= targetBytes && /jpe?g|png|webp/i.test(file.type)) return file;

  const img = document.createElement("img");
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url; });
    let { width, height } = img;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const encode = (q: number) => new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/jpeg", q));

    let q = 0.85;
    let out = await encode(q);
    // Only lower quality if we're still over budget; floor at 0.5 to stay readable.
    while (out && out.size > targetBytes && q > 0.5) {
      q = Math.round((q - 0.1) * 100) / 100;
      const next = await encode(q);
      if (!next) break;
      out = next;
    }
    // Guard: never upload a bigger file than the source.
    return out && out.size < file.size ? out : file;
  } catch {
    return file; // e.g. HEIC the canvas can't decode — send the original
  } finally {
    URL.revokeObjectURL(url);
  }
}
