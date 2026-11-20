import CampusLogo from './CampusLogo';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-[var(--line)] bg-[var(--surface-card)] px-4 pb-12 pt-10 text-[var(--text-secondary)] backdrop-blur-xl">
      <div className="page-wrap flex flex-col gap-8">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--chip-bg)] border border-[var(--chip-line)]">
              <CampusLogo size={18} />
            </div>
            <div>
              <p className="m-0 font-mono text-xs font-bold text-[var(--text-primary)]">
                CAMPUS KNOWLEDGE ASSISTANT
              </p>
              <p className="m-0 text-[11px] text-[var(--text-muted)]">
                Institutional Policy Intelligence &amp; Retrieval Engine
              </p>
            </div>
          </div>

          {/* Telemetry Pills */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[var(--text-muted)]">
              POLICIES: <strong className="text-[var(--eth-blue)]">9 INDEXED</strong>
            </span>
            <span className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[var(--text-muted)]">
              DIM: <strong className="text-[var(--eth-purple)]">768-D NOMIC</strong>
            </span>
            <span className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[var(--text-muted)]">
              MAX_DIST: <strong className="text-emerald-400">0.42 COSINE</strong>
            </span>
            <span className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[var(--text-muted)]">
              RBAC: <strong className="text-[var(--eth-cyan)]">PRE-FILTER</strong>
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-[var(--line)] pt-6 text-xs text-[var(--text-muted)] sm:flex-row">
          <p className="m-0">
            &copy; {year} Campus Knowledge Assistant. Grounded strictly on official university regulations.
          </p>
          <div className="flex items-center gap-4">
            <span className="font-mono">FASTAPI + CHROMADB + TANSTACK START</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
