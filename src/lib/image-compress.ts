const QUALITY = 0.7;
const MAX_SIDE = 2560;

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/**
 * Ricodifica una foto con qualità 70% (e al massimo 2560 px sul lato lungo) prima del caricamento.
 * Restituisce il file originale se il risultato non è più piccolo, se il formato non si può
 * ricomprimere senza perdite visibili (GIF animate) o se il browser non sa codificarlo.
 */
export async function compressImage(file: File): Promise<File> {
  if (file.type === "image/gif" || !file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    // WebP mantiene la trasparenza; alcuni browser (Safari) non lo sanno scrivere e restituiscono un PNG.
    let blob = await encode(canvas, "image/webp");
    if (blob && blob.type !== "image/webp") blob = null;
    // Senza WebP, solo le foto JPEG si possono ricomprimere in JPEG senza perdere la trasparenza.
    if (!blob && file.type === "image/jpeg") blob = await encode(canvas, "image/jpeg");
    if (!blob || blob.size >= file.size) return file;

    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const name = file.name.replace(/\.[^.]+$/, "") + "." + ext;
    return new File([blob], name, { type: blob.type });
  } catch {
    return file; // immagine non decodificabile qui: si carica così com'è
  }
}
