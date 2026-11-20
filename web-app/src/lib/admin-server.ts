import { createServerFn } from '@tanstack/react-start';
import { getCurrentUser } from './auth.ts';

export interface DocumentItem {
  document: string;
  chunks_count: number;
  access_level: string;
  department: string;
  pages_count: number;
}

export interface IngestInput {
  filename: string;
  contentBase64: string;
  accessLevel: string;
  department?: string;
}

/**
 * Retrieves the complete registry of indexed documents from FastAPI.
 * Strictly gated to admin users.
 */
export const getAdminDocumentList = createServerFn({ method: 'GET' })
  .handler(async () => {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      throw new Error('Forbidden: System Administrator access required.');
    }

    const internalSecret = process.env.RAG_INTERNAL_SECRET || 'campus_rag_secret_2026';
    try {
      const response = await fetch('http://127.0.0.1:8000/documents', {
        method: 'GET',
        headers: {
          'X-Internal-Secret': internalSecret,
        },
      });

      if (!response.ok) {
        let detail = '';
        try {
          const errData = await response.json();
          detail = errData.detail || '';
        } catch (_) {}
        throw new Error(`FastAPI error ${response.status}: ${detail}`);
      }

      const data = await response.json();
      return data as { documents: DocumentItem[]; total_chunks: number };
    } catch (err: any) {
      console.error('Failed to fetch document registry:', err);
      throw new Error(err.message || 'Failed to connect to FastAPI document registry.');
    }
  });

/**
 * Uploads, registers permissions, and ingests a new policy document into ChromaDB.
 * Strictly gated to admin users.
 */
export const ingestAdminDocument = createServerFn({ method: 'POST' })
  .validator((data: IngestInput) => data)
  .handler(async ({ data: input }) => {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      throw new Error('Forbidden: System Administrator access required.');
    }

    if (!input.filename || !input.contentBase64) {
      throw new Error('Filename and file content are required.');
    }

    const internalSecret = process.env.RAG_INTERNAL_SECRET || 'campus_rag_secret_2026';
    try {
      const response = await fetch('http://127.0.0.1:8000/documents/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': internalSecret,
        },
        body: JSON.stringify({
          filename: input.filename,
          content_base64: input.contentBase64,
          access_level: input.accessLevel,
          department: input.department || 'all',
        }),
      });

      if (!response.ok) {
        let detail = '';
        try {
          const errData = await response.json();
          detail = errData.detail || '';
        } catch (_) {}
        throw new Error(`Ingestion error ${response.status}: ${detail}`);
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      console.error('Failed to ingest document:', err);
      throw new Error(err.message || 'Failed to ingest document into vector store.');
    }
  });

/**
 * Deletes all chunks of a document from ChromaDB.
 * Strictly gated to admin users.
 */
export const deleteAdminDocument = createServerFn({ method: 'POST' })
  .validator((filename: string) => filename)
  .handler(async ({ data: filename }) => {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      throw new Error('Forbidden: System Administrator access required.');
    }

    if (!filename) {
      throw new Error('Filename is required.');
    }

    const internalSecret = process.env.RAG_INTERNAL_SECRET || 'campus_rag_secret_2026';
    try {
      const response = await fetch(`http://127.0.0.1:8000/documents/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: {
          'X-Internal-Secret': internalSecret,
        },
      });

      if (!response.ok) {
        let detail = '';
        try {
          const errData = await response.json();
          detail = errData.detail || '';
        } catch (_) {}
        throw new Error(`Deletion error ${response.status}: ${detail}`);
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      console.error('Failed to delete document:', err);
      throw new Error(err.message || 'Failed to delete document from vector store.');
    }
  });

