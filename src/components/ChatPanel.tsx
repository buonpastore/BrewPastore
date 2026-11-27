import { UserAvatar } from "./UserAvatar";
import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, Camera, Check, Plus, Trash2, X } from "lucide-react";
import { supabase, errMsg, dateTime, openFile, type Row } from "../lib";
import { useAuth } from "../auth";

interface Props { recipeId?: string; batchId?: string; title?: string }

const NEED_0021 = "Per foto e sondaggi in chat esegui prima 0021_chat_foto_sondaggi.sql su Supabase";

/** Riduce la foto (lato lungo 1600 px, JPEG) prima di caricarla. */
async function shrink(file: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok) => c.toBlob((b) => ok(b ?? file), "image/jpeg", 0.82));
  } catch { return file; }
}

// indirizzi temporanei delle foto (il bucket è privato)
const urlCache = new Map<string, string>();
function ChatImage({ path }: { path: string }) {
  const [url, setUrl] = useState(urlCache.get(path) ?? "");
  useEffect(() => {
    if (urlCache.has(path)) return;
    supabase.storage.from("documents").createSignedUrl(path, 3600).then(({ data }) => {
      if (data?.signedUrl) { urlCache.set(path, data.signedUrl); setUrl(data.signedUrl); }
    });
  }, [path]);
  return (
    <button type="button" className="msg-img" onClick={() => openFile(path).catch(() => undefined)}>
      {url ? <img src={url} alt="Foto" loading="lazy" /> : <span className="muted small">Carico la foto…</span>}
    </button>
  );
}

interface PollData { poll: Row; options: Row[]; votes: Row[] }

function PollCard({ data, me, reload }: { data: PollData; me?: string; reload: () => void }) {
  const { nameOf } = useAuth();
  const [adding, setAdding] = useState("");
  const { poll, options, votes } = data;
  const voters = new Set(votes.map((v) => v.user_id));
  const max = Math.max(1, ...options.map((o) => votes.filter((v) => v.option_id === o.id).length));

  const vote = async (o: Row) => {
    const mine = votes.some((v) => v.option_id === o.id && v.user_id === me);
    if (mine) {
      const { error } = await supabase.from("poll_votes").delete().eq("option_id", o.id).eq("user_id", me!);
      if (error) return alert(errMsg(error));
    } else {
      // risposta unica: tolgo il voto dato a un'altra opzione
      if (!poll.multi) await supabase.from("poll_votes").delete().eq("poll_id", poll.id).eq("user_id", me!);
      const { error } = await supabase.from("poll_votes").insert({ option_id: o.id, poll_id: poll.id });
      if (error) return alert(errMsg(error));
    }
    reload();
  };
  const addOption = async () => {
    const t = adding.trim();
    if (!t) return;
    const { error } = await supabase.from("poll_options").insert({ poll_id: poll.id, text: t.slice(0, 120) });
    if (error) return alert(errMsg(error));
    setAdding(""); reload();
  };
  const removeOption = async (o: Row) => {
    if (!confirm(`Togliere l'opzione «${o.text}»?`)) return;
    await supabase.from("poll_options").delete().eq("id", o.id);
    reload();
  };

  return (
    <div className="poll">
      <div className="poll-q"><BarChart3 size={16} /> <strong>{poll.question}</strong></div>
      <div className="poll-meta muted small">{poll.multi ? "Puoi scegliere più risposte" : "Una risposta"} · {voters.size} {voters.size === 1 ? "ha votato" : "hanno votato"}</div>
      <div className="poll-opts">
        {options.map((o) => {
          const vs = votes.filter((v) => v.option_id === o.id);
          const mine = vs.some((v) => v.user_id === me);
          return (
            <div key={o.id} className={"poll-opt" + (mine ? " mine" : "")}>
              <button type="button" className="poll-vote" onClick={() => vote(o)}>
                <span className="poll-bar" style={{ width: `${(vs.length / max) * 100}%` }} />
                <span className="poll-check">{mine ? <Check size={15} /> : null}</span>
                <span className="poll-text">{o.text}</span>
                <span className="poll-voters">{vs.slice(0, 4).map((v) => <UserAvatar key={v.user_id} id={v.user_id} size={18} />)}</span>
                <span className="poll-n">{vs.length}</span>
              </button>
              {o.created_by === me && !vs.length && <button type="button" className="icon tiny" title="Togli opzione" onClick={() => removeOption(o)}><X size={14} /></button>}
            </div>
          );
        })}
      </div>
      <div className="poll-add">
        <input value={adding} placeholder="Aggiungi un'opzione…" onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }} />
        <button type="button" className="btn small" disabled={!adding.trim()} onClick={addOption}><Plus size={15} /></button>
      </div>
      {votes.length > 0 && <div className="poll-who muted small">{[...voters].map((u) => nameOf(u)).join(", ")}</div>}
    </div>
  );
}

