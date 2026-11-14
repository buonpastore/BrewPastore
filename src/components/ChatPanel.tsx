import { UserAvatar } from "./UserAvatar";
import { useEffect, useRef, useState } from "react";
import { supabase, errMsg, dateTime, type Row } from "../lib";
import { useAuth } from "../auth";

interface Props { recipeId?: string; batchId?: string; title?: string }

/** Chat in tempo reale. Senza recipeId/batchId è la chat generale. */
export function ChatPanel({ recipeId, batchId }: Props) {
  const { session, nameOf, isAdmin } = useAuth();
  const [msgs, setMsgs] = useState<Row[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let q = supabase.from("messages").select("*").order("created_at", { ascending: true }).limit(500);
    q = recipeId ? q.eq("recipe_id", recipeId) : q.is("recipe_id", null);
    q = batchId ? q.eq("batch_id", batchId) : q.is("batch_id", null);
    q.then(({ data }) => setMsgs(data ?? []));

    const belongs = (m: Row) => (m.recipe_id ?? null) === (recipeId ?? null) && (m.batch_id ?? null) === (batchId ?? null);
    const ch = supabase
      .channel(`chat-${recipeId ?? ""}-${batchId ?? ""}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Row;
        if (belongs(m)) setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        setMsgs((prev) => prev.filter((x) => x.id !== (payload.old as Row).id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [recipeId, batchId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [msgs.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError("");
    const { data, error } = await supabase.from("messages")
      .insert({ body, recipe_id: recipeId ?? null, batch_id: batchId ?? null }).select().single();
    if (error) return setError(errMsg(error));
    setText("");
    setMsgs((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data]));
  };

  const remove = async (id: string) => {
    if (!confirm("Eliminare il messaggio?")) return;
    await supabase.from("messages").delete().eq("id", id);
    setMsgs((prev) => prev.filter((x) => x.id !== id));
  };

  const me = session?.user.id;
  return (
    <div className="chat">
      <div className="chat-msgs">
        {msgs.length === 0 && <p className="muted">Nessun messaggio. Scrivi il primo!</p>}
        {msgs.map((m) => (
          <div key={m.id} className={"msg" + (m.user_id === me ? " mine" : "")}>
            <div className="msg-head">
              <UserAvatar id={m.user_id} size={22} /> <strong>{nameOf(m.user_id)}</strong> <span className="muted small">{dateTime(m.created_at)}</span>
              {(m.user_id === me || isAdmin) && <button className="icon tiny" onClick={() => remove(m.id)}>✕</button>}
            </div>
            <div className="pre">{m.body}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="chat-form" onSubmit={send}>
        <textarea
          rows={2} value={text} placeholder="Scrivi… (Invio per mandare, Shift+Invio per andare a capo)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } }}
        />
        <button className="btn primary">Invia</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
