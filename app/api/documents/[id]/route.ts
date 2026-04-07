import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDocumentById, updateDocument, deleteDocument } from "@/lib/documents";
import { deleteFile } from "@/lib/upload";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const { id } = await params;
  const doc = getDocumentById(id);
  if (!doc) {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }

  deleteFile(doc.file_path);
  deleteDocument(id);

  revalidatePath("/documents");

  return NextResponse.json({ success: true });
}
