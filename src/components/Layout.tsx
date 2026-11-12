import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { supabase } from "../lib";
import { useAuth } from "../auth";
import { QuotePopup } from "./QuoteOfTheDay";

const LINKS = [
  ["/", "🏠 Home"],
  ["/ricette", "📖 Ricette"],
  ["/batch", "🍺 Batch"],
  ["/acquisti", "🧾 Acquisti"],
  ["/materie-prime", "🌾 Materie prime"],
  ["/spese", "💶 Spese condivise"],
  ["/impianto", "🛠️ Preventivi impianto"],
  ["/chat", "💬 Chat"],
  ["/storico", "🕓 Storico versioni"],
  ["/impostazioni", "⚙️ Impostazioni"],
] as const;

export function Layout() {
  const { profile, isAdmin } = useAuth();
  const [menu, setMenu] = useState(false);
  return (
    <div className="app">
      <header className="topbar">
        <button className="icon menu-btn" onClick={() => setMenu(!menu)} aria-label="Menu">☰</button>
        <NavLink to="/" className="brand">🍺 BrewPastore</NavLink>
        <div className="user">
          <span>{profile?.display_name}</span>
          <span className={"badge " + (isAdmin ? "admin" : "")}>{isAdmin ? "admin" : "consultazione"}</span>
          <button className="btn small" onClick={() => supabase.auth.signOut()}>Esci</button>
        </div>
      </header>
      <nav className={"sidebar" + (menu ? " open" : "")} onClick={() => setMenu(false)}>
        {LINKS.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === "/"}>{label}</NavLink>
        ))}
      </nav>
      <main className="content">
        <Outlet />
      </main>
      <QuotePopup />
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: [string, string][]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={active === k} className={active === k ? "active" : ""} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}
