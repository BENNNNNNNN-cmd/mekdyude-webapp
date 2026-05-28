"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createClanMember,
  deleteClanMember,
  updateClanMemberPhoto,
  updateClanMembers,
} from "./actions";
import { Banner, GhostButton, PrimaryButton } from "@/app/components/v3/Banner";
import { Folio } from "@/app/components/v3/Folio";
import {
  StonePlaque,
  StonePlaqueGrid,
} from "@/app/components/v3/StonePlaque";

interface ClanMember {
  id: string;
  character_name: string;
  real_name: string | null;
  email: string | null;
  phone: string | null;
  photo: string | null;
}

const MAX_PHOTO_DIM = 256;

// Shrink the chosen image to a small JPEG data URL before it ever leaves the
// browser, so member photos stay tiny enough to live inline in the database.
function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_PHOTO_DIM / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas_unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_load_failed"));
    };
    img.src = url;
  });
}

type EditableField = "character_name" | "real_name" | "email" | "phone";
type DirtyMembers = Record<string, Partial<Record<EditableField, true>>>;

function initials(name: string): string {
  return name
    .split(" ")
    .filter((p) => p.length > 0)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

function HeraldicAvatar({ name, idx }: { name: string; idx: number }) {
  const gradId = `memberShield-${idx}`;
  return (
    <svg viewBox="0 0 80 90" width="56" height="64" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A0622A" />
          <stop offset="100%" stopColor="#6e3e10" />
        </linearGradient>
      </defs>
      <path
        d="M40 4 L74 16 L74 48 Q74 72 40 86 Q6 72 6 48 L6 16 Z"
        fill={`url(#${gradId})`}
        stroke="#4a2810"
        strokeWidth={2}
      />
      <path d="M40 4 L40 86" stroke="#1a1008" strokeWidth={1} opacity={0.3} />
      <text
        x="40"
        y="55"
        textAnchor="middle"
        fontFamily="Cinzel"
        fontSize="22"
        fontWeight="800"
        fill="#f4ead2"
        letterSpacing="2"
      >
        {initials(name)}
      </text>
    </svg>
  );
}

function MemberAvatar({
  name,
  idx,
  photo,
  busy,
  onPick,
  onRemove,
}: {
  name: string;
  idx: number;
  photo: string | null;
  busy: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative inline-block">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title={photo ? `Changer la photo de ${name}` : `Ajouter une photo pour ${name}`}
        className="block cursor-pointer transition-[filter] hover:brightness-105 disabled:opacity-60"
        style={
          photo
            ? {
                width: 58,
                height: 58,
                padding: 2,
                background: "linear-gradient(180deg, #A0622A, #6e3e10)",
                borderRadius: 7,
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 5px rgba(0,0,0,0.35)",
              }
            : { background: "transparent", border: "none", lineHeight: 0 }
        }
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={name}
            width={54}
            height={54}
            className="block"
            style={{
              width: 54,
              height: 54,
              objectFit: "cover",
              objectPosition: "center",
              borderRadius: 5,
              border: "1px solid #2a1a08",
            }}
          />
        ) : (
          <HeraldicAvatar name={name} idx={idx} />
        )}
      </button>

      {busy ? (
        <span
          className="absolute inset-0 flex items-center justify-center font-serif"
          style={{ color: "#f4ead2", fontSize: 18 }}
        >
          …
        </span>
      ) : photo ? (
        <button
          type="button"
          onClick={onRemove}
          title={`Retirer la photo de ${name}`}
          className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center rounded-full cursor-pointer transition-[filter] hover:brightness-110 active:scale-95"
          style={{
            width: 18,
            height: 18,
            background: "radial-gradient(circle at 35% 35%, #8B1A1Add, #8B1A1A88)",
            border: "1.5px solid #8B1A1A",
            color: "#f4ead2",
            fontFamily: "var(--font-serif)",
            fontWeight: 700,
            fontSize: 9,
            lineHeight: 1,
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
        >
          ✕
        </button>
      ) : (
        <span
          aria-hidden
          className="absolute -bottom-1 -right-1 inline-flex items-center justify-center rounded-full pointer-events-none"
          style={{
            width: 18,
            height: 18,
            background: "radial-gradient(circle at 35% 35%, #A0622A, #6e3e10)",
            border: "1.5px solid #4a2810",
            color: "#f4ead2",
            fontFamily: "var(--font-serif)",
            fontWeight: 700,
            fontSize: 12,
            lineHeight: 1,
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
        >
          +
        </span>
      )}
    </div>
  );
}

function EditableInline({
  value,
  required = false,
  inputType = "text",
  isDirty,
  size = "md",
  placeholder = "—",
  onSave,
}: {
  value: string | null;
  required?: boolean;
  inputType?: "text" | "email" | "tel";
  isDirty: boolean;
  size?: "lg" | "md" | "sm";
  placeholder?: string;
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

  const fontSize = size === "lg" ? 17 : size === "sm" ? 12 : 14;
  const fontFamily = size === "lg" ? "var(--font-serif)" : "var(--font-serif-body)";
  const fontWeight = size === "lg" ? 700 : 400;
  const fontStyle = size === "md" ? "italic" : "normal";
  const baseColor =
    size === "lg" ? "#1a1008" : size === "md" ? "#4a2810" : "#7a5028";

  if (editing) {
    return (
      <input
        type={inputType}
        className="w-full min-w-40 px-2 py-0.5 outline-none focus:ring-1 focus:ring-gold-light"
        style={{
          fontFamily,
          fontSize,
          fontWeight,
          fontStyle,
          color: "#1a1008",
          background: "rgba(200,132,42,0.18)",
          border: "1px dashed #c8842a",
          letterSpacing: size === "lg" ? "0.04em" : "normal",
        }}
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
      className="block w-full text-left px-1.5 py-0.5 cursor-pointer transition-[filter] hover:brightness-105"
      style={{
        fontFamily,
        fontSize,
        fontWeight,
        fontStyle,
        color: isDirty ? "#6e1414" : value ? baseColor : "#9a6e3e",
        background: isDirty ? "rgba(200,132,42,0.18)" : "transparent",
        border: isDirty ? "1px dashed #c8842a" : "1px solid transparent",
        letterSpacing: size === "lg" ? "0.04em" : "normal",
      }}
      onClick={() => {
        setDraft(value ?? "");
        setEditing(true);
      }}
    >
      {value || placeholder}
    </button>
  );
}

export default function MembresClanTable({
  initialMembers,
  buildingsStaffed,
  buildingsMax,
}: {
  initialMembers: ClanMember[];
  buildingsStaffed: number;
  buildingsMax: number;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [dirty, setDirty] = useState<DirtyMembers>({});
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingMember, setDeletingMember] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const hasDirtyChanges = Object.keys(dirty).length > 0;
  const dirtyCount = Object.keys(dirty).length;

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
      setMembers((prev) => [...prev, { ...result.member, photo: null }]);
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
        setMembers((prev) => prev.filter((m) => m.id !== member.id));
        router.refresh();
      } catch {
        setError("Erreur lors de la suppression. Veuillez réessayer.");
      } finally {
        setDeletingMember(null);
      }
    },
    [hasDirtyChanges, router]
  );

  const setMemberPhoto = useCallback(
    async (memberId: string, photo: string | null) => {
      setPhotoBusy(memberId);
      setError(null);
      try {
        const result = await updateClanMemberPhoto(memberId, photo);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setMembers((prev) =>
          prev.map((m) => (m.id === memberId ? { ...m, photo } : m))
        );
      } catch {
        setError("Erreur lors de l'enregistrement de la photo. Veuillez réessayer.");
      } finally {
        setPhotoBusy(null);
      }
    },
    []
  );

  const handlePhotoFile = useCallback(
    async (memberId: string, file: File) => {
      setError(null);
      if (!file.type.startsWith("image/")) {
        setError("Veuillez choisir un fichier image.");
        return;
      }
      let dataUrl: string;
      try {
        dataUrl = await resizeImageToDataUrl(file);
      } catch {
        setError("Impossible de lire cette image. Essayez un autre fichier.");
        return;
      }
      await setMemberPhoto(memberId, dataUrl);
    },
    [setMemberPhoto]
  );

  const filteredMembers = useMemo(() => {
    const q = searchTerm.trim().toLocaleLowerCase("fr-CA");
    if (q.length === 0) return members;
    return members.filter((m) =>
      [m.character_name, m.real_name, m.email, m.phone]
        .filter(Boolean)
        .some((s) => s!.toLocaleLowerCase("fr-CA").includes(q))
    );
  }, [members, searchTerm]);

  const stats = useMemo(() => {
    const withEmail = members.filter((m) => m.email && m.email.trim().length > 0).length;
    const withPhone = members.filter((m) => m.phone && m.phone.trim().length > 0).length;
    return {
      total: members.length,
      withEmail,
      withPhone,
    };
  }, [members]);

  return (
    <>
      <Banner
        title="Membres du clan"
        sub={`${stats.total} personnage${stats.total !== 1 ? "s" : ""} au registre du clan Mek Dyude`}
        actions={
          <>
            <GhostButton type="button">↓ Liste</GhostButton>
            <PrimaryButton
              type="button"
              onClick={addMember}
              disabled={adding || saving || deletingMember !== null}
              style={{
                opacity: adding || saving || deletingMember !== null ? 0.5 : 1,
              }}
            >
              {adding ? "† Ajout…" : "† Nouveau membre"}
            </PrimaryButton>
          </>
        }
      />

      <StonePlaqueGrid cols={4}>
        <StonePlaque
          label="Membres actifs"
          value={stats.total}
          sub="au registre"
        />
        <StonePlaque
          label="Bâtiments staffés"
          value={`${buildingsStaffed}/${buildingsMax}`}
          sub={`${Math.max(0, buildingsMax - buildingsStaffed)} sans affectation`}
          valueColor="#7fb15c"
        />
        <StonePlaque
          label="Avec courriel"
          value={stats.withEmail}
          sub={`sur ${stats.total} membres`}
          valueColor="#c8842a"
        />
        <StonePlaque
          label="Avec téléphone"
          value={stats.withPhone}
          sub={`sur ${stats.total} membres`}
        />
      </StonePlaqueGrid>

      {error && (
        <div
          className="mb-3 px-4 py-3 text-sm font-serif-body italic"
          style={{
            background: "rgba(139,32,32,0.15)",
            border: "1px solid #8B1A1A",
            color: "#f4ead2",
          }}
        >
          ⚠ {error}
        </div>
      )}

      {/* Toolbar */}
      <div
        className="flex items-center gap-2.5 px-4 py-3"
        style={{
          background: "linear-gradient(180deg, #2a1a08, #1a0e05)",
          border: "2px solid #4a2810",
          borderBottom: "none",
        }}
      >
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-body-soft pointer-events-none">⌕</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher un membre…"
            className="font-serif-body text-sm outline-none"
            style={{
              width: 320,
              padding: "8px 12px 8px 32px",
              background: "#0c0703",
              border: "1px solid rgba(160,98,42,0.4)",
              color: "#f4ead2",
            }}
          />
        </div>
        <span className="font-serif text-[11px] italic text-on-body-soft ml-3">
          {filteredMembers.length} affiché{filteredMembers.length > 1 ? "s" : ""}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {hasDirtyChanges && (
            <>
              <span className="text-xs italic text-on-body-soft">
                {dirtyCount} modification{dirtyCount > 1 ? "s" : ""} en attente
              </span>
              <button
                type="button"
                onClick={() => {
                  setDirty({});
                  setMembers(initialMembers);
                  setError(null);
                }}
                disabled={saving}
                className="font-serif text-[11px] font-semibold uppercase px-3 py-1.5 cursor-pointer transition-colors disabled:opacity-50"
                style={{
                  background: "transparent",
                  color: "rgba(244,234,210,0.7)",
                  border: "1px solid rgba(160,98,42,0.5)",
                  letterSpacing: "0.16em",
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveAll}
                disabled={saving}
                className="font-serif text-[11px] font-extrabold uppercase text-on-body px-3.5 py-1.5 cursor-pointer transition-[filter] hover:brightness-110 disabled:opacity-50"
                style={{
                  background: "linear-gradient(180deg, #3d6e2a, #1a3010)",
                  border: "2px solid #1a3010",
                  letterSpacing: "0.2em",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -2px 0 rgba(0,0,0,0.3), 0 3px 8px rgba(0,0,0,0.5)",
                }}
              >
                {saving ? "Sauvegarde…" : "✓ Sauvegarder"}
              </button>
            </>
          )}
        </div>
      </div>

      <Folio>
        {filteredMembers.length === 0 ? (
          <div className="px-6 py-12 text-center font-serif-body italic text-parch-muted">
            <div className="text-3xl text-gold/40 mb-2">⚔</div>
            Aucun membre ne correspond à la recherche.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {filteredMembers.map((member, idx) => {
              const rowDirty = dirty[member.id];
              const stripeColumn = idx % 2 === 0;
              return (
                <div
                  key={member.id}
                  className="grid items-stretch"
                  style={{
                    gridTemplateColumns: "90px 4px 1fr auto",
                    borderBottom: "1px solid rgba(139,32,32,0.18)",
                    borderRight: stripeColumn ? "1px solid rgba(139,32,32,0.18)" : "none",
                    background:
                      Math.floor(idx / 2) % 2 === 1
                        ? "rgba(160,98,42,0.05)"
                        : "transparent",
                    minHeight: 96,
                  }}
                >
                  {/* Heraldic shield or member photo */}
                  <div
                    className="flex items-center justify-center"
                    style={{
                      background: "rgba(160,98,42,0.10)",
                      borderRight: "1px solid rgba(139,32,32,0.18)",
                    }}
                  >
                    <MemberAvatar
                      name={member.character_name}
                      idx={idx}
                      photo={member.photo}
                      busy={photoBusy === member.id}
                      onPick={(file) => handlePhotoFile(member.id, file)}
                      onRemove={() => setMemberPhoto(member.id, null)}
                    />
                  </div>

                  {/* Tartan stripe */}
                  <div
                    aria-hidden
                    style={{
                      background:
                        "repeating-linear-gradient(180deg, #8B1A1A 0 8px, #1a1008 8px 11px, #A0622A 11px 16px)",
                    }}
                  />

                  {/* Info */}
                  <div className="flex flex-col justify-center px-4 py-3 min-w-0">
                    <EditableInline
                      value={member.character_name}
                      required
                      size="lg"
                      isDirty={!!rowDirty?.character_name}
                      placeholder="Nom de personnage"
                      onSave={(v) => v && updateMember(member.id, "character_name", v)}
                    />
                    <EditableInline
                      value={member.real_name}
                      size="md"
                      isDirty={!!rowDirty?.real_name}
                      placeholder="Nom réel —"
                      onSave={(v) => updateMember(member.id, "real_name", v)}
                    />
                    <div className="grid grid-cols-[auto_1fr] gap-x-2 items-center mt-1">
                      <span aria-hidden style={{ color: "#A0622A", fontSize: 13 }}>✉</span>
                      <EditableInline
                        value={member.email}
                        inputType="email"
                        size="sm"
                        isDirty={!!rowDirty?.email}
                        placeholder="email —"
                        onSave={(v) => updateMember(member.id, "email", v)}
                      />
                      <span aria-hidden style={{ color: "#A0622A", fontSize: 13 }}>☏</span>
                      <EditableInline
                        value={member.phone}
                        inputType="tel"
                        size="sm"
                        isDirty={!!rowDirty?.phone}
                        placeholder="téléphone —"
                        onSave={(v) => updateMember(member.id, "phone", v)}
                      />
                    </div>
                  </div>

                  {/* Delete seal */}
                  <div className="flex items-center justify-center pr-3">
                    <button
                      type="button"
                      onClick={() => removeMember(member)}
                      disabled={saving || adding || deletingMember !== null}
                      title={`Supprimer ${member.character_name}`}
                      className="inline-flex items-center justify-center rounded-full cursor-pointer transition-[filter] hover:brightness-110 active:scale-95 disabled:opacity-50"
                      style={{
                        width: 34,
                        height: 34,
                        background: "radial-gradient(circle at 35% 35%, #8B1A1Add, #8B1A1A88)",
                        border: "2px solid #8B1A1A",
                        color: "#f4ead2",
                        fontFamily: "var(--font-serif)",
                        fontWeight: 700,
                        fontSize: 14,
                        boxShadow:
                          "inset -2px -2px 4px rgba(0,0,0,0.4), inset 2px 2px 4px rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.3)",
                      }}
                    >
                      {deletingMember === member.id ? "…" : "✕"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Folio>
    </>
  );
}
