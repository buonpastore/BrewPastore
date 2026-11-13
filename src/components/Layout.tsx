import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import {
  House, BookOpen, Beer, Wheat, Wallet, Wrench, MessageCircle, Settings, LogOut, Star, Coins,
  type LucideIcon,
  Calculator,
} from "lucide-react";
import { supabase, FACE_IMG } from "../lib";
import { useAuth } from "../auth";
import { QuotePopup } from "./QuoteOfTheDay";
import { UpdateBanner } from "./UpdateBanner";
import { VERSION_LABEL } from "../version";

interface Tab { to: string; label: string; icon: LucideIcon; color: string; also?: string[] }
interface Group { key: string; label: string; icon: LucideIcon; to: string; color: string; tabs?: Tab[] }

export const GROUPS: Group[] = [
  { key: "home", label: "Home", icon: House, to: "/", color: "var(--text)" },
  {
    key: "produzione", label: "Produzione", icon: Beer, to: "/ricette", color: "var(--gold)",
    tabs: [
      { to: "/ricette", label: "Ricette", icon: BookOpen, color: "var(--gold)" },
      { to: "/batch", label: "Batch", icon: Beer, color: "var(--teal)" },
      { to: "/degustazioni", label: "Degustazioni", icon: Star, color: "var(--magenta)" },
    ],
  },
  {
    key: "conti", label: "Conti", icon: Coins, to: "/costi", color: "var(--teal)",
    tabs: [
      { to: "/costi", label: "Costi birre", icon: Calculator, color: "var(--gold)" },
      { to: "/spese", label: "Spese condivise", icon: Wallet, color: "var(--teal)" },
      { to: "/materie-prime", label: "Materie prime", icon: Wheat, color: "var(--magenta)", also: ["/acquisti"] },
      { to: "/impianto", label: "Preventivi impianto", icon: Wrench, color: "var(--gold)" },
    ],
  },
  { key: "chat", label: "Chat", icon: MessageCircle, to: "/chat", color: "var(--magenta)" },
  { key: "impostazioni", label: "Impostazioni", icon: Settings, to: "/impostazioni", color: "var(--muted)" },
];

function groupOf(path: string): Group {
  if (path === "/") return GROUPS[0];
  return GROUPS.find((g) => g.key !== "home" && (path.startsWith(g.to) || g.tabs?.some((t) => tabActive(t, path)))) ?? GROUPS[0];
}

function tabActive(t: Tab, path: string) {
  return path.startsWith(t.to) || Boolean(t.also?.some((a) => path.startsWith(a)));
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
          <img className="brand-logo" src={FACE_IMG} alt="" />
          <span className="brand-text">
            <span className="brand-name">BrewPastore</span>
            <span className="brand-tag">birre da pascolo <span className="brand-ver">{VERSION_LABEL}</span></span>
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
                  {g.tabs.map((t) => <NavLink key={t.to} to={t.to} style={{ ["--c" as string]: t.color }} className={tabActive(t, loc.pathname) ? "active" : ""}>{t.label}</NavLink>)}
                </div>
              )}
            </div>
          );
        })}
        <div className="sidebar-foot">
          <button className="sidebar-logout" onClick={() => supabase.auth.signOut()}><LogOut size={17} /> Esci</button>
          <NavLink to="/impostazioni#versioni" className="sidebar-ver">BrewPastore {VERSION_LABEL}</NavLink>
        </div>
      </nav>

      <main className="content">
        <UpdateBanner />
        {current.tabs && (
          <>
            <div className="section-title">{current.label}</div>
            <nav className="section-tabs">
              {current.tabs.map(({ to, label, icon: Icon, color }) => (
                <NavLink key={to} to={to} style={{ ["--c" as string]: color }} className={tabActive({ to, label, icon: Icon, color, also: current.tabs!.find((t) => t.to === to)?.also }, loc.pathname) ? "active" : ""}>
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
            <NavLink key={g.key} to={g.to} end={g.to === "/"} className={active ? "active" : ""} style={{ ["--c" as string]: g.color }}>
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

export function Tabs({ tabs, active, onChange, grid = false, full = false, wide = false }: { tabs: [string, string][]; active: string; onChange: (k: string) => void; grid?: boolean; full?: boolean; wide?: boolean }) {
  return (
    <div className={"tabs" + (grid ? " tabs-grid" : "") + (full ? " tabs-full" : "") + (wide ? " tabs-wide" : "")} role="tablist" style={full ? { ["--n" as string]: tabs.length } : undefined}>
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={active === k} className={active === k ? "active" : ""} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}
