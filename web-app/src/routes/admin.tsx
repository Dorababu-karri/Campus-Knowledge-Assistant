import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { getAuthUser } from '../lib/auth-server.ts';
import {
  getAdminDocumentList,
  ingestAdminDocument,
  deleteAdminDocument,
  type DocumentItem,
} from '../lib/admin-server.ts';
import {
  getAdminAuditLogsFn,
  getAdminAnalyticsFn,
} from '../lib/analytics-server.ts';
import type { AuditLog } from '../db/schema.ts';
import type { AnalyticsSummary } from '../lib/analytics.ts';
import CampusLogo from '../components/CampusLogo.tsx';

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const { user } = await getAuthUser();
    if (!user || user.role !== 'admin') {
      throw redirect({ to: '/login' });
    }
    return { user };
  },
  component: AdminPage,
});

function AdminPage() {
  const { user } = Route.useRouteContext();
  const [activeTab, setActiveTab] = useState<'documents' | 'audit' | 'analytics'>('documents');

  // Document Management States
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [totalChunks, setTotalChunks] = useState<number>(0);
  const [isLoadingDocs, setIsLoadingDocs] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Ingestion Form State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [accessLevel, setAccessLevel] = useState<'public' | 'student' | 'staff'>('student');
  const [department, setDepartment] = useState<string>('all');
  const [isIngesting, setIsIngesting] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Audit Logs States
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState<number>(0);
  const [auditStatusFilter, setAuditStatusFilter] = useState<string>('all');
  const [auditSearch, setAuditSearch] = useState<string>('');
  const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);

  // Analytics States
  const [analyticsData, setAnalyticsData] = useState<AnalyticsSummary | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState<boolean>(false);

  useEffect(() => {
    loadDocumentRegistry();
  }, []);

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs();
    } else if (activeTab === 'analytics') {
      loadAnalytics();
    }
  }, [activeTab]);

  const loadDocumentRegistry = async () => {
    setIsLoadingDocs(true);
    setError(null);
    try {
      const res = await getAdminDocumentList();
      setDocuments(res.documents);
      setTotalChunks(res.total_chunks);
    } catch (err: any) {
      setError(err.message || 'Failed to load document registry.');
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const loadAuditLogs = async () => {
    setIsLoadingAudit(true);
    setError(null);
    try {
      const res = await getAdminAuditLogsFn({
        data: {
          limit: 100,
          status: auditStatusFilter,
          search: auditSearch,
        },
      });
      setAuditLogs(res.logs);
      setAuditTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch audit logs.');
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const loadAnalytics = async () => {
    setIsLoadingAnalytics(true);
    setError(null);
    try {
      const res = await getAdminAnalyticsFn();
      setAnalyticsData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load system analytics.');
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setError(null);
      setSuccessMsg(null);
    }
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a PDF document to upload.');
      return;
    }

    setIsIngesting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const resultStr = reader.result as string;
          const base64Data = resultStr.split(',')[1] || resultStr;

          const res = await ingestAdminDocument({
            data: {
              filename: selectedFile.name,
              contentBase64: base64Data,
              accessLevel,
              department,
            },
          });

          setSuccessMsg(
            `Successfully indexed "${res.filename}"! Created ${res.chunks_indexed} chunks with access level "${res.access_level}" (${res.department}).`
          );
          setSelectedFile(null);
          loadDocumentRegistry();
        } catch (uploadErr: any) {
          setError(uploadErr.message || 'Failed to ingest document.');
        } finally {
          setIsIngesting(false);
        }
      };

      reader.onerror = () => {
        setError('Failed to read file from disk.');
        setIsIngesting(false);
      };

      reader.readAsDataURL(selectedFile);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      setIsIngesting(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`Are you sure you want to delete "${filename}" and all its vector chunks?`)) {
      return;
    }

    setError(null);
    setSuccessMsg(null);

    try {
      const res = await deleteAdminDocument({ data: filename });
      setSuccessMsg(`Deleted "${res.filename}" and removed ${res.chunks_deleted} chunks from ChromaDB.`);
      loadDocumentRegistry();
    } catch (err: any) {
      setError(err.message || 'Failed to delete document.');
    }
  };

  const filteredDocs = documents.filter((doc) =>
    doc.document.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <main className="page-wrap px-4 py-8 md:py-12 max-w-5xl mx-auto space-y-6">
      {/* Header Bar */}
      <section className="eth-card p-6 md:p-8 border border-[var(--line)] bg-[var(--surface-card)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--chip-bg)] border border-[var(--chip-line)] shadow-sm">
              <CampusLogo size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                  System Administration
                </h1>
                <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-bold uppercase text-amber-400">
                  ADMIN ONLY
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">
                RBAC governance, knowledge ingestion, security audit logs &amp; analytics • <strong className="text-[var(--text-primary)]">{user.email}</strong>
              </p>
            </div>
          </div>

          {/* Quick Metrics Header Badges */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-center">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block">Policies</span>
              <strong className="text-[var(--eth-blue)] text-sm">{documents.length}</strong>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-center">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block">Chunks</span>
              <strong className="text-[var(--eth-purple)] text-sm">{totalChunks}</strong>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-center">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block">Queries</span>
              <strong className="text-emerald-400 text-sm">{analyticsData ? analyticsData.totalQueries : auditTotal}</strong>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-[var(--line)] overflow-x-auto">
          <button
            onClick={() => setActiveTab('documents')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold font-mono transition-all border ${
              activeTab === 'documents'
                ? 'bg-[var(--chip-bg)] border-[var(--eth-blue)] text-[var(--eth-blue)] shadow-sm'
                : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span>📑</span>
            <span>Knowledge Base ({documents.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold font-mono transition-all border ${
              activeTab === 'audit'
                ? 'bg-[var(--chip-bg)] border-[var(--eth-blue)] text-[var(--eth-blue)] shadow-sm'
                : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span>🛡️</span>
            <span>Security &amp; Audit Logs</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold font-mono transition-all border ${
              activeTab === 'analytics'
                ? 'bg-[var(--chip-bg)] border-[var(--eth-blue)] text-[var(--eth-blue)] shadow-sm'
                : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span>📊</span>
            <span>Analytics &amp; Feedback</span>
          </button>
        </div>
      </section>

      {/* Notifications */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs font-mono text-red-400 flex items-center gap-2">
          <span className="text-base">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-mono text-emerald-400 flex items-center gap-2">
          <span className="text-base">✓</span>
          <span>{successMsg}</span>
        </div>
      )}

      {/* TAB 1: KNOWLEDGE BASE & DOCUMENT MANAGEMENT */}
      {activeTab === 'documents' && (
        <div className="space-y-6">
          {/* Upload and Ingestion Form */}
          <section className="eth-card p-6 border border-[var(--line)] bg-[var(--surface-card)]">
            <h2 className="text-base font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2 mb-4">
              <span>📤</span>
              <span>Upload &amp; Ingest New Policy</span>
            </h2>

            <form onSubmit={handleIngest} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1 font-mono">
                    Select Document (.pdf, .txt)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.txt"
                    onChange={handleFileChange}
                    disabled={isIngesting}
                    className="w-full text-xs text-[var(--text-secondary)] file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[var(--chip-bg)] file:text-[var(--eth-blue)] hover:file:opacity-80 cursor-pointer border border-[var(--line)] rounded-xl p-1.5 bg-[var(--surface-input)]"
                  />
                  {selectedFile && (
                    <p className="text-[11px] font-mono text-emerald-400 mt-1 truncate">
                      Ready: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1 font-mono">
                    Access Level (RBAC)
                  </label>
                  <select
                    value={accessLevel}
                    onChange={(e) => setAccessLevel(e.target.value as 'public' | 'student' | 'staff')}
                    disabled={isIngesting}
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-input)] px-3 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--eth-blue)]"
                  >
                    <option value="public">Public (Everyone)</option>
                    <option value="student">Student (Students, Staff &amp; Admin)</option>
                    <option value="staff">Staff (Staff Only &amp; Admin)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1 font-mono">
                    Department Domain
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    disabled={isIngesting}
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-input)] px-3 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--eth-blue)]"
                  >
                    <option value="all">All Departments</option>
                    <option value="academics">Academics</option>
                    <option value="engineering">Engineering</option>
                    <option value="business">Business</option>
                    <option value="law">Law</option>
                    <option value="admissions">Admissions</option>
                    <option value="general">General</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isIngesting || !selectedFile}
                  className="eth-button-primary disabled:opacity-50 disabled:cursor-not-allowed !py-2.5 !px-5"
                >
                  {isIngesting ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Processing &amp; Indexing...</span>
                    </div>
                  ) : (
                    <span>Ingest into ChromaDB</span>
                  )}
                </button>
              </div>
            </form>
          </section>

          {/* Document Registry Table */}
          <section className="eth-card p-6 border border-[var(--line)] bg-[var(--surface-card)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-base font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                <span>📚</span>
                <span>ChromaDB Document Registry ({documents.length})</span>
              </h2>

              <input
                type="text"
                placeholder="Search policies..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="rounded-xl border border-[var(--line)] bg-[var(--surface-input)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--eth-blue)] w-full sm:w-60"
              />
            </div>

            {isLoadingDocs ? (
              <div className="p-8 text-center text-xs font-mono text-[var(--text-muted)]">
                <div className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 border-2 border-[var(--eth-blue)] border-t-transparent rounded-full animate-spin" />
                  <span>Scanning ChromaDB collection...</span>
                </div>
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-[var(--text-muted)]">
                No matching documents found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-[var(--text-muted)] uppercase">
                      <th className="py-2.5 px-3">Document</th>
                      <th className="py-2.5 px-3">Access Level</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3 text-center">Chunks</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {filteredDocs.map((doc, idx) => (
                      <tr key={idx} className="hover:bg-[var(--surface)] transition-colors">
                        <td className="py-3 px-3 font-semibold text-[var(--text-primary)] flex items-center gap-2">
                          <span className="text-[var(--eth-blue)]">📄</span>
                          <span className="truncate max-w-[240px] sm:max-w-md">{doc.document}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                              doc.access_level === 'public'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : doc.access_level === 'student'
                                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {doc.access_level}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[var(--text-secondary)] uppercase">
                          {doc.department}
                        </td>
                        <td className="py-3 px-3 text-center text-[var(--text-primary)] font-bold">
                          {doc.chunks_count}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => handleDelete(doc.document)}
                            className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-400 hover:bg-red-500/20 transition-colors"
                            title="Delete from vector store"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: SECURITY AUDIT & COMPLIANCE LOGS */}
      {activeTab === 'audit' && (
        <section className="eth-card p-6 border border-[var(--line)] bg-[var(--surface-card)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                <span>🛡️</span>
                <span>Security Audit Log ({auditTotal})</span>
              </h2>
              <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">
                Immutable trace of queries, RBAC authorizations, out-of-domain detections, and latencies.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={auditStatusFilter}
                onChange={(e) => {
                  setAuditStatusFilter(e.target.value);
                  setTimeout(loadAuditLogs, 50);
                }}
                className="rounded-xl border border-[var(--line)] bg-[var(--surface-input)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] font-mono focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="authorized">Authorized Only</option>
                <option value="out_of_domain">Out of Domain</option>
                <option value="denied">Denied / Forbidden</option>
              </select>

              <input
                type="text"
                placeholder="Search query or user..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadAuditLogs()}
                className="rounded-xl border border-[var(--line)] bg-[var(--surface-input)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--eth-blue)] w-48 font-mono"
              />

              <button
                onClick={loadAuditLogs}
                className="eth-button-secondary text-xs !py-1.5 !px-3 font-mono"
              >
                Refresh
              </button>
            </div>
          </div>

          {isLoadingAudit ? (
            <div className="p-8 text-center text-xs font-mono text-[var(--text-muted)]">
              <div className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 border-2 border-[var(--eth-blue)] border-t-transparent rounded-full animate-spin" />
                <span>Fetching audit trail...</span>
              </div>
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-[var(--text-muted)]">
              No audit logs recorded matching this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[var(--text-muted)] uppercase">
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">User &amp; Role</th>
                    <th className="py-2.5 px-3">Query</th>
                    <th className="py-2.5 px-3 text-center">Citations</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[var(--surface)] transition-colors">
                      <td className="py-2.5 px-3 text-[var(--text-muted)] whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        <span className="block text-[10px] text-[var(--text-muted)]/70">
                          {new Date(log.createdAt).toLocaleDateString()}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="text-[var(--text-primary)] font-semibold truncate max-w-[140px]">
                          {log.userEmail}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-bold ${
                            log.role === 'admin'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : log.role === 'staff'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}>
                            {log.role}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] uppercase">
                            {log.department}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <span className="line-clamp-2 text-[var(--text-secondary)] font-sans text-xs" title={log.query}>
                          {log.query}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-center font-bold text-[var(--text-primary)]">
                        {log.matchedSourcesCount}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            log.status === 'authorized'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : log.status === 'out_of_domain'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {log.status === 'authorized' ? '✓ Authorized' : log.status === 'out_of_domain' ? '⚠ Out of Domain' : '✕ Denied'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right text-[var(--text-muted)] font-mono whitespace-nowrap">
                        {log.latencyMs} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: QUALITY ANALYTICS & ANSWER FEEDBACK */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {isLoadingAnalytics || !analyticsData ? (
            <div className="eth-card p-12 text-center text-xs font-mono text-[var(--text-muted)] border border-[var(--line)] bg-[var(--surface-card)]">
              <div className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 border-2 border-[var(--eth-blue)] border-t-transparent rounded-full animate-spin" />
                <span>Calculating system KPIs and feedback metrics...</span>
              </div>
            </div>
          ) : (
            <>
              {/* KPI Metrics Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="eth-card p-4 border border-[var(--line)] bg-[var(--surface-card)]">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] block">
                    Total Queries
                  </span>
                  <div className="text-2xl font-bold font-mono text-[var(--text-primary)] mt-1">
                    {analyticsData.totalQueries}
                  </div>
                  <span className="text-[10px] font-mono text-[var(--eth-blue)] mt-1 block">
                    All-time processed
                  </span>
                </div>

                <div className="eth-card p-4 border border-[var(--line)] bg-[var(--surface-card)]">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] block">
                    Zero-Hallucination Rate
                  </span>
                  <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                    {analyticsData.complianceRate}%
                  </div>
                  <span className="text-[10px] font-mono text-[var(--text-muted)] mt-1 block">
                    {analyticsData.authorizedQueries} authorized / {analyticsData.outOfDomainQueries} filtered
                  </span>
                </div>

                <div className="eth-card p-4 border border-[var(--line)] bg-[var(--surface-card)]">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] block">
                    User Satisfaction
                  </span>
                  <div className="text-2xl font-bold font-mono text-[var(--eth-purple)] mt-1">
                    {analyticsData.satisfactionRate}%
                  </div>
                  <span className="text-[10px] font-mono text-[var(--text-muted)] mt-1 block">
                    👍 {analyticsData.thumbsUpCount} / 👎 {analyticsData.thumbsDownCount}
                  </span>
                </div>

                <div className="eth-card p-4 border border-[var(--line)] bg-[var(--surface-card)]">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] block">
                    Avg Response Latency
                  </span>
                  <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
                    {analyticsData.avgLatencyMs} ms
                  </div>
                  <span className="text-[10px] font-mono text-[var(--text-muted)] mt-1 block">
                    SSE token stream
                  </span>
                </div>
              </div>

              {/* Distributions Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Department Breakdown */}
                <div className="eth-card p-5 border border-[var(--line)] bg-[var(--surface-card)] space-y-3">
                  <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5">
                    <span>🏢</span>
                    <span>Queries by Department Domain</span>
                  </h3>
                  <div className="space-y-2">
                    {analyticsData.departmentBreakdown.map((dept, idx) => {
                      const pct = analyticsData.totalQueries > 0
                        ? Math.round((dept.count / analyticsData.totalQueries) * 100)
                        : 0;
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-[var(--text-secondary)] uppercase">{dept.department}</span>
                            <span className="text-[var(--text-muted)]">{dept.count} ({pct}%)</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-[var(--surface)] overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[var(--eth-blue)] to-[var(--eth-purple)] rounded-full transition-all duration-500"
                              style={{ width: `${Math.max(4, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Role Breakdown */}
                <div className="eth-card p-5 border border-[var(--line)] bg-[var(--surface-card)] space-y-3">
                  <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5">
                    <span>👥</span>
                    <span>Queries by User Role</span>
                  </h3>
                  <div className="space-y-2">
                    {analyticsData.roleBreakdown.map((r, idx) => {
                      const pct = analyticsData.totalQueries > 0
                        ? Math.round((r.count / analyticsData.totalQueries) * 100)
                        : 0;
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-[var(--text-secondary)] uppercase">{r.role}</span>
                            <span className="text-[var(--text-muted)]">{r.count} ({pct}%)</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-[var(--surface)] overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all duration-500"
                              style={{ width: `${Math.max(4, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Recent User Feedback Review */}
              <section className="eth-card p-6 border border-[var(--line)] bg-[var(--surface-card)] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5">
                    <span>💬</span>
                    <span>User Answer Feedback ({analyticsData.recentFeedback.length})</span>
                  </h3>
                  <button
                    onClick={loadAnalytics}
                    className="eth-button-secondary text-xs !py-1 !px-2.5 font-mono"
                  >
                    Refresh
                  </button>
                </div>

                {analyticsData.recentFeedback.length === 0 ? (
                  <div className="p-6 text-center text-xs font-mono text-[var(--text-muted)]">
                    No answer feedback submitted yet.
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--line)]">
                    {analyticsData.recentFeedback.map((fb) => (
                      <div key={fb.id} className="py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                                fb.rating > 0
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {fb.rating > 0 ? '👍 Helpful' : '👎 Needs Improvement'}
                            </span>
                            <span className="text-xs font-mono text-[var(--text-muted)]">
                              by {fb.userEmail}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">
                              • {new Date(fb.createdAt).toLocaleString()}
                            </span>
                          </div>

                          {fb.comment && (
                            <p className="text-xs text-amber-300 font-mono italic pl-2 border-l-2 border-amber-400/40">
                              "{fb.comment}"
                            </p>
                          )}

                          <p className="text-[11px] text-[var(--text-secondary)] font-sans line-clamp-1 italic text-ellipsis">
                            Response: "{fb.messageContent}..."
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </main>
  );
}
