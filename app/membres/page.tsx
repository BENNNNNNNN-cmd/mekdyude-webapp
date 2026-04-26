import { getDb } from "@/db";
import MembresClanTable from "./MembresClanTable";

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
        <h1 className="font-serif text-3xl font-bold text-foreground">Membres du clan</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Registre interne des personnages et coordonnées associées.
        </p>
      </div>
      <MembresClanTable initialMembers={members} />
    </div>
  );
}
