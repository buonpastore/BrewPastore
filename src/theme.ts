/** Tema del sito: scuro, chiaro o automatico (chiaro col sole, scuro dal tramonto all'alba). */
export type ThemePref = "scuro" | "chiaro" | "auto";
const KEY = "bp-tema";
// coordinate di riferimento: centro Italia (le differenze tra nord e sud sono di pochi minuti)
const LAT = 42.5, LON = 12.5;

export function getThemePref(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === "chiaro" || v === "auto" ? v : "scuro"; } catch { return "scuro"; }
}

/** Alba e tramonto del giorno (algoritmo NOAA semplificato). */
export function sunTimes(day = new Date()): { rise: Date; set: Date } {
  const rad = Math.PI / 180;
  const start = Date.UTC(day.getFullYear(), 0, 1);
  const n = Math.floor((Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) - start) / 86400000) + 1;
  const g = (2 * Math.PI / 365) * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(LAT * rad) * Math.cos(decl)) - Math.tan(LAT * rad) * Math.tan(decl)) / rad;
  const base = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
  return {
    rise: new Date(base + (720 - 4 * (LON + ha) - eq) * 60000),
    set: new Date(base + (720 - 4 * (LON - ha) - eq) * 60000),
  };
}

export function resolvedTheme(pref = getThemePref(), now = new Date()): "light" | "dark" {
  if (pref === "chiaro") return "light";
  if (pref === "scuro") return "dark";
  const { rise, set } = sunTimes(now);
  return now >= rise && now < set ? "light" : "dark";
}

export function applyTheme() {
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "light" ? "#f6f0e4" : "#12110f");
}

export function setThemePref(p: ThemePref) {
  try { localStorage.setItem(KEY, p); } catch { /* niente */ }
  applyTheme();
}

/** Applica subito il tema e lo ricontrolla ogni minuto (per il cambio automatico). */
export function startTheme() {
  applyTheme();
  window.setInterval(applyTheme, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) applyTheme(); });
}
