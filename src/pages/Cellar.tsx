import { useEffect, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { supabase, errMsg, type Row } from "../lib";
import { useAuth } from "../auth";
import { CapDot, useCapColors } from "../components/CapColor";
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

  const load = () => { loadCellar().then(setCellar); };
  useEffect(() => { loadProduced().then(setBeers); load(); }, []);

  const beer = (id: string) => beers.find((b) => b.id === id);
  const nameOfBeer = (b?: Row) => b?.recipes?.name ?? b?.code ?? "Birra";
  const mine = (cellar ?? []).filter((c) => c.user_id === me && beer(c.batch_id))
    .sort((a, b) => nameOfBeer(beer(a.batch_id)).localeCompare(nameOfBeer(beer(b.batch_id))));
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

  if (cellar === undefined) return <p>Caricamento…</p>;
  if (cellar === null) return <div><h1>Cantina</h1><p className="note">{NEED_0018}.</p></div>;

  return (
    <div>
      <h1>Cantina</h1>
      <div className="pv-views cel-tabs">
        <button className={"pv-view" + (tab === "mie" ? " on" : "")} onClick={() => setTab("mie")}>Le mie · {myTotal}</button>
        <button className={"pv-view" + (tab === "tutti" ? " on" : "")} onClick={() => setTab("tutti")}>Di tutti · {(cellar ?? []).filter((c) => beer(c.batch_id)).reduce((t, c) => t + c.bottles, 0)}</button>
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
              <button className="btn full-w" onClick={() => setAdding(false)}>Annulla</button>
            </div>
          ) : <button className="btn primary full-w" onClick={() => setAdding(true)}>+ Aggiungi una birra</button>)}
          {!beers.length && <p className="note">Non ci sono ancora batch imbottigliati.</p>}
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
