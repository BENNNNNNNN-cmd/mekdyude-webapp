import { getDb } from "@/db";

export interface Document {
  id: string;
  filename: string;
  display_name: string | null;
  category: string;
  description: string | null;
  mime_type: string;
  size_bytes: number;
  file_path: string;
  uploaded_at: string;
  updated_at: string;
}

export interface DocumentStats {
  total_count: number;
  total_size_bytes: number;
  by_category: Record<string, { count: number; size: number }>;
}

export function getAllDocuments(category?: string, search?: string): Document[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: string[] = [];

  if (category && category !== "all") {
    conditions.push("category = ?");
    params.push(category);
  }

  if (search) {
    conditions.push(
      "(filename LIKE ? OR display_name LIKE ? OR description LIKE ?)"
    );
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return db
    .prepare(`SELECT * FROM documents ${where} ORDER BY uploaded_at DESC`)
    .all(...params) as Document[];
}

export function getDocumentById(id: string): Document | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as
    | Document
    | undefined;
}

export function insertDocument(doc: Omit<Document, "uploaded_at" | "updated_at">): Document {
  const db = getDb();
  db.prepare(
    `INSERT INTO documents (id, filename, display_name, category, description, mime_type, size_bytes, file_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    doc.id,
    doc.filename,
    doc.display_name,
    doc.category,
    doc.description,
    doc.mime_type,
    doc.size_bytes,
    doc.file_path
  );
  return getDocumentById(doc.id)!;
}

export function updateDocument(
  id: string,
  fields: { display_name?: string; category?: string; description?: string }
): Document | undefined {
  const db = getDb();
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (fields.display_name !== undefined) {
    updates.push("display_name = ?");
    values.push(fields.display_name);
  }
  if (fields.category !== undefined) {
    updates.push("category = ?");
    values.push(fields.category);
  }
  if (fields.description !== undefined) {
    updates.push("description = ?");
    values.push(fields.description);
  }

  if (updates.length === 0) return getDocumentById(id);

  updates.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(
    `UPDATE documents SET ${updates.join(", ")} WHERE id = ?`
  ).run(...values);

  return getDocumentById(id);
}

export function deleteDocument(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM documents WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getDocumentStats(): DocumentStats {
  const db = getDb();

  const total = db
    .prepare(
      "SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as size FROM documents"
    )
    .get() as { count: number; size: number };

  const categories = db
    .prepare(
      "SELECT category, COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as size FROM documents GROUP BY category"
    )
    .all() as Array<{ category: string; count: number; size: number }>;

  const by_category: Record<string, { count: number; size: number }> = {};
  for (const cat of categories) {
    by_category[cat.category] = { count: cat.count, size: cat.size };
  }

  return {
    total_count: total.count,
    total_size_bytes: total.size,
    by_category,
  };
}
