/* Riconoscimento dei tappi in una foto, direttamente sul telefono (senza AI):
   ogni pixel viene confrontato con i colori dei tappi delle vostre birre, poi si contano le macchie di colore. */

export interface CapRef { key: string; hex: string }
export interface CapMark { key: string; x: number; y: number; r: number; n: number }
export interface CapResult { counts: Record<string, number>; marks: CapMark[]; width: number; height: number }

function hsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, max ? d / max : 0, max];
}
const hexRgb = (hex: string) => { const v = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
const hueDist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

type Kind = { key: string; type: "chroma"; h: number; v: number } | { key: string; type: "white" | "black" | "grey" };

function kinds(palette: CapRef[]): Kind[] {
  return palette.map((p) => {
    const [h, s, v] = hsv(...(hexRgb(p.hex) as [number, number, number]));
    if (s < 0.2) return { key: p.key, type: v > 0.8 ? "white" : v < 0.25 ? "black" : "grey" };
    return { key: p.key, type: "chroma", h, v };
  });
}

/** Analizza i pixel (RGBA) e conta i tappi per colore. */
export function detectCapsInPixels(data: Uint8ClampedArray, w: number, h: number, palette: CapRef[]): CapResult {
  const ks = kinds(palette);
  const chroma = ks.filter((k): k is Extract<Kind, { type: "chroma" }> => k.type === "chroma");
  const label = new Int16Array(w * h).fill(-1);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const [hh, s, v] = hsv(data[p], data[p + 1], data[p + 2]);
    let best = -1;
    if (s > 0.38 && v > 0.28 && chroma.length) {
      let bd = 999;
      for (const k of chroma) { const d = hueDist(hh, k.h); if (d < bd) { bd = d; best = ks.indexOf(k); } }
      // abbastanza vicino come tinta e non troppo più scuro del tappo (il legno marrone non è un tappo arancione)
      const kk = best >= 0 ? (ks[best] as Extract<Kind, { type: "chroma" }>) : null;
      if (bd > 22 || !kk || v < kk.v * 0.5) best = -1;
    } else if (s < 0.14) {
      const t = v > 0.84 ? "white" : v < 0.16 ? "black" : v > 0.55 && v < 0.8 ? "grey" : null;
      if (t) best = ks.findIndex((k) => k.type === t);
    }
    label[i] = best;
  }
  // macchie di colore (pixel vicini dello stesso colore)
  const seen = new Uint8Array(w * h);
  const comps: { k: number; area: number; sx: number; sy: number; minx: number; maxx: number; miny: number; maxy: number }[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || label[i] < 0) continue;
    const k = label[i];
    let area = 0, sx = 0, sy = 0, minx = w, maxx = 0, miny = h, maxy = 0;
    stack.push(i); seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % w, y = (j - x) / w;
      area++; sx += x; sy += y;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      for (const n of [j - 1, j + 1, j - w, j + w]) {
        if (n < 0 || n >= w * h || seen[n] || label[n] !== k) continue;
        if ((n === j - 1 && x === 0) || (n === j + 1 && x === w - 1)) continue;
        seen[n] = 1; stack.push(n);
      }
    }
    comps.push({ k, area, sx, sy, minx, maxx, miny, maxy });
  }
  const minArea = Math.max(18, w * h * 0.0006);
  // le macchie troppo allungate o troppo vuote non sono tappi (bordi, scritte, etichette)
  const round = comps.filter((c) => {
    if (c.area < minArea) return false;
    const bw = c.maxx - c.minx + 1, bh = c.maxy - c.miny + 1;
    const ratio = Math.max(bw, bh) / Math.min(bw, bh);
    const fill = c.area / (bw * bh);
    return fill > 0.35 && (ratio < 2.2 || c.area > minArea * 6);
  });
  const sizes = round.map((c) => c.area).sort((a, b) => a - b);
  const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
  const counts: Record<string, number> = {};
  const marks: CapMark[] = [];
  for (const c of round) {
    if (c.area < median * 0.3) continue;
    const n = c.area > median * 1.6 ? Math.max(1, Math.round(c.area / median)) : 1;   // tappi attaccati
    const key = ks[c.k].key;
    counts[key] = (counts[key] ?? 0) + n;
    marks.push({ key, x: c.sx / c.area, y: c.sy / c.area, r: Math.sqrt(c.area / Math.PI), n });
  }
  return { counts, marks, width: w, height: h };
}

/** Riduce la foto e cerca i tappi. */
export async function detectCaps(file: File, palette: CapRef[], maxSide = 360): Promise<CapResult & { canvas: HTMLCanvasElement }> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0, c.width, c.height);
  const { data } = g.getImageData(0, 0, c.width, c.height);
  return { ...detectCapsInPixels(data, c.width, c.height, palette), canvas: c };
}
