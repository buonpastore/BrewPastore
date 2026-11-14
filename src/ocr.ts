/* Lettura del testo dagli screenshot direttamente sul telefono (OCR con tesseract.js), senza AI.
   Motore (public/tesseract) e vocabolario italiano (public/tessdata) sono dentro l'app. */

export const isImage = (f: File) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|heic|gif|bmp)$/i.test(f.name);
export const isTextFile = (f: File) => f.type.startsWith("text/") || /\.(txt|md|csv|eml|html?)$/i.test(f.name) || (!f.type && f.size < 300_000 && !isImage(f) && !/\.pdf$/i.test(f.name));

/** Testo di un file: testo così com'è, immagini lette con l'OCR, altrimenti null (es. PDF). */
export async function textOf(files: File[], onProgress?: (msg: string) => void, opts: { clean?: boolean } = {}): Promise<string | null> {
  const parts: string[] = [];
  for (const [i, f] of files.entries()) {
    if (isTextFile(f)) { parts.push(await f.text()); continue; }
    if (isImage(f)) { parts.push(await ocrImage(opts.clean ? await bw(f) : f, (p) => onProgress?.(`Leggo l'immagine ${files.length > 1 ? `${i + 1}/${files.length} ` : ""}… ${p}%`))); continue; }
    return null;   // PDF o altro: serve l'AI
  }
  return parts.join("\n");
}

export async function ocrImage(file: File | Blob, onProgress?: (pct: number) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const base = new URL(".", document.baseURI).href;
  const worker = await createWorker("ita", 1, {   // tutto servito dall'app: nessun servizio esterno
    workerPath: `${base}tesseract/worker.min.js`,
    corePath: `${base}tesseract`,
    langPath: new URL("tessdata/", document.baseURI).href.replace(/\/$/, ""),
    gzip: true,
    logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") onProgress?.(Math.round(m.progress * 100)); },
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/** Bianco e nero ad alto contrasto: rende leggibili screenshot scuri o con celle colorate (es. Fogli Google col tema scuro). */
async function bw(file: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(file);
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    const px = d.data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const dark = sum / (px.length / 4) < 128;   // tema scuro: testo chiaro su fondo scuro
    for (let i = 0; i < px.length; i += 4) {
      const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const ink = dark ? l > 150 : l < 110;
      px[i] = px[i + 1] = px[i + 2] = ink ? 0 : 255;
    }
    g.putImageData(d, 0, 0);
    return await new Promise<Blob>((ok) => c.toBlob((b) => ok(b ?? file), "image/png"));
  } catch { return file; }
}