function NewPoll({ onClose, onCreate }: { onClose: () => void; onCreate: (q: string, opts: string[], multi: boolean) => Promise<void> }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [busy, setBusy] = useState(false);
  const ok = q.trim() && opts.filter((o) => o.trim()).length >= 1;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal poll-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nuovo sondaggio</h2>
        <label className="block"><span>Domanda</span><input autoFocus value={q} maxLength={300} placeholder="es. Quale birra facciamo a dicembre?" onChange={(e) => setQ(e.target.value)} /></label>
        <span className="nb-label">Opzioni (gli altri potranno aggiungerne)</span>
        <div className="poll-new-opts">
          {opts.map((o, i) => (
            <div key={i} className="poll-new-opt">
              <input value={o} maxLength={120} placeholder={`Opzione ${i + 1}`} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} />
              {opts.length > 1 && <button type="button" className="icon" onClick={() => setOpts(opts.filter((_, j) => j !== i))}><Trash2 size={16} /></button>}
            </div>
          ))}
        </div>
        <button type="button" className="btn small" onClick={() => setOpts([...opts, ""])}><Plus size={15} /> Altra opzione</button>
        <label className="check"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> Si possono scegliere più risposte</label>
        <div className="row-actions">
          <button className="btn primary" disabled={!ok || busy} onClick={async () => { setBusy(true); await onCreate(q.trim(), opts.map((o) => o.trim()).filter(Boolean), multi); setBusy(false); }}>Crea sondaggio</button>
          <button className="btn" onClick={onClose}>Annulla</button>
        </div>
      </div>
    </div>
  );
}

