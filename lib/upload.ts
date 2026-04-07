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
  "image/svg+xml",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
  "application/zip",
]);

export function generateDocumentId(): string {
  return crypto.randomUUID();
}

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `Le fichier dépasse la taille maximale de 50 Mo (${formatSize(file.size)})`;
  }

  if (file.name.length > MAX_FILENAME_LENGTH) {
    return `Le nom du fichier dépasse ${MAX_FILENAME_LENGTH} caractères`;
  }

  if (!ALLOWED_MIME_TYPES.has(file.type) && !file.type.startsWith("image/")) {
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

  const filePath = path.join(docDir, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  return `documents/${documentId}/${file.name}`;
}

export function deleteFile(filePath: string): void {
  const fullPath = path.join(UPLOADS_DIR, filePath);
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
  return path.join(UPLOADS_DIR, relativePath);
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
