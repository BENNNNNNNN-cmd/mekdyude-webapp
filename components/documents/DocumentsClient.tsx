"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import type { Document } from "@/lib/documents";
import FileIcon from "./FileIcon";
import CategoryBadge, {
  getCategoryConfig,
  getCategoryLabel,
  getCategoryTartan,
} from "./CategoryBadge";
import { Banner, GhostButton, PrimaryButton } from "@/app/components/v3/Banner";
import { Folio, FolioHeader } from "@/app/components/v3/Folio";
import {
  StonePlaque,
  StonePlaqueGrid,
} from "@/app/components/v3/StonePlaque";
import { WaxSealStatic } from "@/app/components/v3/WaxSeal";

interface DocumentsClientProps {
  initialDocuments: Document[];
  initialStats: { total_count: number; total_size_bytes: number };
  existingCategories: string[];
}

const DEFAULT_CATEGORIES = [
  "regles",
  "strategie",
  "inventaires",
  "cartes",
  "general",
];

const STORAGE_QUOTA_MO = 500;

function getAllCategories(existingCategories: string[]): string[] {
  const set = new Set([...DEFAULT_CATEGORIES, ...existingCategories]);
  return [...set];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

const FR_MONTHS_SHORT = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Jun",
  "Jul",
  "Août",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];

function splitDate(dateStr: string): { dayMonth: string; year: string } {
  const d = new Date(dateStr + (dateStr.endsWith("Z") ? "" : "Z"));
  return {
    dayMonth: `${d.getDate().toString().padStart(2, "0")} ${FR_MONTHS_SHORT[d.getMonth()]}`,
    year: d.getFullYear().toString(),
  };
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + (dateStr.endsWith("Z") ? "" : "Z"));
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface MimeSealConfig {
  label: string;
  color: string;
}

function getMimeSealConfig(mime: string): MimeSealConfig {
  if (mime === "application/pdf") return { label: "PDF", color: "#8B1A1A" };
  if (mime.startsWith("image/")) return { label: "IMG", color: "#3d6e2a" };
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime === "text/csv"
  )
    return { label: "XLS", color: "#1a3868" };
  if (mime === "text/plain") return { label: "TXT", color: "#5a3010" };
  if (mime === "application/zip") return { label: "ZIP", color: "#5a3010" };
  return { label: "DOC", color: "#5a3010" };
}

function getMimeShortName(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "Excel";
  if (mime === "text/csv") return "CSV";
  if (mime === "text/plain") return "Texte";
  if (mime === "application/zip") return "ZIP";
  if (mime.startsWith("image/")) return mime.split("/")[1].toUpperCase();
  return mime.split("/")[1] || "Fichier";
}

