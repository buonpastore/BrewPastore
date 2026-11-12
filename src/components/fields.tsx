import type { Row } from "../lib";

export type FieldType = "text" | "textarea" | "number" | "date" | "datetime" | "select" | "checkbox";

export interface FieldDef {
  key: string;
  label: string;
  type?: FieldType;
  options?: { value: string; label: string }[] | string[];
  step?: string;
  placeholder?: string;
  required?: boolean;
  /** come mostrare il valore in sola lettura */
  render?: (v: unknown, row: Row) => React.ReactNode;
  wide?: boolean;
}

export function optionList(o: FieldDef["options"]) {
  return (o ?? []).map((x) => (typeof x === "string" ? { value: x, label: x } : x));
}

/** converte il valore dell'input nel tipo giusto per il database */
export function toDb(f: FieldDef, raw: unknown): unknown {
  if (f.type === "checkbox") return Boolean(raw);
  if (raw === "" || raw === undefined) return null;
  if (f.type === "number") return Number(String(raw).replace(",", "."));
  if (f.type === "datetime") return new Date(String(raw)).toISOString();
  return raw;
}

function toInput(f: FieldDef, v: unknown): string {
  if (v == null) return "";
  if (f.type === "datetime") {
    const d = new Date(String(v));
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return String(v);
}

export function FieldInput({ f, value, onChange }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const common = { id: f.key, required: f.required, placeholder: f.placeholder };
  switch (f.type) {
    case "textarea":
      return <textarea {...common} rows={4} value={toInput(f, value)} onChange={(e) => onChange(e.target.value)} />;
    case "select":
      return (
        <select {...common} value={toInput(f, value)} onChange={(e) => onChange(e.target.value)}>
          {!f.required && <option value="">—</option>}
          {optionList(f.options).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case "checkbox":
      return <input id={f.key} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
    case "number":
      return <input {...common} type="number" step={f.step ?? "any"} inputMode="decimal" value={toInput(f, value)} onChange={(e) => onChange(e.target.value)} />;
    case "date":
      return <input {...common} type="date" value={toInput(f, value).slice(0, 10)} onChange={(e) => onChange(e.target.value)} />;
    case "datetime":
      return <input {...common} type="datetime-local" value={toInput(f, value)} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <input {...common} type="text" value={toInput(f, value)} onChange={(e) => onChange(e.target.value)} />;
  }
}

export function display(f: FieldDef, row: Row): React.ReactNode {
  const v = row[f.key];
  if (f.render) return f.render(v, row);
  if (v == null || v === "") return <span className="muted">—</span>;
  if (f.type === "checkbox") return v ? "Sì" : "No";
  if (f.type === "date") return new Date(String(v)).toLocaleDateString("it-IT");
  if (f.type === "datetime") return new Date(String(v)).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
  if (f.type === "select") return optionList(f.options).find((o) => o.value === v)?.label ?? String(v);
  if (f.type === "number") return Number(v).toLocaleString("it-IT", { maximumFractionDigits: 4 });
  return String(v);
}
