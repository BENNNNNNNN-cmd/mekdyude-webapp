import { getAllDocuments, getDocumentStats } from "@/lib/documents";
import DocumentsClient from "@/components/documents/DocumentsClient";

export default function DocumentsPage() {
  const documents = getAllDocuments();
  const stats = getDocumentStats();
  const existingCategories = [...new Set(documents.map((d) => d.category))];

  return (
    <div className="max-w-[1400px] mx-auto">
      <DocumentsClient
        initialDocuments={documents}
        initialStats={{
          total_count: stats.total_count,
          total_size_bytes: stats.total_size_bytes,
        }}
        existingCategories={existingCategories}
      />
    </div>
  );
}