export default function DocumentsClient({
  initialDocuments,
  initialStats,
  existingCategories,
}: DocumentsClientProps) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments);
  const [categories, setCategories] = useState(() =>
    getAllCategories(existingCategories)
  );
  const [stats, setStats] = useState(initialStats);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Document | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState({
    display_name: "",
    category: "",
    description: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const refreshCategories = useCallback(async () => {
    const res = await fetch("/api/documents");
    const allDocs: Document[] = await res.json();
    const docCats = [...new Set(allDocs.map((d) => d.category))];
    setCategories(getAllCategories(docCats));
  }, []);

  const fetchDocuments = useCallback(async (category?: string, searchTerm?: string) => {
    const params = new URLSearchParams();
    if (category && category !== "all") params.set("category", category);
    if (searchTerm) params.set("search", searchTerm);
    const res = await fetch(`/api/documents?${params}`);
    const data = await res.json();
    setDocuments(data);
  }, []);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/documents/stats");
    const data = await res.json();
    setStats({ total_count: data.total_count, total_size_bytes: data.total_size_bytes });
  }, []);

  const handleFilterChange = (cat: string) => {
    setFilter(cat);
    fetchDocuments(cat, search);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchDocuments(filter, value);
    }, 300);
  };

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState("general");
  const [uploadDisplayName, setUploadDisplayName] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");

  const openUploadDialog = (files?: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      setUploadFile(file);
      if (file.type === "application/pdf") setUploadCategory("regles");
      else if (
        file.type.includes("spreadsheet") ||
        file.type.includes("excel") ||
        file.type === "text/csv"
      )
        setUploadCategory("inventaires");
      else if (file.type.startsWith("image/")) setUploadCategory("cartes");
      else setUploadCategory("general");
      setUploadDisplayName("");
      setUploadDescription("");
      setShowUpload(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    openUploadDialog(e.target.files);
    e.target.value = "";
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("category", uploadCategory);
    if (uploadDisplayName) formData.append("display_name", uploadDisplayName);
    if (uploadDescription) formData.append("description", uploadDescription);
    try {
      const res = await fetch("/api/documents", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || "Erreur lors du téléversement", "error");
        return;
      }
      showToast("Document téléversé avec succès", "success");
      setShowUpload(false);
      setUploadFile(null);
      fetchDocuments(filter, search);
      fetchStats();
      refreshCategories();
    } catch {
      showToast("Erreur de connexion", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: Document) => {
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) {
        showToast("Erreur lors de la suppression", "error");
        return;
      }
      showToast("Document supprimé", "success");
      setDeleteConfirm(null);
      if (selectedDoc?.id === doc.id) setSelectedDoc(null);
      fetchDocuments(filter, search);
      fetchStats();
    } catch {
      showToast("Erreur de connexion", "error");
    }
  };

  const startEdit = (doc: Document) => {
    setEditFields({
      display_name: doc.display_name || "",
      category: doc.category,
      description: doc.description || "",
    });
    setEditMode(true);
  };

  const saveEdit = async () => {
    if (!selectedDoc) return;
    try {
      const res = await fetch(`/api/documents/${selectedDoc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFields),
      });
      if (!res.ok) {
        showToast("Erreur lors de la mise à jour", "error");
        return;
      }
      const updated = await res.json();
      setSelectedDoc(updated);
      setEditMode(false);
      fetchDocuments(filter, search);
      refreshCategories();
      showToast("Métadonnées mises à jour", "success");
    } catch {
      showToast("Erreur de connexion", "error");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    openUploadDialog(e.dataTransfer.files);
  };

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of documents) counts.set(d.category, (counts.get(d.category) ?? 0) + 1);
    return counts;
  }, [documents]);

  const sizeMo = stats.total_size_bytes / (1024 * 1024);

  const lastAdded = useMemo(() => {
    if (documents.length === 0) return null;
    const sorted = [...documents].sort(
      (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
    );
    return sorted[0];
  }, [documents]);

  const distinctCategories = useMemo(
    () => new Set(documents.map((d) => d.category)).size,
    [documents]
  );

  return (
    <div
      className="relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ background: "rgba(160,98,42,0.15)", backdropFilter: "blur(3px)" }}
        >
          <div
            className="px-10 py-12 text-center"
            style={{
              background: "#f4ead2",
              border: "2px dashed #c8842a",
              color: "#1a1008",
              boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
            }}
          >
            <div className="text-5xl mb-3" style={{ color: "#A0622A" }}>↓</div>
            <p
              className="font-serif text-xl font-extrabold uppercase"
              style={{ letterSpacing: "0.18em" }}
            >
              Déposer ici
            </p>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 font-serif text-[11px] font-bold uppercase px-4 py-3"
          style={{
            letterSpacing: "0.16em",
            color: "#f4ead2",
            background:
              toast.type === "success"
                ? "linear-gradient(180deg, #3d6e2a, #1a3010)"
                : "linear-gradient(180deg, #c8242a, #6e1414)",
            border:
              "2px solid " + (toast.type === "success" ? "#1a3010" : "#4a0a0a"),
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 12px rgba(0,0,0,0.5)",
          }}
        >
          {toast.message}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.svg,.xlsx,.xls,.csv,.txt,.zip"
        onChange={handleFileInput}
      />

      <Banner
        title="Archives du clan"
        sub={`${stats.total_count} document${stats.total_count !== 1 ? "s" : ""} · ${formatSize(stats.total_size_bytes)} conservés au coffre`}
        actions={
          <>
            <GhostButton type="button">↓ Tout télécharger</GhostButton>
            <PrimaryButton type="button" onClick={() => openUploadDialog()}>
              † Téléverser
            </PrimaryButton>
          </>
        }
      />

      <StonePlaqueGrid cols={4}>
        <StonePlaque
          label="Documents"
          value={stats.total_count}
          sub="au coffre"
        />
        <StonePlaque
          label="Catégories"
          value={distinctCategories}
          sub={`sur ${categories.length} disponibles`}
        />
        <StonePlaque
          label="Espace utilisé"
          value={`${sizeMo.toFixed(1)} Mo`}
          sub={`sur ${STORAGE_QUOTA_MO} Mo alloués`}
          valueColor="#c8842a"
        />
        <StonePlaque
          label="Dernier ajout"
          value={
            lastAdded ? (
              <span style={{ fontSize: 24 }}>{splitDate(lastAdded.uploaded_at).dayMonth}</span>
            ) : (
              "—"
            )
          }
          sub={
            lastAdded
              ? (lastAdded.display_name || lastAdded.filename).slice(0, 28) +
                ((lastAdded.display_name || lastAdded.filename).length > 28 ? "…" : "")
              : "aucun document"
          }
          valueColor="#f4ead2"
        />
      </StonePlaqueGrid>

      {/* Toolbar */}
      <div
        className="flex items-center gap-2.5 px-4 py-3 flex-wrap"
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
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Rechercher un document…"
            className="font-serif-body text-sm outline-none"
            style={{
              width: 280,
              padding: "8px 12px 8px 32px",
              background: "#0c0703",
              border: "1px solid rgba(160,98,42,0.4)",
              color: "#f4ead2",
            }}
          />
        </div>
        <Chip active={filter === "all"} onClick={() => handleFilterChange("all")}>
          Tous <span style={{ opacity: 0.55, marginLeft: 4 }}>{documents.length}</span>
        </Chip>
        {categories.map((cat) => {
          const count = categoryCounts.get(cat) ?? 0;
          return (
            <Chip
              key={cat}
              active={filter === cat}
              onClick={() => handleFilterChange(cat)}
            >
              {getCategoryLabel(cat)}{" "}
              <span style={{ opacity: 0.55, marginLeft: 4 }}>{count}</span>
            </Chip>
          );
        })}
        <div className="ml-auto flex items-center gap-1.5">
          <ViewToggle
            mode="list"
            active={viewMode === "list"}
            onClick={() => setViewMode("list")}
          />
          <ViewToggle
            mode="grid"
            active={viewMode === "grid"}
            onClick={() => setViewMode("grid")}
          />
        </div>
      </div>

      <div className="flex gap-5 items-start">
        <div className={`flex-1 ${selectedDoc ? "max-w-[calc(100%-380px)]" : ""}`}>
          <Folio>
            <FolioHeader title="Tous les documents" meta="Trier par · Date ↓" />
            {documents.length === 0 ? (
              <div className="px-6 py-16 text-center font-serif-body italic text-parch-muted">
                <div className="text-3xl text-gold/40 mb-2">☷</div>
                Aucun document
              </div>
            ) : viewMode === "list" ? (
              <DocumentList
                documents={documents}
                selectedId={selectedDoc?.id}
                onSelect={(doc) => {
                  setSelectedDoc(doc);
                  setEditMode(false);
                }}
                onDelete={(doc) => setDeleteConfirm(doc)}
              />
            ) : (
              <DocumentGrid
                documents={documents}
                selectedId={selectedDoc?.id}
                onSelect={(doc) => {
                  setSelectedDoc(doc);
                  setEditMode(false);
                }}
                onDelete={(doc) => setDeleteConfirm(doc)}
                onAdd={() => openUploadDialog()}
              />
            )}
            <div
              className="flex items-center justify-between px-5 py-3 font-serif text-[11px] font-bold uppercase text-parch-ink-soft"
              style={{
                letterSpacing: "0.14em",
                borderTop: "2px solid #8B1A1A",
                background:
                  "linear-gradient(180deg, rgba(160,98,42,0.04), rgba(160,98,42,0.12))",
              }}
            >
              <span>
                {documents.length} document{documents.length !== 1 ? "s" : ""} · {formatSize(stats.total_size_bytes)}
              </span>
              <span>⚜ Archive consultée à l&apos;instant ⚜</span>
            </div>
          </Folio>
        </div>

        {selectedDoc && (
          <PreviewPanel
            doc={selectedDoc}
            editMode={editMode}
            editFields={editFields}
            categories={categories}
            onEdit={() => startEdit(selectedDoc)}
            onEditFieldChange={(fields) =>
              setEditFields({ ...editFields, ...fields })
            }
            onSave={saveEdit}
            onCancelEdit={() => setEditMode(false)}
            onDelete={() => setDeleteConfirm(selectedDoc)}
            onClose={() => {
              setSelectedDoc(null);
              setEditMode(false);
            }}
          />
        )}
      </div>

      {showUpload && (
        <UploadDialog
          file={uploadFile}
          category={uploadCategory}
          displayName={uploadDisplayName}
          description={uploadDescription}
          uploading={uploading}
          categories={categories}
          onCategoryChange={setUploadCategory}
          onDisplayNameChange={setUploadDisplayName}
          onDescriptionChange={setUploadDescription}
          onUpload={handleUpload}
          onClose={() => {
            setShowUpload(false);
            setUploadFile(null);
          }}
        />
      )}

      {deleteConfirm && (
        <Modal>
          <div className="p-5" style={{ background: "#f4ead2" }}>
            <h3
              className="font-serif text-base font-extrabold uppercase text-parch-ink-soft mb-2"
              style={{ letterSpacing: "0.22em" }}
            >
              ❦ Supprimer ce document ❦
            </h3>
            <p className="font-serif-body text-sm italic text-parch-ink-soft mb-4">
              Supprimer{" "}
              <strong style={{ color: "#1a1008" }}>
                {deleteConfirm.display_name || deleteConfirm.filename}
              </strong>{" "}
              ? Cette action est irréversible.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="font-serif text-[11px] font-semibold uppercase px-4 py-2 cursor-pointer"
                style={{
                  letterSpacing: "0.16em",
                  background: "transparent",
                  color: "#4a2810",
                  border: "1px solid #4a2810",
                }}
              >
                Annuler
              </button>
              <PrimaryButton type="button" onClick={() => handleDelete(deleteConfirm)}>
                ✕ Supprimer
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- Chips + toggles ---------- */

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-serif text-[11px] font-bold uppercase px-3 py-1.5 cursor-pointer transition-colors"
      style={{
        letterSpacing: "0.14em",
        border: active ? "1px solid #c8842a" : "1px solid rgba(160,98,42,0.3)",
        background: active
          ? "linear-gradient(180deg, #A0622A, #6e3e10)"
          : "transparent",
        color: active ? "#f4ead2" : "rgba(244,234,210,0.5)",
        boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.15)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function ViewToggle({
  mode,
  active,
  onClick,
}: {
  mode: "grid" | "list";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={mode === "grid" ? "Vue grille" : "Vue liste"}
      className="font-serif text-base px-2.5 py-1.5 cursor-pointer transition-colors"
      style={{
        border: active ? "1px solid #c8842a" : "1px solid transparent",
        background: active
          ? "linear-gradient(180deg, #A0622A, #6e3e10)"
          : "transparent",
        color: active ? "#f4ead2" : "rgba(244,234,210,0.5)",
        boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.15)" : "none",
      }}
    >
      {mode === "grid" ? "▦" : "☰"}
    </button>
  );
}

/* ---------- List view ---------- */

function DocumentList({
  documents,
  selectedId,
  onSelect,
  onDelete,
}: {
  documents: Document[];
  selectedId?: string;
  onSelect: (doc: Document) => void;
  onDelete: (doc: Document) => void;
}) {
  return (
    <div>
      {documents.map((doc, i) => {
        const seal = getMimeSealConfig(doc.mime_type);
        const tartan = getCategoryTartan(doc.category);
        const date = splitDate(doc.uploaded_at);
        const selected = selectedId === doc.id;
        return (
          <div
            key={doc.id}
            onClick={() => onSelect(doc)}
            className="grid items-stretch cursor-pointer transition-[filter] hover:brightness-105"
            style={{
              gridTemplateColumns: "78px 4px 1fr 130px 110px 100px 110px",
              borderBottom: "1px solid rgba(139,32,32,0.18)",
              background: selected
                ? "rgba(200,132,42,0.18)"
                : i % 2 === 1
                  ? "rgba(160,98,42,0.05)"
                  : "transparent",
              minHeight: 78,
            }}
          >
            {/* Mime seal */}
            <div
              className="flex items-center justify-center"
              style={{
                background: "rgba(160,98,42,0.10)",
                borderRight: "1px solid rgba(139,32,32,0.18)",
              }}
            >
              <WaxSealStatic color={seal.color} size={44}>
                {seal.label}
              </WaxSealStatic>
            </div>
            {/* Tartan stripe */}
            <div aria-hidden style={{ background: tartan }} />
            {/* Title */}
            <div className="px-4 py-3 flex flex-col justify-center min-w-0">
              <div
                className="font-serif font-semibold text-parch-ink truncate"
                style={{ fontSize: 16, letterSpacing: "0.02em" }}
                title={doc.display_name || doc.filename}
              >
                {doc.display_name || doc.filename}
              </div>
              <div className="text-xs italic text-parch-muted mt-1 truncate">
                {doc.display_name ? doc.filename : getMimeShortName(doc.mime_type)}
              </div>
            </div>
            {/* Category */}
            <div className="px-3 py-3 flex items-center">
              <CategoryBadge category={doc.category} />
            </div>
            {/* Size */}
            <div className="px-3 py-3 flex items-center justify-end">
              <span
                className="font-serif tabular-nums text-parch-ink-soft"
                style={{ fontSize: 13, fontWeight: 600 }}
              >
                {formatSize(doc.size_bytes)}
              </span>
            </div>
            {/* Date */}
            <div className="px-3 py-3 flex flex-col items-end justify-center">
              <div
                className="font-serif font-bold text-parch-ink-soft"
                style={{ fontSize: 14 }}
              >
                {date.dayMonth}
              </div>
              <div className="text-xs text-parch-muted mt-0.5">{date.year}</div>
            </div>
            {/* Actions */}
            <div
              className="px-3 py-3 flex gap-1.5 items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <a
                href={`/api/documents/${doc.id}/download`}
                title="Télécharger"
                className="inline-flex items-center justify-center rounded-full cursor-pointer transition-[filter] hover:brightness-110 active:scale-95"
                style={{
                  width: 30,
                  height: 30,
                  background: "radial-gradient(circle at 35% 35%, #3d6e2aaa, #3d6e2a55)",
                  border: "1px solid #3d6e2a",
                  color: "#f4ead2",
                  fontFamily: "var(--font-serif)",
                  fontWeight: 700,
                  fontSize: 13,
                  boxShadow:
                    "inset -1px -1px 2px rgba(0,0,0,0.3), inset 1px 1px 2px rgba(255,255,255,0.15)",
                }}
              >
                ↓
              </a>
              <button
                type="button"
                onClick={() => onSelect(doc)}
                title="Détails"
                className="inline-flex items-center justify-center rounded-full cursor-pointer transition-[filter] hover:brightness-110 active:scale-95"
                style={{
                  width: 30,
                  height: 30,
                  background: "radial-gradient(circle at 35% 35%, #5a3010aa, #5a301055)",
                  border: "1px solid #5a3010",
                  color: "#f4ead2",
                  fontFamily: "var(--font-serif)",
                  fontWeight: 700,
                  fontSize: 12,
                  boxShadow:
                    "inset -1px -1px 2px rgba(0,0,0,0.3), inset 1px 1px 2px rgba(255,255,255,0.15)",
                }}
              >
                ✎
              </button>
              <button
                type="button"
                onClick={() => onDelete(doc)}
                title="Supprimer"
                className="inline-flex items-center justify-center rounded-full cursor-pointer transition-[filter] hover:brightness-110 active:scale-95"
                style={{
                  width: 30,
                  height: 30,
                  background: "radial-gradient(circle at 35% 35%, #8B1A1Aaa, #8B1A1A55)",
                  border: "1px solid #8B1A1A",
                  color: "#f4ead2",
                  fontFamily: "var(--font-serif)",
                  fontWeight: 700,
                  fontSize: 12,
                  boxShadow:
                    "inset -1px -1px 2px rgba(0,0,0,0.3), inset 1px 1px 2px rgba(255,255,255,0.15)",
                }}
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Grid view ---------- */

function DocumentGrid({
  documents,
  selectedId,
  onSelect,
  onDelete,
  onAdd,
}: {
  documents: Document[];
  selectedId?: string;
  onSelect: (doc: Document) => void;
  onDelete: (doc: Document) => void;
  onAdd: () => void;
}) {
  return (
    <div
      className="p-5 grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
    >
      {documents.map((doc) => {
        const seal = getMimeSealConfig(doc.mime_type);
        const isImage = doc.mime_type.startsWith("image/");
        const selected = selectedId === doc.id;
        return (
          <div
            key={doc.id}
            onClick={() => onSelect(doc)}
            className="group relative cursor-pointer transition-[filter] hover:brightness-105"
            style={{
              background: "#f4ead2",
              border: selected ? "2px solid #c8842a" : "1px solid #4a2810",
              boxShadow:
                "0 4px 12px rgba(0,0,0,0.4), inset 0 0 30px rgba(160,98,42,0.08)",
            }}
          >
            <div
              className="h-24 flex items-center justify-center overflow-hidden"
              style={{ background: getCategoryConfig(doc.category).color + "22" }}
            >
              {isImage ? (
                <img
                  src={`/api/documents/${doc.id}/preview`}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <WaxSealStatic color={seal.color} size={48}>
                  {seal.label}
                </WaxSealStatic>
              )}
            </div>
            <div className="p-3">
              <p
                className="font-serif font-semibold text-parch-ink truncate text-sm"
                title={doc.display_name || doc.filename}
              >
                {doc.display_name || doc.filename}
              </p>
              <p className="text-xs italic text-parch-muted mt-0.5 truncate">
                {getMimeShortName(doc.mime_type)} · {formatSize(doc.size_bytes)}
              </p>
              <div className="mt-2">
                <CategoryBadge category={doc.category} />
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(doc);
              }}
              title="Supprimer"
              className="absolute top-2 right-2 inline-flex items-center justify-center rounded-full cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                width: 26,
                height: 26,
                background: "radial-gradient(circle at 35% 35%, #8B1A1Add, #8B1A1A88)",
                border: "1px solid #8B1A1A",
                color: "#f4ead2",
                fontFamily: "var(--font-serif)",
                fontWeight: 700,
                fontSize: 11,
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        className="flex flex-col items-center justify-center gap-2 px-4 py-8 cursor-pointer transition-[filter] hover:brightness-110"
        style={{
          minHeight: 180,
          background: "rgba(160,98,42,0.05)",
          border: "2px dashed rgba(160,98,42,0.4)",
          color: "rgba(160,98,42,0.6)",
        }}
      >
        <span className="text-3xl">+</span>
        <span
          className="font-serif text-[10px] font-bold uppercase"
          style={{ letterSpacing: "0.18em" }}
        >
          Glisser ou cliquer
        </span>
      </button>
    </div>
  );
}

/* ---------- Preview panel ---------- */

function PreviewPanel({
  doc,
  editMode,
  editFields,
  categories,
  onEdit,
  onEditFieldChange,
  onSave,
  onCancelEdit,
  onDelete,
  onClose,
}: {
  doc: Document;
  editMode: boolean;
  editFields: { display_name: string; category: string; description: string };
  categories: string[];
  onEdit: () => void;
  onEditFieldChange: (fields: Partial<typeof editFields>) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="w-[360px] shrink-0"
      style={{
        background: "#f4ead2",
        border: "2px solid #4a2810",
        boxShadow:
          "0 8px 24px rgba(0,0,0,0.5), inset 0 0 60px rgba(160,98,42,0.1)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          borderBottom: "2px solid #8B1A1A",
          background:
            "linear-gradient(180deg, rgba(160,98,42,0.18), rgba(160,98,42,0.08))",
        }}
      >
        <span
          className="font-serif text-xs font-extrabold uppercase text-parch-ink-soft"
          style={{ letterSpacing: "0.22em" }}
        >
          ❦ Aperçu ❦
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Fermer"
          className="font-serif text-base text-parch-ink-soft hover:text-parch-ink transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>

      <div
        className="h-48 flex items-center justify-center overflow-hidden"
        style={{ background: "rgba(160,98,42,0.10)" }}
      >
        {doc.mime_type.startsWith("image/") ? (
          <img
            src={`/api/documents/${doc.id}/preview`}
            alt={doc.display_name || doc.filename}
            className="max-w-full max-h-full object-contain"
          />
        ) : doc.mime_type === "application/pdf" ? (
          <iframe
            src={`/api/documents/${doc.id}/preview`}
            className="w-full h-full"
            title={doc.display_name || doc.filename}
          />
        ) : (
          <FileIcon mimeType={doc.mime_type} size={56} />
        )}
      </div>

      <div className="p-4 space-y-3 text-sm">
        {editMode ? (
          <>
            <PreviewField label="Nom d'affichage">
              <input
                type="text"
                value={editFields.display_name}
                onChange={(e) => onEditFieldChange({ display_name: e.target.value })}
                placeholder={doc.filename}
                className="w-full px-2 py-1.5 font-serif-body text-sm outline-none focus:ring-1 focus:ring-gold-light"
                style={{
                  background: "var(--color-input)",
                  border: "1px solid #4a2810",
                  color: "#1a1008",
                }}
              />
            </PreviewField>
            <PreviewField label="Catégorie">
              <input
                type="text"
                list="edit-category-list"
                value={editFields.category}
                onChange={(e) => onEditFieldChange({ category: e.target.value })}
                placeholder="Saisir ou choisir"
                className="w-full px-2 py-1.5 font-serif-body text-sm outline-none focus:ring-1 focus:ring-gold-light"
                style={{
                  background: "var(--color-input)",
                  border: "1px solid #4a2810",
                  color: "#1a1008",
                }}
              />
              <datalist id="edit-category-list">
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {getCategoryLabel(c)}
                  </option>
                ))}
              </datalist>
            </PreviewField>
            <PreviewField label="Description">
              <textarea
                value={editFields.description}
                onChange={(e) => onEditFieldChange({ description: e.target.value })}
                rows={3}
                className="w-full px-2 py-1.5 font-serif-body text-sm outline-none focus:ring-1 focus:ring-gold-light resize-none"
                style={{
                  background: "var(--color-input)",
                  border: "1px solid #4a2810",
                  color: "#1a1008",
                }}
              />
            </PreviewField>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onSave}
                className="flex-1 font-serif text-[11px] font-extrabold uppercase text-on-body px-3 py-2 cursor-pointer transition-[filter] hover:brightness-110"
                style={{
                  background: "linear-gradient(180deg, #3d6e2a, #1a3010)",
                  border: "2px solid #1a3010",
                  letterSpacing: "0.16em",
                }}
              >
                ✓ Enregistrer
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                className="flex-1 font-serif text-[11px] font-semibold uppercase px-3 py-2 cursor-pointer"
                style={{
                  background: "transparent",
                  color: "#4a2810",
                  border: "1px solid #4a2810",
                  letterSpacing: "0.16em",
                }}
              >
                Annuler
              </button>
            </div>
          </>
        ) : (
          <>
            <PreviewField label="Nom">
              <p className="font-serif font-semibold text-parch-ink break-words">
                {doc.display_name || doc.filename}
              </p>
              {doc.display_name && (
                <p className="text-xs italic text-parch-muted break-all mt-0.5">
                  {doc.filename}
                </p>
              )}
            </PreviewField>
            <PreviewField label="Catégorie">
              <CategoryBadge category={doc.category} />
            </PreviewField>
            {doc.description && (
              <PreviewField label="Description">
                <p className="font-serif-body italic text-parch-ink-soft">{doc.description}</p>
              </PreviewField>
            )}
            <div className="grid grid-cols-2 gap-3">
              <PreviewField label="Taille">
                <p className="font-serif tabular-nums text-parch-ink">{formatSize(doc.size_bytes)}</p>
              </PreviewField>
              <PreviewField label="Type">
                <p className="font-serif text-parch-ink">{getMimeShortName(doc.mime_type)}</p>
              </PreviewField>
            </div>
            <PreviewField label="Téléversé le">
              <p className="font-serif-body italic text-parch-ink-soft">{formatDateFull(doc.uploaded_at)}</p>
            </PreviewField>
            <div className="flex gap-2 pt-1">
              <a
                href={`/api/documents/${doc.id}/download`}
                className="flex-1 inline-flex items-center justify-center gap-1.5 font-serif text-[11px] font-extrabold uppercase text-on-body px-3 py-2 cursor-pointer transition-[filter] hover:brightness-110"
                style={{
                  background: "linear-gradient(180deg, #3d6e2a, #1a3010)",
                  border: "2px solid #1a3010",
                  letterSpacing: "0.16em",
                }}
              >
                ↓ Télécharger
              </a>
              <button
                type="button"
                onClick={onEdit}
                className="font-serif text-[11px] font-semibold uppercase px-3 py-2 cursor-pointer"
                style={{
                  background: "transparent",
                  color: "#4a2810",
                  border: "1px solid #4a2810",
                  letterSpacing: "0.16em",
                }}
              >
                ✎ Modifier
              </button>
              <button
                type="button"
                onClick={onDelete}
                title="Supprimer"
                className="inline-flex items-center justify-center cursor-pointer transition-[filter] hover:brightness-110"
                style={{
                  background: "rgba(139,32,32,0.10)",
                  color: "#8B1A1A",
                  border: "1px solid #8B1A1A",
                  padding: "8px 12px",
                  fontFamily: "var(--font-serif)",
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: "0.16em",
                }}
              >
                ✕
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PreviewField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className="font-serif text-[9px] font-bold uppercase text-parch-muted mb-1"
        style={{ letterSpacing: "0.18em" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/* ---------- Upload dialog ---------- */

function UploadDialog({
  file,
  category,
  displayName,
  description,
  uploading,
  categories,
  onCategoryChange,
  onDisplayNameChange,
  onDescriptionChange,
  onUpload,
  onClose,
}: {
  file: File | null;
  category: string;
  displayName: string;
  description: string;
  uploading: boolean;
  categories: string[];
  onCategoryChange: (v: string) => void;
  onDisplayNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onUpload: () => void;
  onClose: () => void;
}) {
  const seal = file ? getMimeSealConfig(file.type) : null;
  return (
    <Modal>
      <div className="p-5" style={{ background: "#f4ead2" }}>
        <h3
          className="font-serif text-base font-extrabold uppercase text-parch-ink-soft mb-4"
          style={{ letterSpacing: "0.22em" }}
        >
          ❦ Téléverser un document ❦
        </h3>

        {file && seal && (
          <div
            className="flex items-center gap-3 p-3 mb-4"
            style={{ background: "rgba(160,98,42,0.08)", border: "1px solid #4a2810" }}
          >
            <WaxSealStatic color={seal.color} size={36}>
              {seal.label}
            </WaxSealStatic>
            <div className="min-w-0 flex-1">
              <p className="font-serif font-semibold truncate text-parch-ink">{file.name}</p>
              <p className="text-xs italic text-parch-muted">{formatSize(file.size)}</p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <PreviewField label="Catégorie">
            <input
              type="text"
              list="upload-category-list"
              value={category}
              onChange={(e) => onCategoryChange(e.target.value)}
              placeholder="Saisir ou choisir"
              className="w-full px-2 py-1.5 font-serif-body text-sm outline-none focus:ring-1 focus:ring-gold-light"
              style={{
                background: "var(--color-input)",
                border: "1px solid #4a2810",
                color: "#1a1008",
              }}
            />
            <datalist id="upload-category-list">
              {categories.map((c) => (
                <option key={c} value={c}>
                  {getCategoryLabel(c)}
                </option>
              ))}
            </datalist>
          </PreviewField>
          <PreviewField label="Nom d'affichage (optionnel)">
            <input
              type="text"
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              placeholder={file?.name || ""}
              className="w-full px-2 py-1.5 font-serif-body text-sm outline-none focus:ring-1 focus:ring-gold-light"
              style={{
                background: "var(--color-input)",
                border: "1px solid #4a2810",
                color: "#1a1008",
              }}
            />
          </PreviewField>
          <PreviewField label="Description (optionnel)">
            <textarea
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              rows={2}
              className="w-full px-2 py-1.5 font-serif-body text-sm outline-none focus:ring-1 focus:ring-gold-light resize-none"
              style={{
                background: "var(--color-input)",
                border: "1px solid #4a2810",
                color: "#1a1008",
              }}
            />
          </PreviewField>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="font-serif text-[11px] font-semibold uppercase px-4 py-2 cursor-pointer disabled:opacity-50"
            style={{
              background: "transparent",
              color: "#4a2810",
              border: "1px solid #4a2810",
              letterSpacing: "0.16em",
            }}
          >
            Annuler
          </button>
          <PrimaryButton
            type="button"
            onClick={onUpload}
            disabled={uploading || !file}
            style={{ opacity: uploading || !file ? 0.5 : 1 }}
          >
            {uploading ? "† Téléversement…" : "† Téléverser"}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(6,2,0,0.7)", backdropFilter: "blur(2px)" }}
    >
      <div
        className="max-w-md w-full mx-4"
        style={{
          border: "2px solid #4a2810",
          boxShadow:
            "0 12px 40px rgba(0,0,0,0.7), inset 0 0 60px rgba(160,98,42,0.1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
