import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { getAuthUser, logoutUser, getProtectedUserData } from '../lib/auth-server.ts';
import CampusLogo from '../components/CampusLogo.tsx';

export const Route = createFileRoute('/profile')({
  beforeLoad: async () => {
    const { user } = await getAuthUser();
    if (!user) {
      throw redirect({ to: '/login' });
    }
    return { user };
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [protectedMessage, setProtectedMessage] = useState<string | null>(null);
  const [loadingProtected, setLoadingProtected] = useState(false);

  const handleLogout = async () => {
    await logoutUser();
    navigate({ to: '/' });
    window.location.reload();
  };

  const handleTestProtectedEndpoint = async () => {
    setLoadingProtected(true);
    try {
      const res = await getProtectedUserData();
      setProtectedMessage(res.message);
    } catch (e: any) {
      setProtectedMessage(`Error: ${e.message}`);
    } finally {
      setLoadingProtected(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-140px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg eth-card p-8 border border-[var(--line)] bg-[var(--surface-card)] shadow-2xl">
        <div className="mb-6 flex items-center justify-between border-b border-[var(--line)] pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--chip-bg)] border border-[var(--chip-line)] shadow-sm">
              <CampusLogo size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                User Account
              </h1>
              <p className="text-xs text-[var(--text-muted)] font-mono">
                Verified Session &amp; Document Permissions
              </p>
            </div>
          </div>
          <span className="rounded-lg border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1 text-xs font-mono font-bold uppercase tracking-wider text-[var(--eth-blue)]">
            {user.role}
          </span>
        </div>

        <div className="space-y-3 text-xs font-mono">
          <div className="flex justify-between items-center py-2.5 border-b border-[var(--line)]">
            <span className="text-[var(--text-muted)] uppercase tracking-wider">User ID</span>
            <span className="text-[var(--text-primary)] font-semibold">{user.id}</span>
          </div>
          <div className="flex justify-between items-center py-2.5 border-b border-[var(--line)]">
            <span className="text-[var(--text-muted)] uppercase tracking-wider">Email</span>
            <span className="text-[var(--text-primary)] font-sans font-medium">{user.email}</span>
          </div>
          <div className="flex justify-between items-center py-2.5 border-b border-[var(--line)]">
            <span className="text-[var(--text-muted)] uppercase tracking-wider">Access Level</span>
            <span className="text-emerald-400 font-semibold uppercase">{user.role} tier</span>
          </div>
          <div className="flex justify-between items-center py-2.5 border-b border-[var(--line)]">
            <span className="text-[var(--text-muted)] uppercase tracking-wider">Department</span>
            <span className="text-[var(--eth-purple)] font-semibold uppercase">{user.department}</span>
          </div>
          <div className="flex justify-between items-center py-2.5 border-b border-[var(--line)]">
            <span className="text-[var(--text-muted)] uppercase tracking-wider">Member Since</span>
            <span className="text-[var(--text-secondary)] font-sans">
              {new Date(user.createdAt).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <button
            onClick={handleTestProtectedEndpoint}
            disabled={loadingProtected}
            className="w-full eth-button-secondary !py-2.5 text-xs font-mono"
          >
            {loadingProtected ? 'Validating Session...' : 'Test Server-Side Authentication'}
          </button>

          {protectedMessage && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs font-mono text-emerald-400">
              {protectedMessage}
            </div>
          )}

          <button
            onClick={handleLogout}
            className="w-full rounded-xl border border-red-500/30 bg-red-500/10 py-2.5 text-xs font-mono font-semibold text-red-400 transition hover:bg-red-500/20"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
