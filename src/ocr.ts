/* Lettura del testo dagli screenshot direttamente sul telefono (OCR con tesseract.js), senza AI.
   Motore (public/tesseract) e vocabolario italiano (public/tessdata) sono dentro l'app. */

export const isImage = (f: File) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|heic|gif|bmp)$/i.test(f.name);
export const isTextFile = (f: File) => f.type.startsWith("text/") || /\.(txt|md|csv|eml|html?)$/i.test(f.name) || (!f.type && f.size < 300_000 && !isImage(f) && !/\.pdf$/i.test(f.name));

/** Testo di un file: testo così com'è, immagini lette con l'OCR, altrimenti null (es. PDF). */
export async function textOf(files: File[], onProgress?: (msg: string) => void): Promise<string | null> {
  const parts: string[] = [];
  for (const [i, f] of files.entries()) {
    if (isTextFile(f)) { parts.push(await f.text()); continue; }
    if (isImage(f)) { parts.push(await ocrImage(f, (p) => onProgress?.(`Leggo l'immagine ${files.length > 1 ? `${i + 1}/${files.length} ` : ""}… ${p}%`))); continue; }
    return null;   // PDF o altro: serve l'AI
  }
  return parts.join("\n");
}

export async function ocrImage(file: File, onProgress?: (pct: number) => void): Promise<string> {
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
