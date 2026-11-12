import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, Upload } from "lucide-react";
import { filesFromPaste } from "../lib";

interface Props {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  hint?: string;
  disabled?: boolean;
  /** ascolta Ctrl+V su tutta la pagina mentre il componente è visibile */
  globalPaste?: boolean;
}

/** Riquadro per caricare file: incolla (Ctrl+V o pulsante), trascina o scegli. Funziona anche da telefono. */
export function FilePicker({ onFiles, accept = "image/*,application/pdf", multiple = true, hint, disabled, globalPaste = true }: Props) {
  const [msg, setMsg] = useState("");
  const cb = useRef(onFiles);
  cb.current = onFiles;

  const deliver = (files: File[]) => {
    if (disabled || !files.length) return;
    setMsg("");
    cb.current(multiple ? files : files.slice(0, 1));
  };

  useEffect(() => {
    if (!globalPaste || disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = filesFromPaste(e);
      if (files.length) { e.preventDefault(); deliver(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalPaste, disabled, multiple]);

  // pulsante "Incolla": legge l'immagine dagli appunti (Chrome, Edge, Safari iOS/macOS, Android)
  const pasteFromClipboard = async () => {
    setMsg("");
    try {
      if (!navigator.clipboard?.read) throw new Error("unsupported");
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/")) ?? item.types.find((t) => t === "application/pdf");
        if (!type) continue;
        const blob = await item.getType(type);
        const ext = type.split("/")[1].replace("jpeg", "jpg");
        files.push(new File([blob], `screenshot_${Date.now()}_${files.length}.${ext}`, { type }));
      }
      if (!files.length) return setMsg("Negli appunti non c'è un'immagine: fai prima lo screenshot e copialo.");
      deliver(files);
    } catch (e) {
      const denied = e instanceof DOMException && e.name === "NotAllowedError";
      setMsg(denied
        ? "Permesso negato: consenti l'accesso agli appunti, oppure tocca il riquadro e scegli «Incolla»."
        : "Il tuo browser non permette il pulsante: usa Ctrl+V (⌘V su Mac) oppure tocca il riquadro tratteggiato e scegli «Incolla».");
    }
  };

  return (
    <div className="picker">
      {/* area tratteggiata: riceve anche l'incolla da telefono (tieni premuto → Incolla) */}
      <div
        className="dropzone"
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-label="Incolla qui uno screenshot"
        inputMode="none"
        onPaste={(e) => { const f = filesFromPaste(e); e.preventDefault(); if (f.length) deliver(f); else setMsg("Negli appunti non c'è un'immagine."); }}
        onBeforeInput={(e) => e.preventDefault()}
        onKeyDown={(e) => { if (!(e.ctrlKey || e.metaKey)) e.preventDefault(); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); deliver(Array.from(e.dataTransfer.files)); }}
      >
        <div contentEditable={false} className="dropzone-inner">
          <strong>📋 Incolla qui lo screenshot</strong>
          <span className="muted small">
            Computer: <kbd>Ctrl</kbd>+<kbd>V</kbd> (Mac <kbd>⌘</kbd>+<kbd>V</kbd>) o trascina il file · Telefono: tieni premuto qui → <em>Incolla</em>
          </span>
          {hint && <span className="muted small">{hint}</span>}
        </div>
      </div>
      <div className="row-actions center">
        <button type="button" className="btn primary" disabled={disabled} onClick={pasteFromClipboard}><ClipboardPaste size={17} /> Incolla</button>
        <label className={"btn" + (disabled ? " disabled" : "")}>
          <Upload size={17} /> Scegli file / foto
          <input type="file" hidden disabled={disabled} accept={accept} multiple={multiple}
            onChange={(e) => { deliver(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        </label>
      </div>
      {msg && <p className="warn small" style={{ textAlign: "center" }}>{msg}</p>}
    </div>
  );
}
