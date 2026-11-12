import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import {
  House, BookOpen, Beer, Receipt, Wheat, Wallet, Wrench, MessageCircle, Settings, LogOut, Star, Coins,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "../lib";
import { useAuth } from "../auth";
import { QuotePopup } from "./QuoteOfTheDay";

interface Tab { to: string; label: string; icon: LucideIcon; color: string }
interface Group { key: string; label: string; icon: LucideIcon; to: string; color: string; tabs?: Tab[] }

export const GROUPS: Group[] = [
  { key: "home", label: "Home", icon: House, to: "/", color: "var(--gold)" },
  {
    key: "produzione", label: "Produzione", icon: Beer, to: "/ricette", color: "var(--teal)",
    tabs: [
      { to: "/ricette", label: "Ricette", icon: BookOpen, color: "var(--teal)" },
      { to: "/batch", label: "Batch", icon: Beer, color: "var(--gold)" },
      { to: "/degustazioni", label: "Degustazioni", icon: Star, color: "var(--magenta)" },
    ],
  },
  {
    key: "conti", label: "Conti", icon: Coins, to: "/spese", color: "var(--hop)",
    tabs: [
      { to: "/spese", label: "Spese condivise", icon: Wallet, color: "var(--hop)" },
      { to: "/acquisti", label: "Acquisti", icon: Receipt, color: "var(--teal)" },
      { to: "/materie-prime", label: "Materie prime", icon: Wheat, color: "var(--gold)" },
      { to: "/impianto", label: "Preventivi impianto", icon: Wrench, color: "var(--magenta)" },
    ],
  },
  { key: "chat", label: "Chat", icon: MessageCircle, to: "/chat", color: "var(--magenta)" },
  { key: "impostazioni", label: "Impostazioni", icon: Settings, to: "/impostazioni", color: "var(--muted)" },
];

function groupOf(path: string): Group {
  if (path === "/") return GROUPS[0];
  return GROUPS.find((g) => g.key !== "home" && (path.startsWith(g.to) || g.tabs?.some((t) => path.startsWith(t.to)))) ?? GROUPS[0];
}

function initials(name?: string) {
  return (name ?? "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function Layout() {
  const { profile, isAdmin } = useAuth();
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  const current = groupOf(loc.pathname);

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
        {GROUPS.map((g) => {
          const Icon = g.icon;
          const active = current.key === g.key;
          return (
            <div key={g.key}>
              <NavLink to={g.to} end={g.to === "/"} className={active ? "active" : ""} style={{ ["--c" as string]: g.color }}>
                <Icon size={19} strokeWidth={2} /> <span>{g.label}</span>
              </NavLink>
              {g.tabs && active && (
                <div className="sub">
                  {g.tabs.map((t) => <NavLink key={t.to} to={t.to}>{t.label}</NavLink>)}
                </div>
              )}
            </div>
          );
        })}
        <div className="sidebar-foot">
          <button className="sidebar-logout" onClick={() => supabase.auth.signOut()}><LogOut size={17} /> Esci</button>
        </div>
      </nav>

      <main className="content">
        {current.tabs && (
          <>
            <div className="section-title">{current.label}</div>
            <nav className="section-tabs">
              {current.tabs.map(({ to, label, icon: Icon, color }) => (
                <NavLink key={to} to={to} style={{ ["--c" as string]: color }} className={loc.pathname.startsWith(to) ? "active" : ""}>
                  <Icon size={16} /> {label}
                </NavLink>
              ))}
            </nav>
          </>
        )}
        <Outlet />
      </main>

      {/* navigazione stile app su telefono */}
      <nav className="bottom-nav">
        {GROUPS.map((g) => {
          const Icon = g.icon;
          const active = current.key === g.key;
          return (
            <NavLink key={g.key} to={g.to} end={g.to === "/"} className={active ? "active" : ""}>
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
              <span>{g.label}</span>
            </NavLink>
          );
        })}
      </nav>

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
