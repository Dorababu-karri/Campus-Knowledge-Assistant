import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';
import CampusLogo from './CampusLogo';
import { getAuthUser, logoutUser } from '../lib/auth-server.ts';
import type { SafeUser } from '../db/schema.ts';

export default function Header() {
  const [user, setUser] = useState<SafeUser | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getAuthUser()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null));
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    navigate({ to: '/' });
    window.location.reload();
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-xl transition-colors duration-200">
      <nav className="page-wrap flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-3 sm:py-3.5">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="group flex items-center gap-2.5 no-underline transition-opacity hover:opacity-90"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--chip-bg)] border border-[var(--chip-line)] shadow-sm transition-transform duration-200 group-hover:scale-105">
              <CampusLogo size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-[var(--text-primary)] sm:text-base">
                Campus<span className="text-[var(--eth-blue)]">Assistant</span>
              </span>
              <span className="text-[10px] font-medium tracking-wider text-[var(--text-muted)] uppercase font-mono">
                Policy Knowledge Base
              </span>
            </div>
          </Link>

          {/* System Status Ticker */}
          <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>RAG ENGINE ONLINE • v7.2</span>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="order-3 flex w-full items-center justify-center gap-x-2 pb-1 text-xs font-medium sm:order-none sm:w-auto sm:pb-0 sm:text-sm">
          <Link
            to="/"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            Assistant
          </Link>
          <Link
            to="/about"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            Policies &amp; Bylaws
          </Link>
          {user && (
            <Link
              to="/profile"
              className="nav-link"
              activeProps={{ className: 'nav-link is-active' }}
            >
              Account
            </Link>
          )}
          {user && user.role === 'admin' && (
            <Link
              to="/admin"
              className="nav-link text-amber-400 font-semibold"
              activeProps={{ className: 'nav-link is-active' }}
            >
              Admin Portal
            </Link>
          )}
        </div>

        {/* User Account / Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {user ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-xl border border-[var(--chip-line)] bg-[var(--chip-bg)] px-2.5 py-1 text-xs font-mono text-[var(--text-primary)]">
                <span className="h-2 w-2 rounded-full bg-[var(--eth-blue)] shadow-[0_0_8px_var(--eth-blue)]" />
                <span className="font-semibold uppercase tracking-wider text-[var(--eth-blue)]">
                  {user.role}
                </span>
                <span className="text-[var(--text-muted)]">•</span>
                <span className="hidden md:inline text-[var(--text-secondary)]">
                  {user.department}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--chip-bg)] hover:text-red-400"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--chip-bg)] hover:border-[var(--eth-blue)]"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="eth-button-primary text-xs !py-1.5 !px-3"
              >
                Register
              </Link>
            </div>
          )}

          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
