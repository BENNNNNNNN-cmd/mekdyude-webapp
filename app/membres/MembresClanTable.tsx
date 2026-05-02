"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { createClanMember, deleteClanMember, updateClanMembers } from "./actions";

interface ClanMember {
  id: string;
  character_name: string;
  real_name: string | null;
  email: string | null;
  phone: string | null;
}

type EditableField = "character_name" | "real_name" | "email" | "phone";
type DirtyMembers = Record<string, Partial<Record<EditableField, true>>>;

function EditableTextCell({
  value,
  required = false,
  inputType = "text",
  isDirty,
  onSave,
}: {
  value: string | null;
  required?: boolean;
  inputType?: "text" | "email" | "tel";
  isDirty: boolean;
  onSave: (newValue: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const commit = useCallback(() => {
    const normalized = draft.trim();
    if (required && normalized.length === 0) {
      setDraft(value ?? "");
      setEditing(false);
      return;
    }

    const nextValue = normalized.length > 0 ? normalized : null;
    setEditing(false);
    if (nextValue !== value) {
      onSave(nextValue);
    } else {
      setDraft(value ?? "");
    }
  }, [draft, onSave, required, value]);

  if (editing) {
    return (
      <input
        type={inputType}
        className="w-full min-w-40 rounded border border-amber-400 bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-300"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`block min-h-8 w-full rounded px-2 py-1 text-left text-sm transition-colors hover:bg-parchment-dark hover:ring-1 hover:ring-amber-200 ${
        isDirty ? "bg-amber-100 ring-1 ring-amber-300 font-semibold text-foreground" : ""
      } ${value ? "text-foreground" : "text-foreground/45"}`}
      onClick={() => {
        setDraft(value ?? "");
        setEditing(true);
      }}
    >
      {value || "—"}
    </button>
  );
}

export default function MembresClanTable({ initialMembers }: { initialMembers: ClanMember[] }) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [dirty, setDirty] = useState<DirtyMembers>({});
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingMember, setDeletingMember] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasDirtyChanges = Object.keys(dirty).length > 0;

  const updateMember = useCallback(
    (memberId: string, field: EditableField, newValue: string | null) => {
      setMembers((prev) =>
        prev.map((member) =>
          member.id === memberId ? { ...member, [field]: newValue } : member
        )
      );
      setDirty((prev) => ({
        ...prev,
        [memberId]: { ...prev[memberId], [field]: true },
      }));
      setError(null);
    },
    []
  );

  const saveAll = useCallback(async () => {
    setSaving(true);
    setError(null);

    const updates = members.filter((member) => dirty[member.id]);
    try {
      const result = await updateClanMembers(updates);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setDirty({});
      router.refresh();
    } catch {
      setError("Erreur lors de la sauvegarde. Veuillez réessayer.");
    } finally {
      setSaving(false);
    }
  }, [dirty, members, router]);

  const addMember = useCallback(async () => {
    setAdding(true);
    setError(null);

    try {
      const result = await createClanMember();
      if (!result.ok) {
        setError(result.message);
        return;
      }

      setMembers((prev) => [...prev, result.member]);
    } catch {
      setError("Erreur lors de l'ajout. Veuillez réessayer.");
    } finally {
      setAdding(false);
    }
  }, []);

  const removeMember = useCallback(
    async (member: ClanMember) => {
      if (hasDirtyChanges) {
        setError("Sauvegardez ou annulez vos modifications avant de supprimer un membre.");
        return;
      }

      if (!window.confirm(`Supprimer ${member.character_name} des membres du clan?`)) {
        return;
      }

      setDeletingMember(member.id);
      setError(null);

      try {
        const result = await deleteClanMember(member.id);
        if (!result.ok) {
          setError(result.message);
          return;
        }

        setMembers((prev) => prev.filter((currentMember) => currentMember.id !== member.id));
        router.refresh();
      } catch {
        setError("Erreur lors de la suppression. Veuillez réessayer.");
      } finally {
        setDeletingMember(null);
      }
    },
    [hasDirtyChanges, router]
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={addMember}
          disabled={adding || saving || deletingMember !== null}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-amber px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-amber-dark disabled:opacity-50"
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {adding ? "Ajout en cours…" : "Ajouter un membre"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-parchment-dark/50">
                <th className="w-24 px-5 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">ID</th>
                <th className="min-w-64 px-5 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">
                  Nom de personnage
                </th>
                <th className="min-w-48 px-5 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Nom réel</th>
                <th className="min-w-56 px-5 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Email</th>
                <th className="min-w-44 px-5 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Téléphone</th>
                <th className="w-32 px-5 py-2.5 text-right text-xs uppercase tracking-wider text-foreground/60">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member, index) => {
                const rowDirty = dirty[member.id];
                return (
                  <tr key={member.id} className={index % 2 === 0 ? "bg-card" : "bg-parchment/30"}>
                    <td className="px-5 py-2 font-mono text-xs font-semibold text-foreground/70">{member.id}</td>
                    <td className="px-5 py-1.5">
                      <EditableTextCell
                        value={member.character_name}
                        required
                        isDirty={!!rowDirty?.character_name}
                        onSave={(value) => value && updateMember(member.id, "character_name", value)}
                      />
                    </td>
                    <td className="px-5 py-1.5">
                      <EditableTextCell
                        value={member.real_name}
                        isDirty={!!rowDirty?.real_name}
                        onSave={(value) => updateMember(member.id, "real_name", value)}
                      />
                    </td>
                    <td className="px-5 py-1.5">
                      <EditableTextCell
                        value={member.email}
                        inputType="email"
                        isDirty={!!rowDirty?.email}
                        onSave={(value) => updateMember(member.id, "email", value)}
                      />
                    </td>
                    <td className="px-5 py-1.5">
                      <EditableTextCell
                        value={member.phone}
                        inputType="tel"
                        isDirty={!!rowDirty?.phone}
                        onSave={(value) => updateMember(member.id, "phone", value)}
                      />
                    </td>
                    <td className="px-5 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => removeMember(member)}
                        disabled={saving || adding || deletingMember !== null}
                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
                      >
                        {deletingMember === member.id ? "Suppression…" : "Supprimer"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {hasDirtyChanges && (
        <div className="sticky bottom-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setDirty({});
              setMembers(initialMembers);
              setError(null);
            }}
            disabled={saving}
            className="rounded-lg bg-gray-500 px-6 py-3 font-semibold text-white shadow-lg transition-colors hover:bg-gray-600 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={saveAll}
            disabled={saving}
            className="rounded-lg bg-brand-amber px-6 py-3 font-semibold text-white shadow-lg transition-colors hover:bg-amber-500 disabled:opacity-50"
          >
            {saving ? "Sauvegarde en cours…" : "Sauvegarder"}
          </button>
        </div>
      )}
    </div>
  );
}
