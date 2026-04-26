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
type CreateClanMemberResult = { ok: true; member: ClanMemberUpdate } | { ok: false; message: string };

function normalizeRequired(value: string) {
  return value.trim();
}

function normalizeOptional(value: string | null) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function getNextMemberId(existingIds: string[]) {
  const nextNumber = existingIds.reduce((max, id) => {
    const match = /^MEK(\d+)$/.exec(id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;

  return `MEK${nextNumber.toString().padStart(3, "0")}`;
}

export async function createClanMember(): Promise<CreateClanMemberResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, message: "Session expirée. Reconnectez-vous avant d'ajouter un membre." };
  }
  if (session.role !== "admin") {
    return { ok: false, message: "Seuls les administrateurs peuvent ajouter un membre du clan." };
  }

  const db = getDb();
  const createMember = db.transaction(() => {
    const idRows = db.prepare(`
      SELECT id
      FROM clan_members
      WHERE guild_id = ?
    `).all("mek_dyude") as { id: string }[];
    const sortRow = db.prepare(`
      SELECT COALESCE(MAX(sort_order), 0) as max_sort_order
      FROM clan_members
      WHERE guild_id = ?
    `).get("mek_dyude") as { max_sort_order: number };

    const member: ClanMemberUpdate = {
      id: getNextMemberId(idRows.map((row) => row.id)),
      character_name: "Nouveau membre",
      real_name: null,
      email: null,
      phone: null,
    };

    db.prepare(`
      INSERT INTO clan_members (id, guild_id, character_name, real_name, email, phone, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      member.id,
      "mek_dyude",
      member.character_name,
      member.real_name,
      member.email,
      member.phone,
      sortRow.max_sort_order + 1
    );

    return member;
  });

  try {
    const member = createMember();
    revalidatePath("/membres");
    return { ok: true, member };
  } catch {
    return { ok: false, message: "Impossible d'ajouter le nouveau membre." };
  }
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
