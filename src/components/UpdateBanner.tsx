import { useEffect, useState } from "react";

/** Nome del file JavaScript principale di questa versione (cambia a ogni pubblicazione). */
function currentBundle(): string | null {
  const s = Array.from(document.scripts).map((x) => x.src).find((src) => /assets\/index-[^/]+\.js/.test(src));
  return s ? s.split("/").pop()! : null;
}

/** Controlla ogni tanto se è stata pubblicata una nuova versione e propone di aggiornare. */
export function UpdateBanner() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const mine = currentBundle();
    if (!mine) return; // in sviluppo non c'è il file con l'hash
    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch(`./index.html?v=${Date.now()}`, { cache: "no-store" });
        const html = await res.text();
        const m = html.match(/assets\/(index-[^"']+\.js)/);
        if (!stopped && m && m[1] !== mine) setAvailable(true);
      } catch { /* offline: riprova più tardi */ }
    };
    check();
    const t = setInterval(check, 3 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => { stopped = true; clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, []);

  if (!available) return null;
  return (
    <div className="update-banner" role="status">
      <span>🍺 È disponibile una nuova versione di Pastorizia</span>
      <button className="btn small primary" onClick={() => window.location.reload()}>Aggiorna</button>
    </div>
  );
}
