import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAllDocuments, insertDocument } from "@/lib/documents";
import { getSession } from "@/lib/session";
import {
  generateDocumentId,
  validateFile,
  saveFile,
  guessCategoryFromMime,
  sanitizeFilename,
} from "@/lib/upload";

async function requireSession() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return session;
}

export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category") || undefined;
  const search = searchParams.get("search") || undefined;

  const documents = getAllDocuments(category, search);
  return NextResponse.json(documents);
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
  }

  const validationError = validateFile(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const id = generateDocumentId();
  const category = (formData.get("category") as string) || guessCategoryFromMime(file.type);
  const display_name = (formData.get("display_name") as string) || null;
  const description = (formData.get("description") as string) || null;

  const filePath = await saveFile(file, id);

  const doc = insertDocument({
    id,
    filename: sanitizeFilename(file.name),
    display_name,
    category,
    description,
    mime_type: file.type,
    size_bytes: file.size,
    file_path: filePath,
  });

  revalidatePath("/documents");

  return NextResponse.json(doc, { status: 201 });
}
