import { useEffect, useState } from "react";
import { ClipboardList, ChevronDown, ChevronRight, Paperclip, Send, Trash2, CircleDot, Loader, CheckCircle2, X } from "lucide-react";
import { supabase, uploadFile, openFile, errMsg, date, type Row } from "../lib";
import { useAuth } from "../auth";

/* Task: le cose da fare. Ognuno può crearle e assegnarle; chiunque cambia lo stato e aggiunge note, file o foto.
   Stati: inserita → in corso → terminata (le terminate vanno nello storico). */

const STATES: { key: string; label: string; icon: typeof CircleDot; cls: string }[] = [
  { key: "inserita", label: "Inserita", icon: CircleDot, cls: "ts-new" },
  { key: "in_corso", label: "In corso", icon: Loader, cls: "ts-doing" },
  { key: "terminata", label: "Terminata", icon: CheckCircle2, cls: "ts-done" },
];
const stateOf = (k: string) => STATES.find((s) => s.key === k) ?? STATES[0];

export function Tasks() {
  const { session, profiles, nameOf } = useAuth();
  const me = session!.user.id;
  const [tasks, setTasks] = useState<Row[] | null>(null);
  const [notesCount, setNotesCount] = useState<Record<string, number>>({});
  const [err, setErr] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const refresh = () => setReload((x) => x + 1);

  useEffect(() => {
    supabase.from("tasks").select("*").order("created_at", { ascending: false }).then(({ data, error }) => {
      if (error) { setErr(/tasks|relation|schema cache/i.test(error.message) ? "Manca un aggiornamento del database: esegui su Supabase il file 0013_task.sql." : errMsg(error)); setTasks([]); return; }
      setTasks(data ?? []);
    });
    supabase.from("task_notes").select("task_id").then(({ data }) => {
      const c: Record<string, number> = {};
      for (const n of data ?? []) c[n.task_id] = (c[n.task_id] ?? 0) + 1;
      setNotesCount(c);
    });
  }, [reload]);

  const list = (tasks ?? []).filter((t) => !onlyMine || t.assignee === me || t.created_by === me);
  const active = list.filter((t) => t.status !== "terminata").sort((a, b) => Number(b.status === "in_corso") - Number(a.status === "in_corso"));
  const done = list.filter((t) => t.status === "terminata").sort((a, b) => String(b.done_at ?? b.updated_at).localeCompare(String(a.done_at ?? a.updated_at)));
  const open = (tasks ?? []).find((t) => t.id === openId) ?? null;

  const Item = ({ t }: { t: Row }) => {
    const st = stateOf(t.status), Icon = st.icon;
    return (
      <button className={"tk-item " + st.cls} onClick={() => setOpenId(t.id)}>
        <Icon size={20} className="tk-ico" />
        <span className="tk-body">
          <strong>{t.title}</strong>
          <span className="muted small">
            {t.assignee ? <>per <b>{nameOf(t.assignee)}{t.assignee === me ? " (tu)" : ""}</b></> : "da assegnare"}
            {t.due_date && <> · entro il {date(t.due_date)}</>}
            {notesCount[t.id] ? <> · {notesCount[t.id]} note</> : null}
          </span>
        </span>
        <span className={"tk-badge " + st.cls}>{st.label}</span>
      </button>
    );
  };

  return (
    <div>
      <div className="page-head"><h1>Task</h1></div>
      <button className="btn primary btn-wide" onClick={() => setEditing({ title: "", description: "", assignee: me, status: "inserita", due_date: null })}>
        <ClipboardList size={20} /> Nuova task
      </button>
      {err && <p className="error">{err}</p>}
      <div className="view-switch">
        <button className={"mini-btn" + (!onlyMine ? " on" : "")} onClick={() => setOnlyMine(false)}><span>Tutte</span></button>
        <button className={"mini-btn" + (onlyMine ? " on" : "")} onClick={() => setOnlyMine(true)}><span>Le mie</span></button>
      </div>

      {tasks === null ? <p className="muted">Caricamento…</p> : (
        <>
          {active.length ? <div className="tk-list">{active.map((t) => <Item key={t.id} t={t} />)}</div>
            : <p className="muted">Nessuna cosa da fare 🍻</p>}
          {done.length > 0 && (
            <>
              <button className="xp-hist-btn" onClick={() => setShowHistory(!showHistory)}>
                {showHistory ? <ChevronDown size={18} /> : <ChevronRight size={18} />} Storico ({done.length} terminate)
              </button>
              {showHistory && <div className="tk-list">{done.map((t) => <Item key={t.id} t={t} />)}</div>}
            </>
          )}
        </>
      )}

      {editing && <TaskForm initial={editing} profiles={profiles as Row[]} onClose={() => setEditing(null)} onSaved={refresh} />}
      {open && <TaskDetail task={open} me={me} onClose={() => setOpenId(null)} onChanged={refresh} onEdit={() => { setEditing(open); setOpenId(null); }} />}
    </div>
  );
}

