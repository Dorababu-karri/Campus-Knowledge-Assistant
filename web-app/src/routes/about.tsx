import { createFileRoute } from '@tanstack/react-router'
import CampusLogo from '../components/CampusLogo.tsx'

export const Route = createFileRoute('/about')({
  component: About,
})

const POLICIES = [
  { name: 'Attendance-Policy.pdf', tier: 'Public', dept: 'All', desc: '75% mandatory class attendance, debarment criteria, and medical condonation rules.' },
  { name: 'Student-Code-of-Conduct-1.pdf', tier: 'Public', dept: 'All', desc: 'Ethical behavior, disciplinary action framework, and academic honesty expectations.' },
  { name: 'refund-policy.pdf', tier: 'Public', dept: 'All', desc: 'UGC-mandated fee refund slabs, notification periods, and deduction percentages.' },
  { name: 'central-library-policy.pdf', tier: 'Public', dept: 'All', desc: 'Borrowing privileges, digital resource usage, overdue fines, and repository rules.' },
  { name: 'Academic-Policy.pdf', tier: 'Student', dept: 'All', desc: 'Degree completion, course credits, evaluation patterns, and grading scales.' },
  { name: 'information-technology-policy.pdf', tier: 'Student', dept: 'All', desc: 'Campus network security, acceptable device usage, and IT infrastructure access.' },
  { name: 'placement-facilitation-policy.pdf', tier: 'Student', dept: 'All', desc: 'Eligibility for campus placement drives, offer acceptance rules, and CDC policy.' },
  { name: 'student-support-services-policy.pdf', tier: 'Student', dept: 'All', desc: 'Hostel accommodation, transport services, counseling, and health care.' },
  { name: '13.-Examination-Evaluation-Manual-2022-23.pdf', tier: 'Staff', dept: 'Academics', desc: 'Moderation, invigilation guidelines, grading rubrics, and grade committee bylaws.' },
]

function About() {
  return (
    <main className="page-wrap px-4 py-12 max-w-4xl mx-auto space-y-10">
      {/* Intro Header */}
      <section className="eth-card p-8 border border-[var(--line)] bg-[var(--surface-card)]">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--chip-bg)] border border-[var(--chip-line)]">
            <CampusLogo size={20} />
          </div>
          <div>
            <span className="text-xs font-mono text-[var(--eth-blue)] uppercase tracking-wider font-semibold">
              Policy Architecture
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              University Policy &amp; Access Governance
            </h1>
          </div>
        </div>

        <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
          The Campus Knowledge Assistant indexes official institutional governance documents into a high-dimensional vector space powered by ChromaDB, Nomic Embeddings (768-D), and Llama 3.2. All queries pass through pre-retrieval Role-Based Access Control (RBAC) and cosine similarity guardrails (&lt; 0.42) to eliminate hallucinations.
        </p>
      </section>

      {/* Indexed Document Registry */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <span>📚</span>
            <span>Document Directory ({POLICIES.length} Verified Policies)</span>
          </h2>
          <span className="text-xs font-mono text-[var(--eth-blue)] bg-[var(--chip-bg)] px-2.5 py-1 rounded-lg border border-[var(--chip-line)]">
            OFFICIAL ARCHIVE
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {POLICIES.map((doc, idx) => (
            <div
              key={idx}
              className="eth-card p-5 border border-[var(--line)] bg-[var(--surface-card)] hover:border-[var(--eth-blue)] transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-semibold text-[var(--text-primary)] truncate max-w-[220px]">
                  {doc.name}
                </span>
                <div className="flex items-center gap-1.5 text-[10px] font-mono">
                  <span className={`px-2 py-0.5 rounded font-bold uppercase ${
                    doc.tier === 'Public' 
                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                      : doc.tier === 'Student' 
                      ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' 
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {doc.tier}
                  </span>
                  <span className="bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--line)] px-1.5 py-0.5 rounded uppercase">
                    {doc.dept}
                  </span>
                </div>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {doc.desc}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
