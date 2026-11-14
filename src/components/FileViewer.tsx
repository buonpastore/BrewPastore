import { useEffect, useState } from "react";
import { X, Download, ZoomIn, ZoomOut } from "lucide-react";

/** Visore a tutto schermo per scontrini, foto e PDF (si apre con openFile). */
export function FileViewer() {
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    const on = (e: Event) => { setFile((e as CustomEvent).detail); setZoom(false); };
    window.addEventListener("pastorizia:view-file", on);
    return () => window.removeEventListener("pastorizia:view-file", on);
  }, []);
  useEffect(() => {
    if (!file) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setFile(null); };
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [file]);
  if (!file) return null;
  const clean = file.name.replace(/^\d{10,}[-_]?/, "");
  const isPdf = /\.pdf$/i.test(file.name);
  const isImg = /\.(png|jpe?g|webp|gif|heic|bmp)$/i.test(file.name) || !isPdf;
  return (
    <div className="fv-backdrop" onClick={() => setFile(null)}>
      <div className="fv-bar" onClick={(e) => e.stopPropagation()}>
        <span className="fv-name">{clean || "Documento"}</span>
        {isImg && !isPdf && <button className="fv-btn" onClick={() => setZoom(!zoom)} aria-label="Ingrandisci">{zoom ? <ZoomOut size={20} /> : <ZoomIn size={20} />}</button>}
        <a className="fv-btn" href={file.url} target="_blank" rel="noopener" aria-label="Apri o scarica"><Download size={20} /></a>
        <button className="fv-btn" onClick={() => setFile(null)} aria-label="Chiudi"><X size={22} /></button>
      </div>
      <div className={"fv-body" + (zoom ? " zoom" : "")} onClick={(e) => e.stopPropagation()}>
        {isPdf ? <iframe title={clean} src={file.url} className="fv-pdf" /> : <img src={file.url} alt={clean} onClick={() => setZoom(!zoom)} />}
      </div>
    </div>
  );
}
