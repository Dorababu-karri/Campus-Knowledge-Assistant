import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import type { SafeUser, Session } from '../db/schema.ts';
import { getCookie, setCookie, deleteCookie } from '@tanstack/react-start/server';

export const SESSION_COOKIE_NAME = 'campus_session';
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CreateUserInput {
  email: string;
  password: string;
  role?: string;
  department?: string;
}

/**
 * Validates and creates a new user account with a hashed password and safe defaults.
 */
export async function createUser(input: CreateUserInput): Promise<SafeUser> {
  const email = (input.email || '').trim().toLowerCase();
  const password = input.password || '';

  // 1. Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new Error('Please provide a valid email address.');
  }

  // 2. Password security validation
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  // 3. Duplicate email check
  const existingUser = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (existingUser) {
    throw new Error('An account with this email address already exists.');
  }

  // 4. Role safety enforcement: Users CANNOT register as admin.
  // Allowed self-registration roles: 'student' or 'staff'. Defaults to 'student'.
  let safeRole: 'public' | 'student' | 'staff' | 'admin' = 'student';
  if (input.role === 'staff') {
    safeRole = 'staff';
  } else if (input.role === 'public') {
    safeRole = 'public';
  }
  // Any attempt to submit 'admin' or invalid values falls back to 'student'.

  // 5. Department sanitization
  const safeDept = (input.department || 'general').trim().slice(0, 50) || 'general';

  // 6. Hash password
  const passwordHash = bcrypt.hashSync(password, 10);
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  // 7. Insert user
  db.insert(schema.users).values({
    id: userId,
    email,
    passwordHash,
    role: safeRole,
    department: safeDept,
    createdAt: now,
  }).run();

  return {
    id: userId,
    email,
    role: safeRole,
    department: safeDept,
    createdAt: now,
  };
}

/**
 * Securely verifies a plain-text password against a stored bcrypt hash.
 */
export function verifyPassword(plainPassword: string, passwordHash: string): boolean {
  if (!plainPassword || !passwordHash) return false;
  return bcrypt.compareSync(plainPassword, passwordHash);
}

/**
 * Creates a database session record for a given user ID.
 */
export function createSessionRecord(userId: string): Session {
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS).toISOString();
  const createdAt = now.toISOString();

  db.insert(schema.sessions).values({
    id: sessionId,
    userId,
    expiresAt,
    createdAt,
  }).run();

  return {
    id: sessionId,
    userId,
    expiresAt,
    createdAt,
  };
}

/**
 * Resolves a user by session ID directly from the database, checking expiration.
 */
export function getUserBySessionId(sessionId: string): SafeUser | null {
  if (!sessionId) return null;

  const session = db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).get();
  if (!session) return null;

  // Check expiration
  if (new Date(session.expiresAt) < new Date()) {
    db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId)).run();
    return null;
  }

  const user = db.select().from(schema.users).where(eq(schema.users.id, session.userId)).get();
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    department: user.department,
    createdAt: user.createdAt,
  };
}

/**
 * Deletes a session record from the database.
 */
export function deleteSessionRecord(sessionId: string): void {
  if (!sessionId) return;
  db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId)).run();
}

/**
 * Full session creation: creates DB record and sets HTTP-only secure cookie.
 */
export async function createSession(userId: string): Promise<Session> {
  const session = createSessionRecord(userId);
  try {
    setCookie(SESSION_COOKIE_NAME, session.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: Math.floor(SESSION_DURATION_MS / 1000),
    });
  } catch (e) {
    // Graceful fallback if called outside HTTP request context (e.g. testing)
  }
  return session;
}

/**
 * Retrieves the currently authenticated user from the active request session cookie.
 */
export async function getCurrentUser(): Promise<SafeUser | null> {
  let sessionId: string | undefined;
  try {
    sessionId = getCookie(SESSION_COOKIE_NAME);
  } catch (e) {
    return null;
  }

  if (!sessionId) return null;

  const user = getUserBySessionId(sessionId);
  if (!user) {
    try {
      deleteCookie(SESSION_COOKIE_NAME, { path: '/' });
    } catch (e) {}
    return null;
  }

  return user;
}

/**
 * Route protection helper: throws an Unauthorized error if no valid session exists.
 */
export async function requireAuthenticatedUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized: You must be logged in to perform this action.');
  }
  return user;
}

/**
 * Destroys the current session from DB and deletes the cookie.
 */
export async function destroySession(): Promise<void> {
  try {
    const sessionId = getCookie(SESSION_COOKIE_NAME);
    if (sessionId) {
      deleteSessionRecord(sessionId);
      deleteCookie(SESSION_COOKIE_NAME, { path: '/' });
    }
  } catch (e) {}
}

