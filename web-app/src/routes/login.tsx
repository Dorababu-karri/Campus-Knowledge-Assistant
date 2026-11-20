import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { loginUser } from '../lib/auth-server.ts';
import CampusLogo from '../components/CampusLogo.tsx';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await loginUser({ data: { email, password } });
      navigate({ to: '/' });
      window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-140px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md eth-card p-8 border border-[var(--line)] bg-[var(--surface-card)] shadow-2xl">
        <div className="mb-8 text-center flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--chip-bg)] border border-[var(--chip-line)] shadow-sm">
            <CampusLogo size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Sign In
          </h1>
          <p className="mt-1.5 text-xs text-[var(--text-secondary)] font-mono">
            Access role-authorized university policy information
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-mono text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1 font-mono">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@university.edu"
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-input)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--eth-blue)] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1 font-mono">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-input)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--eth-blue)] transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full eth-button-primary mt-2 !py-2.5"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--text-secondary)]">
          Need an account?{' '}
          <Link to="/register" className="font-semibold text-[var(--eth-blue)] hover:underline">
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
}
