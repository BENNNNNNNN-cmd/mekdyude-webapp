"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Document } from "@/lib/documents";
import FileIcon from "./FileIcon";
import CategoryBadge, { getCategoryConfig, getCategoryLabel } from "./CategoryBadge";

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

function getAllCategories(existingCategories: string[]): string[] {
  const set = new Set([...DEFAULT_CATEGORIES, ...existingCategories]);
  return [...set];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "Z");
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
  const [categories, setCategories] = useState(() => getAllCategories(existingCategories));
  const [stats, setStats] = useState(initialStats);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Document | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState({ display_name: "", category: "", description: "" });
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

  // Upload
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState("general");
  const [uploadDisplayName, setUploadDisplayName] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");

  const openUploadDialog = (files?: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      setUploadFile(file);
      // Guess category
      if (file.type === "application/pdf") setUploadCategory("regles");
      else if (file.type.includes("spreadsheet") || file.type.includes("excel") || file.type === "text/csv") setUploadCategory("inventaires");
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
    // Reset so same file can be re-selected
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
        showToast(err.error || "Erreur lors du televersement", "error");
        return;
      }
      showToast("Document televerse avec succes", "success");
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

  // Delete
  const handleDelete = async (doc: Document) => {
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) {
        showToast("Erreur lors de la suppression", "error");
        return;
      }
      showToast("Document supprime", "success");
      setDeleteConfirm(null);
      if (selectedDoc?.id === doc.id) setSelectedDoc(null);
      fetchDocuments(filter, search);
      fetchStats();
    } catch {
      showToast("Erreur de connexion", "error");
    }
  };

  // Edit metadata
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
        showToast("Erreur lors de la mise a jour", "error");
        return;
      }
      const updated = await res.json();
      setSelectedDoc(updated);
      setEditMode(false);
      fetchDocuments(filter, search);
      refreshCategories();
      showToast("Metadonnees mises a jour", "success");
    } catch {
      showToast("Erreur de connexion", "error");
    }
  };

  // Drag & drop
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

  return (
    <div
      className="relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-50 bg-brand-amber/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-card border-2 border-dashed border-brand-amber rounded-2xl p-12 text-center shadow-2xl">
            <svg className="w-16 h-16 mx-auto mb-4 text-brand-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
            </svg>
            <p className="text-xl font-serif font-bold text-foreground">Deposer ici</p>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
          toast.type === "success" ? "bg-accent-green text-white" : "bg-accent-red text-white"
        }`}>
          {toast.message}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.svg,.xlsx,.xls,.csv,.txt,.zip"
        onChange={handleFileInput}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-3xl font-bold text-on-body">Documents</h1>
          <p className="text-sm text-on-body/60 mt-1">
            Archive du clan Mek Dyude
            <span className="mx-2">·</span>
            <span>{stats.total_count} document{stats.total_count !== 1 ? "s" : ""} · {formatSize(stats.total_size_bytes)}</span>
          </p>
        </div>
        <button
          onClick={() => openUploadDialog()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-brand-amber text-white shadow-sm transition-colors hover:bg-brand-amber-dark"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Televerser
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-brand-amber/40"
          />
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleFilterChange("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === "all"
                ? "bg-brand-amber text-white shadow-sm"
                : "bg-parchment-dark text-foreground/70 hover:bg-parchment-dark/80"
            }`}
          >
            Tous
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => handleFilterChange(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === cat
                  ? "bg-brand-amber text-white shadow-sm"
                  : "bg-parchment-dark text-foreground/70 hover:bg-parchment-dark/80"
              }`}
            >
              {getCategoryLabel(cat)}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === "grid" ? "bg-parchment-dark text-foreground" : "text-foreground/40 hover:text-foreground/70"
            }`}
            title="Vue grille"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === "list" ? "bg-parchment-dark text-foreground" : "text-foreground/40 hover:text-foreground/70"
            }`}
            title="Vue liste"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex gap-6">
        {/* Main content */}
        <div className={`flex-1 ${selectedDoc ? "max-w-[calc(100%-380px)]" : ""}`}>
          {viewMode === "grid" ? (
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
              {documents.map((doc) => (
                <GridCard
                  key={doc.id}
                  doc={doc}
                  isSelected={selectedDoc?.id === doc.id}
                  onClick={() => { setSelectedDoc(doc); setEditMode(false); }}
                  onDelete={() => setDeleteConfirm(doc)}
                />
              ))}
              {/* Upload card */}
              <button
                onClick={() => openUploadDialog()}
                className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-border hover:border-brand-amber/50 hover:bg-parchment-dark/30 transition-colors min-h-[180px]"
              >
                <svg className="w-8 h-8 text-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-xs text-foreground/40">Glisser ou cliquer</span>
              </button>
            </div>
          ) : (
            <ListView
              documents={documents}
              selectedId={selectedDoc?.id}
              onSelect={(doc) => { setSelectedDoc(doc); setEditMode(false); }}
              onDelete={(doc) => setDeleteConfirm(doc)}
            />
          )}

          {documents.length === 0 && (
            <div className="text-center py-16 text-foreground/40">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 2h7l5 5v13a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v5h5" />
              </svg>
              <p className="text-sm">Aucun document</p>
            </div>
          )}
        </div>

        {/* Preview panel */}
        {selectedDoc && (
          <PreviewPanel
            doc={selectedDoc}
            editMode={editMode}
            editFields={editFields}
            categories={categories}
            onEdit={() => startEdit(selectedDoc)}
            onEditFieldChange={(fields) => setEditFields({ ...editFields, ...fields })}
            onSave={saveEdit}
            onCancelEdit={() => setEditMode(false)}
            onDelete={() => setDeleteConfirm(selectedDoc)}
            onClose={() => { setSelectedDoc(null); setEditMode(false); }}
          />
        )}
      </div>

      {/* Upload dialog */}
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
          onClose={() => { setShowUpload(false); setUploadFile(null); }}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4 shadow-2xl">
            <h3 className="font-serif text-lg font-bold text-foreground mb-2">Supprimer ce document ?</h3>
            <p className="text-sm text-foreground/70 mb-4">
              Supprimer <strong>{deleteConfirm.display_name || deleteConfirm.filename}</strong> ? Cette action est irreversible.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm text-foreground/70 bg-parchment-dark hover:bg-parchment-dark/80 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 rounded-lg text-sm text-white bg-accent-red hover:bg-accent-red/90 transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Grid Card ───────────────────────────────────────────────

function GridCard({
  doc,
  isSelected,
  onClick,
  onDelete,
}: {
  doc: Document;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const catConfig = getCategoryConfig(doc.category);
  const isImage = doc.mime_type.startsWith("image/");

  return (
    <div
      onClick={onClick}
      className={`group relative bg-card rounded-xl border transition-all cursor-pointer overflow-hidden ${
        isSelected
          ? "border-brand-amber shadow-md"
          : "border-border hover:border-foreground/20 hover:shadow-sm"
      }`}
    >
      {/* Icon area */}
      <div
        className="h-20 flex items-center justify-center relative overflow-hidden"
        style={{ backgroundColor: catConfig.bg }}
      >
        {isImage ? (
          <img
            src={`/api/documents/${doc.id}/preview`}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <FileIcon mimeType={doc.mime_type} size={36} />
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-medium text-foreground truncate" title={doc.display_name || doc.filename}>
          {doc.display_name || doc.filename}
        </p>
        <p className="text-xs text-foreground/50 mt-1 truncate">
          {getMimeShortName(doc.mime_type)} · {formatSize(doc.size_bytes)}
        </p>
        <div className="mt-2">
          <CategoryBadge category={doc.category} />
        </div>
      </div>

      {/* Delete button on hover */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent-red"
        title="Supprimer"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

// ─── List View ───────────────────────────────────────────────

function ListView({
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
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-parchment-dark/50">
              <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60 w-8"></th>
              <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Nom</th>
              <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Categorie</th>
              <th className="px-4 py-2.5 text-right text-xs uppercase tracking-wider text-foreground/60">Taille</th>
              <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Date</th>
              <th className="px-4 py-2.5 text-center text-xs uppercase tracking-wider text-foreground/60">Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc, i) => (
              <tr
                key={doc.id}
                onClick={() => onSelect(doc)}
                className={`cursor-pointer transition-colors ${
                  selectedId === doc.id
                    ? "bg-brand-amber/10"
                    : i % 2 === 0
                    ? "bg-card"
                    : "bg-parchment/30"
                } hover:bg-parchment-dark`}
              >
                <td className="px-4 py-2">
                  <FileIcon mimeType={doc.mime_type} size={18} />
                </td>
                <td className="px-4 py-2 font-medium truncate max-w-xs">
                  {doc.display_name || doc.filename}
                </td>
                <td className="px-4 py-2">
                  <CategoryBadge category={doc.category} />
                </td>
                <td className="px-4 py-2 text-right text-foreground/60 whitespace-nowrap">
                  {formatSize(doc.size_bytes)}
                </td>
                <td className="px-4 py-2 text-foreground/60 whitespace-nowrap">
                  {formatDate(doc.uploaded_at)}
                </td>
                <td className="px-4 py-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <a
                      href={`/api/documents/${doc.id}/download`}
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-lg text-foreground/40 hover:text-brand-amber hover:bg-parchment-dark transition-colors"
                      title="Telecharger"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                    </a>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(doc); }}
                      className="p-1.5 rounded-lg text-foreground/40 hover:text-accent-red hover:bg-parchment-dark transition-colors"
                      title="Supprimer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Preview Panel ───────────────────────────────────────────

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
  const isPreviewable = doc.mime_type.startsWith("image/") || doc.mime_type === "application/pdf";

  return (
    <div className="w-[360px] shrink-0 bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      {/* Close button */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-xs uppercase tracking-wider text-foreground/50 font-medium">Apercu</span>
        <button onClick={onClose} className="p-1 rounded-lg text-foreground/40 hover:text-foreground hover:bg-parchment-dark transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Preview area */}
      <div className="h-48 bg-parchment-dark/30 flex items-center justify-center overflow-hidden">
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
          <FileIcon mimeType={doc.mime_type} size={64} />
        )}
      </div>

      {/* Metadata */}
      <div className="p-4 space-y-3 text-sm">
        {editMode ? (
          <>
            <div>
              <label className="block text-xs text-foreground/50 mb-1">Nom d&apos;affichage</label>
              <input
                type="text"
                value={editFields.display_name}
                onChange={(e) => onEditFieldChange({ display_name: e.target.value })}
                placeholder={doc.filename}
                className="w-full px-3 py-1.5 rounded-lg border border-border bg-parchment text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-amber/40"
              />
            </div>
            <div>
              <label className="block text-xs text-foreground/50 mb-1">Categorie</label>
              <input
                type="text"
                list="edit-category-list"
                value={editFields.category}
                onChange={(e) => onEditFieldChange({ category: e.target.value })}
                placeholder="Saisir ou choisir une categorie"
                className="w-full px-3 py-1.5 rounded-lg border border-border bg-parchment text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-amber/40"
              />
              <datalist id="edit-category-list">
                {categories.map((c) => (
                  <option key={c} value={c}>{getCategoryLabel(c)}</option>
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs text-foreground/50 mb-1">Description</label>
              <textarea
                value={editFields.description}
                onChange={(e) => onEditFieldChange({ description: e.target.value })}
                rows={3}
                className="w-full px-3 py-1.5 rounded-lg border border-border bg-parchment text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-amber/40 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={onSave}
                className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-accent-green hover:bg-accent-green/90 transition-colors"
              >
                Enregistrer
              </button>
              <button
                onClick={onCancelEdit}
                className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground/70 bg-parchment-dark hover:bg-parchment-dark/80 transition-colors"
              >
                Annuler
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <span className="text-xs text-foreground/50">Nom</span>
              <p className="font-medium break-words">{doc.display_name || doc.filename}</p>
              {doc.display_name && (
                <p className="text-xs text-foreground/40 break-all">{doc.filename}</p>
              )}
            </div>
            <div>
              <span className="text-xs text-foreground/50">Categorie</span>
              <div className="mt-0.5"><CategoryBadge category={doc.category} /></div>
            </div>
            {doc.description && (
              <div>
                <span className="text-xs text-foreground/50">Description</span>
                <p className="text-foreground/70">{doc.description}</p>
              </div>
            )}
            <div className="flex gap-4">
              <div>
                <span className="text-xs text-foreground/50">Taille</span>
                <p>{formatSize(doc.size_bytes)}</p>
              </div>
              <div>
                <span className="text-xs text-foreground/50">Type</span>
                <p>{getMimeShortName(doc.mime_type)}</p>
              </div>
            </div>
            <div>
              <span className="text-xs text-foreground/50">Televerse le</span>
              <p>{formatDate(doc.uploaded_at)}</p>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      {!editMode && (
        <div className="px-4 pb-4 flex gap-2">
          <a
            href={`/api/documents/${doc.id}/download`}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-amber text-white shadow-sm transition-colors hover:bg-brand-amber-dark"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Telecharger
          </a>
          <button
            onClick={onEdit}
            className="px-3 py-2 rounded-lg text-xs font-medium text-foreground/70 bg-parchment-dark hover:bg-parchment-dark/80 transition-colors"
          >
            Modifier
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-2 rounded-lg text-xs font-medium text-accent-red bg-accent-red/10 hover:bg-accent-red/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Upload Dialog ───────────────────────────────────────────

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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <h3 className="font-serif text-lg font-bold text-foreground mb-4">Televerser un document</h3>

        {file && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-parchment-dark/50 mb-4">
            <FileIcon mimeType={file.type} size={24} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-foreground/50">{formatSize(file.size)}</p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-foreground/50 mb-1">Categorie</label>
            <input
              type="text"
              list="upload-category-list"
              value={category}
              onChange={(e) => onCategoryChange(e.target.value)}
              placeholder="Saisir ou choisir une categorie"
              className="w-full px-3 py-2 rounded-lg border border-border bg-parchment text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-amber/40"
            />
            <datalist id="upload-category-list">
              {categories.map((c) => (
                <option key={c} value={c}>{getCategoryLabel(c)}</option>
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs text-foreground/50 mb-1">Nom d&apos;affichage (optionnel)</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              placeholder={file?.name || ""}
              className="w-full px-3 py-2 rounded-lg border border-border bg-parchment text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-brand-amber/40"
            />
          </div>
          <div>
            <label className="block text-xs text-foreground/50 mb-1">Description (optionnel)</label>
            <textarea
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-parchment text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-brand-amber/40 resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 rounded-lg text-sm text-foreground/70 bg-parchment-dark hover:bg-parchment-dark/80 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={onUpload}
            disabled={uploading || !file}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-brand-amber text-white shadow-sm transition-colors hover:bg-brand-amber-dark disabled:opacity-50"
          >
            {uploading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Televersement...
              </>
            ) : (
              "Televerser"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
