import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync, existsSync } from "fs";
import { Readable } from "stream";
import { getDocumentById } from "@/lib/documents";
import { getSession } from "@/lib/session";
import { getFullPath } from "@/lib/upload";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const doc = getDocumentById(id);
  if (!doc) {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }

  // Only allow preview for images and PDFs
  if (
    doc.mime_type !== "application/pdf" &&
    doc.mime_type !== "image/png" &&
    doc.mime_type !== "image/jpeg" &&
    doc.mime_type !== "image/gif" &&
    doc.mime_type !== "image/webp"
  ) {
    return NextResponse.json(
      { error: "Aperçu non disponible pour ce type de fichier" },
      { status: 404 }
    );
  }

  let filePath: string;
  try {
    filePath = getFullPath(doc.file_path);
  } catch {
    return NextResponse.json({ error: "Chemin de fichier invalide" }, { status: 400 });
  }
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Fichier introuvable sur le disque" }, { status: 404 });
  }

  const stat = statSync(filePath);
  const stream = createReadStream(filePath);

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": doc.mime_type,
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.filename)}"`,
      "Content-Length": stat.size.toString(),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
