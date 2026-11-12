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
}

const Ctx = createContext<AuthState>({
  session: null, profile: null, profiles: [], isAdmin: false, loading: true, nameOf: () => "",
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

  useEffect(() => {
    if (!session) { setProfiles([]); return; }
    loadMascot();
    supabase.from("profiles").select("id, display_name, role").order("display_name")
      .then(({ data }) => { setProfiles((data as Profile[]) ?? []); setLoading(false); });
  }, [session?.user.id]);

  const profile = profiles.find((p) => p.id === session?.user.id) ?? null;
  const nameOf = (id: string | null | undefined) => profiles.find((p) => p.id === id)?.display_name ?? "—";

  return (
    <Ctx.Provider value={{ session, profile, profiles, isAdmin: profile?.role === "admin", loading, nameOf }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
