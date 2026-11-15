import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { num } from "../lib";

/** Campo numerico con − e + ai lati (stile app). */
export function Stepper({ label, value, step, digits, onChange, unit, gravity, max }: { label: string; value: number; step: number; digits: number; onChange: (n: number) => void; unit?: string; gravity?: boolean; max?: number }) {
  // la densità si scrive come sul densimetro: 1.050
  const fmt = (v: number) => (gravity ? v.toFixed(3) : unit === "€" ? v.toFixed(2).replace(".", ",") : num(v, digits));
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value, digits]);
  const set = (n: number) => { const v = Math.min(max ?? Infinity, Math.max(0, Math.round(n / step) * step)); onChange(Number(v.toFixed(digits))); };
  return (
    <div className="ut-counter">
      <small>{label}</small>
      <div className="bf-row">
        <button type="button" className="bf-btn" onClick={() => set(value - step)}><Minus size={20} /></button>
        <div className="bf-input"><input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => set(Number(text.trim().replace(",", ".")) || 0)} />{unit && <span className="bf-unit">{unit}</span>}</div>
        <button type="button" className="bf-btn" onClick={() => set(value + step)}><Plus size={20} /></button>
      </div>
    </div>
  );
}
