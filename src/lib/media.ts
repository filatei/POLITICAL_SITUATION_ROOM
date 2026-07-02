"use client";
// Downscale images client-side so they survive slow field uplinks.
export async function compressImage(file: File, maxDim = 1600, quality = 0.7): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url; });
    let { width, height } = img;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    width = Math.round(width * scale); height = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b || file), "image/jpeg", quality));
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
