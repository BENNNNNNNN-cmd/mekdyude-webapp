"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getSession } from "@/lib/session";

interface ClanMemberUpdate {
  id: string;
  character_name: string;
  real_name: string | null;
  email: string | null;
  phone: string | null;
}

type UpdateClanMembersResult = { ok: true } | { ok: false; message: string };

function normalizeRequired(value: string) {
  return value.trim();
}

function normalizeOptional(value: string | null) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export async function updateClanMembers(updates: ClanMemberUpdate[]): Promise<UpdateClanMembersResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, message: "Session expirée. Reconnectez-vous avant de sauvegarder." };
  }
  if (session.role !== "admin") {
    return { ok: false, message: "Seuls les administrateurs peuvent modifier les membres du clan." };
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    return { ok: false, message: "Aucune modification à sauvegarder." };
  }

  const normalizedUpdates = updates.map((member) => ({
    id: member.id.trim(),
    character_name: normalizeRequired(member.character_name),
    real_name: normalizeOptional(member.real_name),
    email: normalizeOptional(member.email),
    phone: normalizeOptional(member.phone),
  }));

  if (normalizedUpdates.some((member) => !member.id || !member.character_name)) {
    return { ok: false, message: "Chaque membre doit conserver un ID et un nom de personnage." };
  }

  const db = getDb();
  const updateMember = db.prepare(`
    UPDATE clan_members
    SET character_name = ?,
        real_name = ?,
        email = ?,
        phone = ?,
        updated_at = datetime('now')
    WHERE guild_id = ? AND id = ?
  `);

  const saveMembers = db.transaction(() => {
    for (const member of normalizedUpdates) {
      const result = updateMember.run(
        member.character_name,
        member.real_name,
        member.email,
        member.phone,
        "mek_dyude",
        member.id
      );

      if (result.changes !== 1) {
        throw new Error("member_not_found");
      }
    }
  });

  try {
    saveMembers();
  } catch {
    return { ok: false, message: "Impossible de sauvegarder un ou plusieurs membres." };
  }

  revalidatePath("/membres");
  return { ok: true };
}
