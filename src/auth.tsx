import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, loadMascot, type Profile } from "./lib";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  profiles: Profile[];
  isAdmin: boolean;
  loading: boolean;
  nameOf: (id: string | null | undefined) => string;
  reloadProfiles: () => void;
}

const Ctx = createContext<AuthState>({
  session: null, profile: null, profiles: [], isAdmin: false, loading: true, nameOf: () => "", reloadProfiles: () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const [rev, setRev] = useState(0);
  useEffect(() => {
    if (!session) { setProfiles([]); return; }
    loadMascot();
    (async () => {
      let res = await supabase.from("profiles").select("id, display_name, role, avatar_path").order("display_name");
      // database non ancora aggiornato (0015): senza foto
      if (res.error) res = await supabase.from("profiles").select("id, display_name, role").order("display_name") as typeof res;
      setProfiles((res.data as Profile[]) ?? []); setLoading(false);
    })();
  }, [session?.user.id, rev]);

  const profile = profiles.find((p) => p.id === session?.user.id) ?? null;
  const nameOf = (id: string | null | undefined) => profiles.find((p) => p.id === id)?.display_name ?? "—";

  return (
    <Ctx.Provider value={{ session, profile, profiles, isAdmin: profile?.role === "admin", loading, nameOf, reloadProfiles: () => setRev((x) => x + 1) }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
