// Shrinks a customer's transfer-slip photo before it ever leaves the browser, so uploading is fast on a phone's
// data connection and re-opening it later (the popup viewer) is fast too - a slip only needs to be readable
// enough to check the transferred amount, not full camera resolution. Browser-only (canvas), no dependency.
// Falls back to the original file on any failure (an unsupported format, a browser without OffscreenCanvas, ...)
// so compression can never be the reason a slip fails to upload.
export async function compressSlip(file: File, maxDim = 1280, quality = 0.72): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file; // re-encoding never makes an already-small slip bigger
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
