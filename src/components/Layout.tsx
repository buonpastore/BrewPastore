import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  House, BookOpen, Beer, Receipt, Wheat, Wallet, Wrench, MessageCircle, Settings, Ellipsis, LogOut, ChevronRight, X,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "../lib";
import { useAuth } from "../auth";
import { QuotePopup } from "./QuoteOfTheDay";

interface NavItem { to: string; label: string; icon: LucideIcon; color: string }

export const NAV: NavItem[] = [
  { to: "/", label: "Home", icon: House, color: "var(--gold)" },
  { to: "/ricette", label: "Ricette", icon: BookOpen, color: "var(--teal)" },
  { to: "/batch", label: "Batch", icon: Beer, color: "var(--gold)" },
  { to: "/chat", label: "Chat", icon: MessageCircle, color: "var(--magenta)" },
  { to: "/spese", label: "Spese condivise", icon: Wallet, color: "var(--hop)" },
  { to: "/acquisti", label: "Acquisti", icon: Receipt, color: "var(--teal)" },
  { to: "/materie-prime", label: "Materie prime", icon: Wheat, color: "var(--gold)" },
  { to: "/impianto", label: "Preventivi impianto", icon: Wrench, color: "var(--magenta)" },
  { to: "/impostazioni", label: "Impostazioni e storico", icon: Settings, color: "var(--muted)" },
];
// barra in basso su telefono: le 4 sezioni più usate + "Altro"
const BOTTOM = ["/", "/ricette", "/batch", "/chat"];

function initials(name?: string) {
  return (name ?? "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function Layout() {
  const { profile, isAdmin } = useAuth();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  useEffect(() => { setMore(false); window.scrollTo(0, 0); }, [loc.pathname]);

  const isActive = (to: string) => (to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to));
  const inMore = !BOTTOM.some(isActive);

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-logo">🐑</span>
          <span className="brand-text">
            <span className="brand-name">BrewPastore</span>
            <span className="brand-tag">birra da pascolo</span>
          </span>
        </NavLink>
        <div className="user">
          <span className="user-name">{profile?.display_name}</span>
          {isAdmin && <span className="badge admin">admin</span>}
          <NavLink to="/impostazioni" className="avatar" title="Profilo">{initials(profile?.display_name)}</NavLink>
          <button className="icon-btn desktop-only" title="Esci" onClick={() => supabase.auth.signOut()}><LogOut size={18} /></button>
        </div>
      </header>

      <nav className="sidebar">
        {NAV.map(({ to, label, icon: Icon, color }) => (
          <NavLink key={to} to={to} end={to === "/"} style={{ ["--c" as string]: color }}>
            <Icon size={19} strokeWidth={2} /> <span>{label}</span>
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <button className="sidebar-logout" onClick={() => supabase.auth.signOut()}><LogOut size={17} /> Esci</button>
        </div>
      </nav>

      <main className="content">
        <Outlet />
      </main>

      {/* navigazione stile app su telefono */}
      <nav className="bottom-nav">
        {NAV.filter((n) => BOTTOM.includes(n.to)).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className={isActive(to) ? "active" : ""}>
            <Icon size={22} strokeWidth={isActive(to) ? 2.4 : 1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button className={inMore || more ? "active" : ""} onClick={() => setMore(true)}>
          <Ellipsis size={22} strokeWidth={inMore ? 2.4 : 1.8} />
          <span>Altro</span>
        </button>
      </nav>

      {more && (
        <div className="sheet-backdrop" onClick={() => setMore(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-head">
              <strong>Tutte le sezioni</strong>
              <button className="icon-btn" onClick={() => setMore(false)} aria-label="Chiudi"><X size={20} /></button>
            </div>
            <div className="sheet-list">
              {NAV.filter((n) => !BOTTOM.includes(n.to)).map(({ to, label, icon: Icon, color }) => (
                <NavLink key={to} to={to} style={{ ["--c" as string]: color }}>
                  <span className="sheet-ico"><Icon size={20} /></span>
                  <span>{label}</span>
                  <ChevronRight size={18} className="muted" />
                </NavLink>
              ))}
              <button className="sheet-logout" onClick={() => supabase.auth.signOut()}>
                <span className="sheet-ico"><LogOut size={20} /></span><span>Esci</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
