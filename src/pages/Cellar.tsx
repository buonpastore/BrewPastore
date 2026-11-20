import { useEffect, useRef, useState } from "react";
import { Camera, Check, Minus, Plus, RotateCcw, Trash2, User, Users, X } from "lucide-react";
import { detectCaps, type CapResult } from "../capDetect";
import { supabase, errMsg, type Row } from "../lib";
import { useAuth } from "../auth";
import { CapDot, capInfo, useCapColors } from "../components/CapColor";
import { UserAvatar } from "../components/UserAvatar";
import { loadCellar, loadProduced, NEED_0018 } from "../cellar";

/** Cantina: quante bottiglie di ogni birra ha ciascuno di noi. */
export function Cellar() {
  useCapColors();
  const { session, profiles, nameOf } = useAuth();
  const me = session?.user.id;
  const [beers, setBeers] = useState<Row[]>([]);
  const [cellar, setCellar] = useState<Row[] | null | undefined>(undefined);
  const [tab, setTab] = useState<"mie" | "tutti">("mie");
  const [adding, setAdding] = useState(false);
  const [scan, setScan] = useState<(CapResult & { url: string; pick: Record<string, string>; n: Record<string, number> }) | null>(null);
  const [scanning, setScanning] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  const load = () => { loadCellar().then(setCellar); };
  useEffect(() => { loadProduced().then(setBeers); load(); }, []);

  const beer = (id: string) => beers.find((b) => b.id === id);
  const nameOfBeer = (b?: Row) => b?.recipes?.name ?? b?.code ?? "Birra";
  const mine = (cellar ?? []).filter((c) => c.user_id === me && beer(c.batch_id))
    .sort((a, b) => String(beer(b.batch_id)?.created_at ?? "").localeCompare(String(beer(a.batch_id)?.created_at ?? "")));
  const myTotal = mine.reduce((t, c) => t + c.bottles, 0);
  const notMine = beers.filter((b) => !mine.some((c) => c.batch_id === b.id));

  const save = async (batch_id: string, bottles: number) => {
    const n = Math.max(0, Math.round(bottles));
    setCellar((cs) => {
      const rest = (cs ?? []).filter((c) => !(c.user_id === me && c.batch_id === batch_id));
      return [...rest, { user_id: me, batch_id, bottles: n }];
    });
    const { error } = await supabase.from("cellar_bottles").upsert({ user_id: me, batch_id, bottles: n, updated_at: new Date().toISOString() }, { onConflict: "user_id,batch_id" });
    if (error) { alert(/cellar_bottles/i.test(error.message) ? NEED_0018 : errMsg(error)); load(); }
  };
  const remove = async (batch_id: string) => {
    const b = beer(batch_id);
    if (!confirm(`Togliere ${nameOfBeer(b)} dalla tua cantina?`)) return;
    const { error } = await supabase.from("cellar_bottles").delete().eq("user_id", me!).eq("batch_id", batch_id);
    if (error) return alert(errMsg(error));
    load();
  };

  const zeroAll = async () => {
    if (!mine.some((c) => c.bottles > 0) || !confirm("Azzerare tutte le tue bottiglie? Le birre restano in elenco con 0.")) return;
    const { error } = await supabase.from("cellar_bottles").update({ bottles: 0, updated_at: new Date().toISOString() }).eq("user_id", me!);
    if (error) return alert(errMsg(error));
    load();
  };

  // foto dei tappi: colori dei tappi delle birre che ci sono
  const capsOf = (key: string) => beers.filter((b) => b.cap_color === key);
  const readPhoto = async (f?: File) => {
    if (!f) return;
    setScanning(true);
    try {
      const keys = [...new Set(beers.map((b) => b.cap_color).filter(Boolean))] as string[];
      if (!keys.length) { alert("Nessuna birra ha ancora il colore del tappo: sceglilo nel batch, all'imbottigliamento."); return; }
      const palette = keys.map((k) => ({ key: k, hex: capInfo(k)?.hex ?? "#888888" }));
      const r = await detectCaps(f, palette);
      // disegno i cerchi sui tappi trovati
      const g = r.canvas.getContext("2d")!;
      g.lineWidth = 3;
      for (const m of r.marks) { g.strokeStyle = "#eda512"; g.beginPath(); g.arc(m.x, m.y, Math.max(6, m.r + 2), 0, Math.PI * 2); g.stroke(); }
      const pick: Record<string, string> = {}, n: Record<string, number> = {};
      for (const [k, v] of Object.entries(r.counts)) { pick[k] = capsOf(k)[0]?.id ?? ""; n[k] = v; }
      setScan({ ...r, url: r.canvas.toDataURL("image/jpeg", 0.8), pick, n });
    } catch (e) { alert(errMsg(e)); } finally { setScanning(false); if (photoRef.current) photoRef.current.value = ""; }
  };
  const applyScan = async () => {
    if (!scan) return;
    const rows = Object.entries(scan.pick).filter(([k, id]) => id && scan.n[k] > 0);
    if (!rows.length) return setScan(null);
    // stessa birra scelta per più colori: si sommano
    const tot = new Map<string, number>();
    for (const [k, id] of rows) tot.set(id, (tot.get(id) ?? 0) + scan.n[k]);
    for (const [id, v] of tot) await save(id, v);
    setScan(null);
  };

  if (cellar === undefined) return <p>Caricamento…</p>;
  if (cellar === null) return <div><h1>Cantina</h1><p className="note">{NEED_0018}.</p></div>;

  return (
    <div>
      <h1>Cantina</h1>
      <div className="pv-views cel-tabs">
        <button className={"pv-view" + (tab === "mie" ? " on" : "")} onClick={() => setTab("mie")}><User size={15} /> Le mie · {myTotal}</button>
        <button className={"pv-view" + (tab === "tutti" ? " on" : "")} onClick={() => setTab("tutti")}><Users size={15} /> Di tutti · {(cellar ?? []).filter((c) => beer(c.batch_id)).reduce((t, c) => t + c.bottles, 0)}</button>
      </div>

      {tab === "mie" && (
        <>
          <div className="cel-list">
            {mine.map((c) => {
              const b = beer(c.batch_id)!;
              return (
                <div key={c.batch_id} className={"cel-card" + (c.bottles ? "" : " empty")}>
                  <CapDot color={b.cap_color} size={30} />
                  <div className="cel-name">
                    <strong>{nameOfBeer(b)}</strong>
                    <small>{[b.recipes?.style, b.code].filter(Boolean).join(" · ")}</small>
                  </div>
                  <div className="cel-step">
                    <button aria-label="Una in meno" disabled={!c.bottles} onClick={() => save(c.batch_id, c.bottles - 1)}><Minus size={18} /></button>
                    <input type="number" inputMode="numeric" min={0} value={c.bottles} onChange={(e) => save(c.batch_id, Number(e.target.value) || 0)} />
                    <button aria-label="Una in più" onClick={() => save(c.batch_id, c.bottles + 1)}><Plus size={18} /></button>
                  </div>
                  <button className="cel-del" title="Togli dalla cantina" onClick={() => remove(c.batch_id)}><Trash2 size={16} /></button>
                </div>
              );
            })}
            {!mine.length && <p className="muted">La tua cantina è vuota: aggiungi le birre che hai a casa.</p>}
          </div>

          {notMine.length > 0 && (adding ? (
            <div className="cel-add">
              <p className="muted small">Quale birra hai? Toccala per aggiungerla.</p>
              <div className="cel-pick">
                {notMine.map((b) => (
                  <button key={b.id} className="cel-opt" onClick={() => { save(b.id, 1); setAdding(false); }}>
                    <CapDot color={b.cap_color} size={22} />
                    <span><strong>{nameOfBeer(b)}</strong><small>{[b.recipes?.style, b.code].filter(Boolean).join(" · ")}</small></span>
                  </button>
                ))}
              </div>
              <button className="btn full-w" onClick={() => setAdding(false)}><X size={17} /> Annulla</button>
            </div>
          ) : <button className="btn primary full-w" onClick={() => setAdding(true)}><Plus size={18} /> Aggiungi una birra</button>)}
          {!beers.length && <p className="note">Non ci sono ancora batch imbottigliati.</p>}

          {beers.length > 0 && !scan && (
            <div className="cel-tools">
              <button className="btn" disabled={scanning} onClick={() => photoRef.current?.click()}><Camera size={17} /> {scanning ? "Guardo i tappi…" : "Riconosci dalla foto"}</button>
              <button className="btn" disabled={!mine.some((c) => c.bottles > 0)} onClick={zeroAll}><RotateCcw size={16} /> Azzera tutte</button>
              <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => readPhoto(e.target.files?.[0])} />
            </div>
          )}
          {scan && (
            <div className="cel-scan">
              <h3>Tappi trovati nella foto</h3>
              <img src={scan.url} alt="Foto dei tappi" />
              {!Object.keys(scan.counts).length ? <p className="muted">Non ho riconosciuto tappi delle vostre birre. Prova con una foto dall'alto, ben illuminata, coi tappi in vista.</p> : (
                <div className="cel-scan-list">
                  {Object.keys(scan.counts).map((k) => (
                    <div key={k} className="cel-scan-row">
                      <CapDot color={k} size={24} />
                      <select value={scan.pick[k]} onChange={(e) => setScan({ ...scan, pick: { ...scan.pick, [k]: e.target.value } })}>
                        <option value="">— non è una birra —</option>
                        {(capsOf(k).length ? capsOf(k) : beers).map((b) => <option key={b.id} value={b.id}>{nameOfBeer(b)}</option>)}
                      </select>
                      <div className="cel-step">
                        <button aria-label="Uno in meno" onClick={() => setScan({ ...scan, n: { ...scan.n, [k]: Math.max(0, scan.n[k] - 1) } })}><Minus size={16} /></button>
                        <input type="number" inputMode="numeric" value={scan.n[k]} onChange={(e) => setScan({ ...scan, n: { ...scan.n, [k]: Math.max(0, Number(e.target.value) || 0) } })} />
                        <button aria-label="Uno in più" onClick={() => setScan({ ...scan, n: { ...scan.n, [k]: scan.n[k] + 1 } })}><Plus size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="muted small">Controlla i numeri: confermando, queste birre nella tua cantina prendono questi valori.</p>
              <div className="row-actions">
                {Object.keys(scan.counts).length > 0 && <button className="btn primary" onClick={applyScan}><Check size={17} /> Metti nella mia cantina</button>}
                <button className="btn" onClick={() => setScan(null)}><X size={17} /> Annulla</button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "tutti" && (
        <div className="cel-list">
          {profiles.map((p) => {
            const rows = (cellar ?? []).filter((c) => c.user_id === p.id && c.bottles > 0 && beer(c.batch_id));
            const tot = rows.reduce((t, c) => t + c.bottles, 0);
            return (
              <div key={p.id} className="cel-person">
                <div className="cel-person-head">
                  <UserAvatar id={p.id} size={34} />
                  <strong>{nameOf(p.id)}</strong>
                  <span className="cel-tot">{tot} {tot === 1 ? "bottiglia" : "bottiglie"}</span>
                </div>
                {rows.length ? (
                  <div className="cel-chips">
                    {rows.sort((a, b) => b.bottles - a.bottles).map((c) => {
                      const b = beer(c.batch_id)!;
                      return <span key={c.batch_id} className="cel-chip"><CapDot color={b.cap_color} size={16} /> {nameOfBeer(b)} <b>{c.bottles}</b></span>;
                    })}
                  </div>
                ) : <p className="muted small">Nessuna bottiglia segnata.</p>}
              </div>
            );
          })}
          {beers.length > 0 && (
            <div className="cel-person">
              <div className="cel-person-head"><strong>Per birra</strong></div>
              <div className="cel-chips">
                {beers.map((b) => {
                  const n = (cellar ?? []).filter((c) => c.batch_id === b.id).reduce((t, c) => t + c.bottles, 0);
                  return n > 0 ? <span key={b.id} className="cel-chip"><CapDot color={b.cap_color} size={16} /> {nameOfBeer(b)} <b>{n}</b></span> : null;
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
