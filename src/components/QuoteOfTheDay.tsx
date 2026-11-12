import { useEffect, useState } from "react";
import { supabase, FACE_IMG, type Row } from "../lib";

const CAT: Record<string, string> = {
  curiosita: "🍺 Lo sapevi?",
  proverbio: "📜 Detto del birraio",
  battuta: "😄 Battuta",
  citazione: "💬 Citazione",
  consiglio: "🧪 Consiglio da birraio",
  storia: "🏛️ Un po' di storia",
};

const todayKey = () => new Date().toISOString().slice(0, 10);

export function useQuoteOfTheDay() {
  const [quote, setQuote] = useState<Row | null>(null);
  useEffect(() => {
    supabase.rpc("quote_of_the_day").then(({ data }) => setQuote(Array.isArray(data) ? data[0] ?? null : data));
  }, []);
  return quote;
}

export function QuoteCard({ quote, onAnother }: { quote: Row; onAnother?: () => void }) {
  return (
    <div className="quote">
      <div className="quote-cat">{CAT[quote.category] ?? "🍺"}</div>
      <blockquote>{quote.text}</blockquote>
      {quote.author && <div className="quote-author">— {quote.author}</div>}
      {onAnother && <button className="btn small" onClick={onAnother}>🎲 Un'altra!</button>}
    </div>
  );
}

/** Popup mostrato una volta al giorno dopo il login. */
export function QuotePopup() {
  const daily = useQuoteOfTheDay();
  const [quote, setQuote] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!daily) return;
    setQuote(daily);
    try {
      if (localStorage.getItem("brew-quote-seen") !== todayKey()) setOpen(true);
    } catch { setOpen(true); }
  }, [daily]);

  const close = () => {
    try { localStorage.setItem("brew-quote-seen", todayKey()); } catch { /* ignore */ }
    setOpen(false);
  };

  const another = async () => {
    const { data } = await supabase.rpc("random_quote");
    const q = Array.isArray(data) ? data[0] : data;
    if (q) setQuote(q);
  };

  if (!open || !quote) return null;
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal quote-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="La birra del giorno">
        <div className="quote-head sunburst">
          <img className="quote-mascot" src={FACE_IMG} alt="" />
          <h2>La birra del giorno</h2>
        </div>
        <div className="quote-body">
          <QuoteCard quote={quote} />
          <div className="row-actions center">
            <button className="btn" onClick={another}>🎲 Un'altra</button>
            <button className="btn primary" onClick={close}>Salute! 🍻</button>
          </div>
        </div>
      </div>
    </div>
  );
}
