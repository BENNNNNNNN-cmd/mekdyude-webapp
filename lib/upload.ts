import fs from "fs";
import path from "path";
import crypto from "crypto";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_FILENAME_LENGTH = 255;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
  "application/zip",
]);

export function generateDocumentId(): string {
  return crypto.randomUUID();
}

function normalizeFilename(filename: string): string {
  return filename
    .replace(/[\\/]/g, "_")
    .replace(/[\0-\x1F\x7F]/g, "_")
    .trim();
}

export function sanitizeFilename(filename: string): string {
  return normalizeFilename(path.basename(normalizeFilename(filename))).slice(0, MAX_FILENAME_LENGTH);
}

function getStorageFilename(filename: string): string {
  const ext = path.extname(sanitizeFilename(filename)).toLowerCase();
  return `${crypto.randomUUID()}${ext}`;
}

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `Le fichier dépasse la taille maximale de 50 Mo (${formatSize(file.size)})`;
  }

  const normalizedName = normalizeFilename(file.name);
  if (!normalizedName) {
    return "Nom de fichier invalide";
  }

  if (normalizedName.length > MAX_FILENAME_LENGTH) {
    return `Le nom du fichier dépasse ${MAX_FILENAME_LENGTH} caractères`;
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return `Type de fichier non supporté: ${file.type}`;
  }

  return null;
}

export async function saveFile(
  file: File,
  documentId: string
): Promise<string> {
  const docDir = path.join(UPLOADS_DIR, "documents", documentId);
  fs.mkdirSync(docDir, { recursive: true });

  const storageFilename = getStorageFilename(file.name);
  const filePath = path.join(docDir, storageFilename);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  return `documents/${documentId}/${storageFilename}`;
}

export function deleteFile(filePath: string): void {
  const fullPath = getFullPath(filePath);
  const dir = path.dirname(fullPath);

  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
  // Remove the UUID directory if empty
  if (fs.existsSync(dir)) {
    try {
      fs.rmdirSync(dir);
    } catch {
      // Directory not empty, ignore
    }
  }
}

export function getFullPath(relativePath: string): string {
  const uploadsRoot = path.resolve(UPLOADS_DIR);
  const resolvedPath = path.resolve(UPLOADS_DIR, relativePath);

  if (resolvedPath !== uploadsRoot && !resolvedPath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error("Invalid file path");
  }

  return resolvedPath;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function guessCategoryFromMime(mimeType: string): string {
  if (mimeType === "application/pdf") return "regles";
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType === "text/csv"
  )
    return "inventaires";
  if (mimeType.startsWith("image/")) return "cartes";
  return "general";
}
