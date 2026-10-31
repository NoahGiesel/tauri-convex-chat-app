/** Foto più grandi di così (5 MB) vengono rifiutate prima ancora di leggerle. */
export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

/** Formati ammessi, anche per il selettore file del sistema. */
export const ALLOWED_IMAGE_TYPES = ["image/webp", "image/png", "image/jpeg", "image/gif"];
export const IMAGE_ACCEPT = ".webp,.png,.jpg,.jpeg,.gif," + ALLOWED_IMAGE_TYPES.join(",");

/**
 * Ritaglia l'immagine al centro in un quadrato e la riduce (default 256 px), così il file caricato
 * pesa pochi KB (di una GIF resta il primo fotogramma). Lancia `image_type`, `image_too_large` o `invalid_image`.
 */
export async function squareThumbnail(file: File, size = 256): Promise<Blob> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) throw new Error("image_type");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("image_too_large");

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("invalid_image");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);

    for (const type of ["image/webp", "image/jpeg"]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
      if (blob && blob.type === type) return blob;
    }
    throw new Error("invalid_image");
  } finally {
    bitmap.close();
  }
}
