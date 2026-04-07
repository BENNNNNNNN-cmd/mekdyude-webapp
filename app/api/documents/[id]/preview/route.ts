import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync, existsSync } from "fs";
import { Readable } from "stream";
import { getDocumentById } from "@/lib/documents";
import { getFullPath } from "@/lib/upload";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const doc = getDocumentById(id);
  if (!doc) {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }

  // Only allow preview for images and PDFs
  if (!doc.mime_type.startsWith("image/") && doc.mime_type !== "application/pdf") {
    return NextResponse.json(
      { error: "Aperçu non disponible pour ce type de fichier" },
      { status: 404 }
    );
  }

  const filePath = getFullPath(doc.file_path);
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
