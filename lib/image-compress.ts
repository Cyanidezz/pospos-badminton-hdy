// Shrinks an image in the browser before it's uploaded (canvas, no dependency). Falls back to the original file on
// any failure (an unsupported format, an old browser, ...) so compression can never be the reason an upload fails.
// `force` always re-encodes to JPEG even when that isn't smaller - for images LINE has to show, which must be
// JPEG or PNG (a phone's WebP/HEIC-converted upload would otherwise be rejected).
export async function compressImage(file: File, { maxDim = 1280, quality = 0.72, force = false } = {}): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; // a transparent PNG would otherwise turn black as a JPEG
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || (!force && blob.size >= file.size)) return file; // re-encoding never makes an already-small file bigger
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

// A customer's transfer slip: only needs to be readable enough to check the amount, so upload and viewing stay fast
// on a phone's data connection.
export const compressSlip = (file: File, maxDim = 1280, quality = 0.72) => compressImage(file, { maxDim, quality });

// A promotion's picture for the LINE Flex card: JPEG (LINE doesn't take WebP) and at most 1024px on a side.
export const promoImage = (file: File) => compressImage(file, { maxDim: 1024, quality: 0.85, force: true });

// The "ราคาขึ้นเอ็น" price list: small print has to stay readable when a customer zooms in on LINE, so it keeps more
// pixels than a promotion card - still JPEG, and still well under LINE's 10 MB image limit.
export const priceListImage = (file: File) => compressImage(file, { maxDim: 2048, quality: 0.88, force: true });
