import { supabase } from "../lib";
import { useAuth } from "../auth";

/** Foto dell'utente, oppure le iniziali se non ne ha caricata una. */
export function UserAvatar({ id, size = 28, className = "" }: { id?: string | null; size?: number; className?: string }) {
  const { profiles } = useAuth();
  const p = profiles.find((x) => x.id === id);
  const initials = (p?.display_name ?? "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const url = p?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null;
  return (
    <span className={"uav " + className} style={{ width: size, height: size, fontSize: size * 0.4 }} title={p?.display_name}>
      {url ? <img src={url} alt={p?.display_name ?? ""} /> : initials}
    </span>
  );
}
