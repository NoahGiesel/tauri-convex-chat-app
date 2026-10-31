/** Foto più grandi di così vengono rifiutate prima ancora di leggerle. */
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

/**
 * Ritaglia l'immagine al centro in un quadrato e la riduce (default 256 px), così il file caricato
 * pesa pochi KB. Lancia un errore se il file non è un'immagine leggibile.
 */
export async function squareThumbnail(file: File, size = 256): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.size > MAX_SOURCE_BYTES) throw new Error("invalid_image");

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