function TaskForm({ initial, profiles, onClose, onSaved }: { initial: Row; profiles: Row[]; onClose: () => void; onSaved: () => void }) {
  const [t, setT] = useState<Row>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (!String(t.title ?? "").trim()) return setError("Scrivi cosa c'è da fare");
    setBusy(true);
    const row = { title: t.title.trim(), description: t.description || null, assignee: t.assignee || null, due_date: t.due_date || null, updated_at: new Date().toISOString() };
    const { error } = t.id ? await supabase.from("tasks").update(row).eq("id", t.id) : await supabase.from("tasks").insert(row);
    setBusy(false);
    if (error) return setError(/tasks|relation|schema cache/i.test(error.message) ? "Manca un aggiornamento del database: esegui su Supabase il file 0013_task.sql." : errMsg(error));
    onSaved(); onClose();
  };
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={save}>
        <h2>{t.id ? "Modifica task" : "📋 Nuova task"}</h2>
        <label className="block"><span>Cosa c'è da fare</span><input autoFocus value={t.title ?? ""} onChange={(e) => setT({ ...t, title: e.target.value })} placeholder="es. Ordinare il lievito per la Weiss" /></label>
        <label className="block"><span>Dettagli (facoltativi)</span><textarea rows={3} value={t.description ?? ""} onChange={(e) => setT({ ...t, description: e.target.value })} /></label>
        <span className="nb-label">Chi la deve fare</span>
        <div className="tk-who">
          {profiles.map((p) => (
            <button key={p.id} type="button" className={"pay-method" + (t.assignee === p.id ? " on" : "")} onClick={() => setT({ ...t, assignee: p.id })}>{p.display_name}</button>
          ))}
        </div>
        <label className="block"><span>Entro il (facoltativo)</span><input type="date" value={t.due_date ?? ""} onChange={(e) => setT({ ...t, due_date: e.target.value || null })} /></label>
        {error && <p className="error">{error}</p>}
        <div className="qe-sheet-btns">
          <button type="button" className="btn" onClick={onClose}>Annulla</button>
          <button className="btn primary" disabled={busy}>{busy ? "Salvo…" : "Salva"}</button>
        </div>
      </form>
    </div>
  );
}

