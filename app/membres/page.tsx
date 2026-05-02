import { getDb } from "@/db";
import MembresClanTable from "./MembresClanTable";

// Force dynamic rendering: this page reads directly from SQLite, which Next.js
// cannot track for cache invalidation. Without this, the page is prerendered at
// build time and only refreshes after revalidatePath() — meaning the FIRST
// visit (cold router cache) shows stale data until a hard reload.
export const dynamic = "force-dynamic";

interface ClanMemberRow {
  id: string;
  character_name: string;
  real_name: string | null;
  email: string | null;
  phone: string | null;
}

export default function MembresPage() {
  const db = getDb();
  const members = db.prepare(`
    SELECT id, character_name, real_name, email, phone
    FROM clan_members
    WHERE guild_id = 'mek_dyude'
    ORDER BY sort_order, id
  `).all() as ClanMemberRow[];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-on-body">Membres du clan</h1>
        <p className="mt-2 text-sm text-on-body/60">
          Registre interne des personnages et coordonnées associées.
        </p>
      </div>
      <MembresClanTable initialMembers={members} />
    </div>
  );
}
