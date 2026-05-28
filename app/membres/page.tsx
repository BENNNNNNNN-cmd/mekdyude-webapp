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
  photo: string | null;
}

export default function MembresPage() {
  const db = getDb();
  const members = db.prepare(`
    SELECT id, character_name, real_name, email, phone, photo
    FROM clan_members
    WHERE guild_id = 'mek_dyude'
    ORDER BY sort_order, id
  `).all() as ClanMemberRow[];

  const buildingsAgg = db
    .prepare(
      "SELECT SUM(buildings_used) as used, SUM(buildings_max) as max FROM domains WHERE guild_id = 'mek_dyude'"
    )
    .get() as { used: number | null; max: number | null };

  return (
    <div className="max-w-[1400px] mx-auto">
      <MembresClanTable
        initialMembers={members}
        buildingsStaffed={buildingsAgg.used ?? 0}
        buildingsMax={buildingsAgg.max ?? 0}
      />
    </div>
  );
}