function TaskDetail({ task, me, onClose, onChanged, onEdit }: { task: Row; me: string; onClose: () => void; onChanged: () => void; onEdit: () => void }) {
  const { nameOf, isAdmin } = useAuth();
  const [notes, setNotes] = useState<Row[]>([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    supabase.from("task_notes").select("*").eq("task_id", task.id).order("created_at").then(({ data }) => setNotes(data ?? []));
  }, [task.id, reload]);

  const setStatus = async (status: string) => {
    const { error } = await supabase.from("tasks").update({ status, updated_at: new Date().toISOString(), done_at: status === "terminata" ? new Date().toISOString() : null }).eq("id", task.id);
    if (error) return alert(errMsg(error));
    onChanged();
  };
  const addNote = async () => {
    if (!text.trim() && !file) return;
    setBusy(true);
    try {
      const file_path = file ? await uploadFile(`tasks/${me}`, file) : null;
      const { error } = await supabase.from("task_notes").insert({ task_id: task.id, body: text.trim() || null, file_path });
      if (error) throw error;
      setText(""); setFile(null); setReload((x) => x + 1); onChanged();
    } catch (e) { alert(errMsg(e)); }
    setBusy(false);
  };
  const delNote = async (n: Row) => {
    if (!confirm("Eliminare questa nota?")) return;
    const { error } = await supabase.from("task_notes").delete().eq("id", n.id);
    if (error) return alert(errMsg(error));
    setReload((x) => x + 1); onChanged();
  };
  const delTask = async () => {
    if (!confirm(`Eliminare la task «${task.title}» con tutte le sue note?`)) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) return alert(errMsg(error));
    onChanged(); onClose();
  };
  const isImg = (p: string) => /\.(png|jpe?g|webp|gif|heic)$/i.test(p);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal tk-detail" onClick={(e) => e.stopPropagation()}>
        <div className="tk-detail-head">
          <h2>{task.title}</h2>
          <button className="icon" onClick={onClose} aria-label="Chiudi"><X size={22} /></button>
        </div>
        <p className="muted small">
          {task.assignee ? <>Per <b>{nameOf(task.assignee)}</b></> : "Da assegnare"} · creata da {nameOf(task.created_by)} il {date(task.created_at)}
          {task.due_date && <> · entro il {date(task.due_date)}</>}
        </p>
        {task.description && <p className="tk-desc">{task.description}</p>}

        <span className="nb-label">Stato</span>
        <div className="tk-states">
          {STATES.map((s) => { const Icon = s.icon; return (
            <button key={s.key} className={"tk-state " + s.cls + (task.status === s.key ? " on" : "")} onClick={() => setStatus(s.key)}><Icon size={18} /> {s.label}</button>
          ); })}
        </div>

        <span className="nb-label">Note</span>
        <div className="tk-notes">
          {notes.map((n) => (
            <div key={n.id} className={"tk-note" + (n.user_id === me ? " mine" : "")}>
              <div className="tk-note-head"><b>{nameOf(n.user_id)}</b><span className="muted small">{new Date(n.created_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                {(n.user_id === me || isAdmin) && <button className="icon tiny" onClick={() => delNote(n)} aria-label="Elimina nota"><Trash2 size={14} /></button>}</div>
              {n.body && <p>{n.body}</p>}
              {n.file_path && (
                <button className="tk-file" onClick={() => openFile(n.file_path)}>
                  <Paperclip size={14} /> {isImg(n.file_path) ? "Foto" : "File"}: {n.file_path.split("/").pop()?.replace(/^\d{10,}[-_]?/, "")}
                </button>
              )}
            </div>
          ))}
          {!notes.length && <p className="muted small">Nessuna nota.</p>}
        </div>
        <div className="tk-add">
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Scrivi una nota…" />
          <div className="tk-add-row">
            <label className="mini-btn"><Paperclip size={14} /> <span>{file ? file.name.slice(0, 18) : "Foto o file"}</span>
              <input type="file" hidden accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
            <button className="btn primary" disabled={busy || (!text.trim() && !file)} onClick={addNote}><Send size={16} /> {busy ? "Invio…" : "Aggiungi"}</button>
          </div>
        </div>

        <div className="row-actions" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onEdit}>✏️ Modifica</button>
          {(task.created_by === me || isAdmin) && <button className="btn danger" onClick={delTask}>🗑️ Elimina</button>}
        </div>
      </div>
    </div>
  );
}