/** Chat in tempo reale, con foto e sondaggi. Senza recipeId/batchId è la chat generale. */
export function ChatPanel({ recipeId, batchId }: Props) {
  const { session, nameOf, isAdmin } = useAuth();
  const [msgs, setMsgs] = useState<Row[]>([]);
  const [polls, setPolls] = useState<Record<string, PollData>>({});
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const me = session?.user.id;

  const loadPolls = useCallback(async (ids?: string[]) => {
    const { data: ps, error } = await supabase.from("polls").select("*");
    if (error || !ps) return;   // tabella non ancora creata (0021)
    const mine = ids ? ps.filter((p) => ids.includes(p.message_id)) : ps;
    if (!mine.length) return setPolls({});
    const pids = mine.map((p) => p.id);
    const [{ data: os }, { data: vs }] = await Promise.all([
      supabase.from("poll_options").select("*").in("poll_id", pids).order("created_at"),
      supabase.from("poll_votes").select("*").in("poll_id", pids),
    ]);
    setPolls(Object.fromEntries(mine.map((p) => [p.message_id, { poll: p, options: (os ?? []).filter((o) => o.poll_id === p.id), votes: (vs ?? []).filter((v) => v.poll_id === p.id) }])));
  }, []);

  useEffect(() => {
    let q = supabase.from("messages").select("*").order("created_at", { ascending: true }).limit(500);
    q = recipeId ? q.eq("recipe_id", recipeId) : q.is("recipe_id", null);
    q = batchId ? q.eq("batch_id", batchId) : q.is("batch_id", null);
    q.then(({ data }) => { setMsgs(data ?? []); loadPolls((data ?? []).map((m) => m.id)); });

    const belongs = (m: Row) => (m.recipe_id ?? null) === (recipeId ?? null) && (m.batch_id ?? null) === (batchId ?? null);
    const ch = supabase
      .channel(`chat-${recipeId ?? ""}-${batchId ?? ""}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Row;
        if (belongs(m)) { setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])); window.setTimeout(() => loadPolls(), 800); }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        setMsgs((prev) => prev.filter((x) => x.id !== (payload.old as Row).id));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes" }, () => loadPolls())
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_options" }, () => loadPolls())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [recipeId, batchId, loadPolls]);

  // sempre in fondo, sull'ultimo messaggio (anche dopo che le foto si sono caricate)
  const listRef = useRef<HTMLDivElement>(null);
  const firstScroll = useRef(true);
  useEffect(() => {
    if (!msgs.length) return;
    const toEnd = () => {
      const el = listRef.current; if (el) el.scrollTop = el.scrollHeight;
      if (firstScroll.current) endRef.current?.scrollIntoView({ block: "end" });
    };
    toEnd();
    const t1 = window.setTimeout(toEnd, 300), t2 = window.setTimeout(() => { toEnd(); firstScroll.current = false; }, 1200);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [msgs.length]);

  const post = async (row: Row) => {
    const { data, error } = await supabase.from("messages").insert({ recipe_id: recipeId ?? null, batch_id: batchId ?? null, ...row }).select().single();
    if (error) throw error;
    setMsgs((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data]));
    return data as Row;
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError("");
    try { await post({ body }); setText(""); } catch (err) { setError(errMsg(err)); }
  };

  const sendPhoto = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f || !me) return;
    setError(""); setSending(true);
    try {
      const blob = await shrink(f);
      const path = `chat/${me}/${Date.now()}.jpg`;
      const { error: up } = await supabase.storage.from("documents").upload(path, blob, { contentType: "image/jpeg" });
      if (up) throw up;
      try { await post({ body: text.trim() || "📷 Foto", image_path: path }); setText(""); }
      catch (err) { await supabase.storage.from("documents").remove([path]); throw err; }
    } catch (err) {
      const m = errMsg(err);
      setError(/image_path|row-level|policy/i.test(m) ? NEED_0021 : m);
    } finally { setSending(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const createPoll = async (question: string, opts: string[], multi: boolean) => {
    setError("");
    try {
      const m = await post({ body: `📊 ${question}` });
      const { data: p, error: e1 } = await supabase.from("polls").insert({ message_id: m.id, question, multi }).select().single();
      if (e1) { await supabase.from("messages").delete().eq("id", m.id); setMsgs((prev) => prev.filter((x) => x.id !== m.id)); throw e1; }
      if (opts.length) {
        const { error: e2 } = await supabase.from("poll_options").insert(opts.map((t) => ({ poll_id: p.id, text: t })));
        if (e2) throw e2;
      }
      setPollOpen(false);
      loadPolls();
    } catch (err) {
      const m = errMsg(err);
      setError(/polls|poll_options|schema cache/i.test(m) ? NEED_0021 : m);
      setPollOpen(false);
    }
  };

  const remove = async (m: Row) => {
    if (!confirm("Eliminare il messaggio?")) return;
    await supabase.from("messages").delete().eq("id", m.id);
    if (m.image_path) await supabase.storage.from("documents").remove([m.image_path]);
    setMsgs((prev) => prev.filter((x) => x.id !== m.id));
  };

  return (
    <div className="chat">
      <div className="chat-msgs" ref={listRef} onLoadCapture={() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }}>
        {msgs.length === 0 && <p className="muted">Nessun messaggio. Scrivi il primo!</p>}
        {msgs.map((m) => {
          const poll = polls[m.id];
          return (
            <div key={m.id} className={"msg" + (m.user_id === me ? " mine" : "") + (poll ? " has-poll" : "")}>
              <div className="msg-head">
                <UserAvatar id={m.user_id} size={22} /> <strong>{nameOf(m.user_id)}</strong> <span className="muted small">{dateTime(m.created_at)}</span>
                {(m.user_id === me || isAdmin) && <button className="icon tiny" onClick={() => remove(m)}>✕</button>}
              </div>
              {m.image_path && <ChatImage path={m.image_path} />}
              {poll ? <PollCard data={poll} me={me} reload={() => loadPolls()} />
                : !(m.image_path && m.body === "📷 Foto") && <div className="pre">{m.body}</div>}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form className="chat-form" onSubmit={send}>
        <div className="chat-tools">
          <button type="button" className="chat-tool" title="Manda una foto" disabled={sending} onClick={() => fileRef.current?.click()}><Camera size={20} /></button>
          <button type="button" className="chat-tool" title="Crea un sondaggio" onClick={() => setPollOpen(true)}><BarChart3 size={20} /></button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => sendPhoto(e.target.files)} />
        </div>
        <textarea
          rows={2} value={text} placeholder={sending ? "Invio la foto…" : "Scrivi… (Invio per mandare, Shift+Invio per andare a capo)"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } }}
        />
        <button className="btn primary" disabled={sending}>Invia</button>
      </form>
      {error && <p className="error">{error}</p>}
      {pollOpen && <NewPoll onClose={() => setPollOpen(false)} onCreate={createPoll} />}
    </div>
  );
}
