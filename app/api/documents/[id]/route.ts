import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDocumentById, updateDocument, deleteDocument } from "@/lib/documents";
import { getSession } from "@/lib/session";
import { deleteFile } from "@/lib/upload";

async function requireSession() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return session;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const doc = getDocumentById(id);
  if (!doc) {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }
  return NextResponse.json(doc);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const doc = getDocumentById(id);
  if (!doc) {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }

  const body = await request.json();
  const updated = updateDocument(id, {
    display_name: body.display_name,
    category: body.category,
    description: body.description,
  });

  revalidatePath("/documents");

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const doc = getDocumentById(id);
  if (!doc) {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }

  try {
    deleteFile(doc.file_path);
  } catch {
    return NextResponse.json({ error: "Chemin de fichier invalide" }, { status: 400 });
  }
  deleteDocument(id);

  revalidatePath("/documents");

  return NextResponse.json({ success: true });
}
