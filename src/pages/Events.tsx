import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, ExternalLink, GraduationCap, MapPin, PartyPopper, Factory, Beer } from "lucide-react";

interface BeerEvent { titolo: string; tipo: string; dal: string | null; al: string | null; quando: string; dove: string; regione: string; descrizione: string; link: string }
/** Registro degli aggiornamenti dell'elenco (lo scrive la ricerca automatica di ogni mattina). */
interface EventsLog { data: string; aggiunti: string[]; aggiornati: string[]; tolti: string[]; nota?: string }
interface EventsFile { aggiornato: string; eventi: BeerEvent[]; storico?: EventsLog[] }
const fmtDay = (d: string) => { const s = new Date(d + "T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }); return s.charAt(0).toUpperCase() + s.slice(1); };
const todayIso = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; };

/** Elenco degli aggiornamenti: per ogni giorno gli eventi aggiunti, aggiornati e tolti. */
function EventsHistory({ log }: { log: EventsLog[] }) {
  if (!log.length) return <p className="muted">Nessun aggiornamento registrato.</p>;
  const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;
  return (
    <section className="ev-log">
      <p className="muted small">Ogni mattina l'app cerca nuovi eventi: qui trovi tutto quello che ha inserito, aggiornato o tolto, giorno per giorno.</p>
      {log.map((e) => {
        const parts = [e.aggiunti.length && n(e.aggiunti.length, "aggiunto", "aggiunti"), e.aggiornati.length && n(e.aggiornati.length, "aggiornato", "aggiornati"), e.tolti.length && n(e.tolti.length, "tolto", "tolti")].filter(Boolean);
        return (
          <div key={e.data} className="ev-log-day open">
            <div className="ev-log-head">
              <strong>{e.data === todayIso() ? "Oggi" : fmtDay(e.data)}</strong>
              <span className="muted small">{[e.nota, parts.length ? parts.join(" · ") : "nessuna novità"].filter(Boolean).join(" · ")}</span>
            </div>
            {(
              <ul>
                {e.aggiunti.map((x) => <li key={"a" + x} className="add">➕ {x}</li>)}
                {e.aggiornati.map((x) => <li key={"u" + x} className="upd">✏️ {x}</li>)}
                {e.tolti.map((x) => <li key={"t" + x} className="del">➖ {x}</li>)}
                {!e.aggiunti.length && !e.aggiornati.length && !e.tolti.length && <li className="muted">Nessun evento nuovo trovato.</li>}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** In Home: se oggi la ricerca automatica ha aggiunto o aggiornato eventi, lo dice. */
export function EventsNews() {
  const [log, setLog] = useState<EventsLog | null>(null);
  useEffect(() => {
    fetch(`${new URL("eventi.json", document.baseURI).href}?t=${Date.now()}`).then((r) => (r.ok ? r.json() : null))
      .then((d: EventsFile | null) => { const e = d?.storico?.[0]; if (e && e.data === todayIso() && (e.aggiunti.length || e.aggiornati.length)) setLog(e); })
      .catch(() => undefined);
  }, []);
  if (!log) return null;
  return (
    <>
    <h2>🆕 Novità sugli eventi</h2>
    <Link to="/eventi?vista=storico" className="panel ev-news">
      <strong>📅 Oggi ho {log.aggiunti.length ? `aggiunto ${log.aggiunti.length} ${log.aggiunti.length === 1 ? "evento" : "eventi"}` : ""}{log.aggiunti.length && log.aggiornati.length ? " e " : ""}{log.aggiornati.length ? `aggiornato ${log.aggiornati.length} ${log.aggiornati.length === 1 ? "evento" : "eventi"}` : ""}</strong>
      <span className="small">{[...log.aggiunti, ...log.aggiornati].slice(0, 3).join(" · ")}{log.aggiunti.length + log.aggiornati.length > 3 ? " …" : ""}</span>
      <span className="small ev-news-go">Vedi lo storico →</span>
    </Link>
    </>
  );
}

const TYPES: Record<string, { label: string; one: string; icon: typeof Beer; color: string }> = {
  festival: { label: "Festival", one: "Festival", icon: PartyPopper, color: "var(--gold)" },
  corso: { label: "Corsi", one: "Corso", icon: GraduationCap, color: "var(--teal)" },
  degustazione: { label: "Degustazioni", one: "Degustazione", icon: Beer, color: "var(--magenta)" },
  birrificio: { label: "Birrifici", one: "Birrificio", icon: Factory, color: "var(--violet)" },
  altro: { label: "Altro", one: "Evento", icon: CalendarDays, color: "var(--hop)" },
};
const typeOf = (t: string) => TYPES[t] ?? TYPES.altro;
const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" });

/** Attività → Eventi: eventi a tema birra in Umbria e Centro Italia (l'elenco si aggiorna ogni giorno da solo). */
export function Events() {
  const [data, setData] = useState<EventsFile | null>(null);
  const [err, setErr] = useState("");
  const [where, setWhere] = useState<"tutti" | "umbria">("tutti");
  const [kind, setKind] = useState<string | null>(null);
  const [past, setPast] = useState(false);

  useEffect(() => {
    fetch(`${new URL("eventi.json", document.baseURI).href}?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData).catch(() => setErr("Non riesco a caricare gli eventi in questo momento."));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const list = useMemo(() => {
    const all = data?.eventi ?? [];
    const ended = (e: BeerEvent) => (e.al ?? e.dal) != null && (e.al ?? e.dal)! < today;
    return all
      .filter((e) => past || !ended(e))
      .filter((e) => where === "tutti" || /umbria/i.test(e.regione))
      .filter((e) => !kind || (TYPES[e.tipo] ? e.tipo : "altro") === kind)
      // prima quelli con una data (dal più vicino), poi quelli senza data
      .sort((a, b) => (a.dal ? 0 : 1) - (b.dal ? 0 : 1) || String(a.dal ?? "").localeCompare(String(b.dal ?? "")));
  }, [data, where, kind, past, today]);
  const kinds = [...new Set((data?.eventi ?? []).map((e) => (TYPES[e.tipo] ? e.tipo : "altro")))];
  // due schede: gli eventi e lo storico degli inserimenti
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("vista") === "storico" ? "storico" : "eventi";
  const tabs = (
    <div className="pv-views sub-switch">
      <button className={"pv-view" + (tab === "eventi" ? " on" : "")} onClick={() => setSp({}, { replace: true })}>📅 Eventi</button>
      <button className={"pv-view" + (tab === "storico" ? " on" : "")} onClick={() => setSp({ vista: "storico" }, { replace: true })}>🔄 Storico inserimenti</button>
    </div>
  );
  if (tab === "storico") return (
    <div>
      {tabs}
      <div className="page-head"><h1>Storico inserimenti</h1></div>
      {err && <p className="error">{err}</p>}
      {data && <EventsHistory log={data.storico ?? []} />}
    </div>
  );

  return (
    <div>
      {tabs}
      <div className="page-head"><h1>Eventi</h1></div>
      <p className="muted">Festival, corsi e degustazioni di birra in Umbria e nel Centro Italia.{data && <> Aggiornato il {new Date(data.aggiornato + "T12:00:00").toLocaleDateString("it-IT")}.</>}</p>
      {err && <p className="error">{err}</p>}

      <div className="pv-views ev-where">
        <button className={"pv-view" + (where === "tutti" ? " on" : "")} onClick={() => setWhere("tutti")}>Centro Italia</button>
        <button className={"pv-view" + (where === "umbria" ? " on" : "")} onClick={() => setWhere("umbria")}>Solo Umbria</button>
      </div>
      {kinds.length > 1 && (
        <div className="ev-kinds">
          {kinds.map((k) => { const t = typeOf(k); const Icon = t.icon; return (
            <button key={k} className={"ev-kind" + (kind === k ? " on" : "")} style={{ ["--c" as string]: t.color }} onClick={() => setKind(kind === k ? null : k)}><Icon size={15} /> {t.label}</button>
          ); })}
        </div>
      )}

      <div className="ev-list">
        {list.map((e, i) => {
          const t = typeOf(e.tipo); const Icon = t.icon;
          return (
            <article key={i} className="ev-card" style={{ ["--c" as string]: t.color }}>
              <div className="ev-date">
                {e.dal ? <><strong>{fmt(e.dal).split(" ")[0]}</strong><span>{fmt(e.dal).split(" ")[1]}</span>{e.al && e.al !== e.dal && <small>→ {fmt(e.al)}</small>}</> : <Icon size={22} />}
              </div>
              <div className="ev-body">
                <span className="ev-type"><Icon size={13} /> {t.one}</span>
                <h3>{e.titolo}</h3>
                <p className="ev-meta"><CalendarDays size={14} /> {e.quando}</p>
                <p className="ev-meta"><MapPin size={14} /> {e.dove}{e.regione && !e.dove.includes(e.regione) ? ` · ${e.regione}` : ""}</p>
                {e.descrizione && <p className="ev-desc">{e.descrizione}</p>}
                <a className="btn ev-link" href={e.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Vai all'evento</a>
              </div>
            </article>
          );
        })}
        {data && !list.length && <p className="muted">Nessun evento con questi filtri.</p>}
      </div>
      {data && <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} /> mostra anche quelli passati</label>}
    </div>
  );
}

/** In Home: gli eventi del mese in corso (anche quelli già iniziati e non ancora finiti). Se non ce ne sono, non mostra niente. */
export function MonthEvents() {
  const [list, setList] = useState<BeerEvent[] | null>(null);
  useEffect(() => {
    fetch(`${new URL("eventi.json", document.baseURI).href}?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null)).then((d: EventsFile | null) => {
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const month = today.slice(0, 7);
        setList((d?.eventi ?? []).filter((e) => e.dal && (e.al ?? e.dal) >= today && (e.dal.slice(0, 7) === month || e.dal <= today))
          .sort((a, b) => String(a.dal).localeCompare(String(b.dal))));
      }).catch(() => setList([]));
  }, []);
  if (!list?.length) return null;
  const monthName = new Date().toLocaleDateString("it-IT", { month: "long" });
  return (
    <>
      <div className="home-events-head">
        <h2>📅 Eventi di {monthName}</h2>
        <Link to="/eventi" className="small">Tutti gli eventi →</Link>
      </div>
      <div className="panel home-events">
      {list.map((e, i) => {
        const t = typeOf(e.tipo); const Icon = t.icon;
        return (
          <a key={i} className="he-row" href={e.link} target="_blank" rel="noopener noreferrer" style={{ ["--c" as string]: t.color }}>
            <span className="he-date"><strong>{fmt(e.dal!).split(" ")[0]}</strong><small>{fmt(e.dal!).split(" ")[1]}</small></span>
            <span className="he-body"><strong>{e.titolo}</strong><small><Icon size={12} /> {t.one} · {e.dove}</small></span>
            <ExternalLink size={16} className="he-go" />
          </a>
        );
      })}
      </div>
    </>
  );
}
