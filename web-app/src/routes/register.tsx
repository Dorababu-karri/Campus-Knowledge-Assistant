import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { registerUser } from '../lib/auth-server.ts';
import CampusLogo from '../components/CampusLogo.tsx';

export const Route = createFileRoute('/register')({
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'student' | 'staff'>('student');
  const [department, setDepartment] = useState('general');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);

    try {
      await registerUser({
        data: {
          email,
          password,
          confirmPassword,
          role,
          department,
        },
      });

      navigate({ to: '/' });
      window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-140px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md eth-card p-8 border border-[var(--line)] bg-[var(--surface-card)] shadow-2xl">
        <div className="mb-6 text-center flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--chip-bg)] border border-[var(--chip-line)] shadow-sm">
            <CampusLogo size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Create Account
          </h1>
          <p className="mt-1.5 text-xs text-[var(--text-secondary)] font-mono">
            Register for role-based document access
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1 font-mono">
                Access Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'student' | 'staff')}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-input)] px-3 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--eth-blue)] transition"
              >
                <option value="student">Student</option>
                <option value="staff">Staff / Faculty</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1 font-mono">
                Department
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-input)] px-3 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--eth-blue)] transition"
              >
                <option value="general">General</option>
                <option value="engineering">Engineering</option>
                <option value="business">Business</option>
                <option value="law">Law</option>
                <option value="admissions">Admissions</option>
                <option value="academics">Academics</option>
              </select>
            </div>
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
              placeholder="Min. 8 characters"
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-input)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--eth-blue)] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1 font-mono">
              Confirm Password
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-input)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--eth-blue)] transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full eth-button-primary mt-2 !py-2.5"
          >
            {loading ? 'Creating Account...' : 'Register'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--text-secondary)]">
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-[var(--eth-blue)] hover:underline">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
