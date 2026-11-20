import { createServerFn } from '@tanstack/react-start';
import {
  createUser,
  verifyPassword,
  createSession,
  destroySession,
  getCurrentUser,
  requireAuthenticatedUser,
} from './auth.ts';
import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import type { SafeUser } from '../db/schema.ts';

export interface RegisterInput {
  email: string;
  password: string;
  confirmPassword?: string;
  role?: string;
  department?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Server Function: Register a new user and establish a secure session.
 */
export const registerUser = createServerFn({ method: 'POST' })
  .validator((data: RegisterInput) => data)
  .handler(async ({ data }): Promise<{ user: SafeUser }> => {
    if (data.confirmPassword && data.password !== data.confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    const user = await createUser({
      email: data.email,
      password: data.password,
      role: data.role,
      department: data.department,
    });

    // Automatically establish a session for the newly registered user
    await createSession(user.id);

    return { user };
  });

/**
 * Server Function: Authenticate user credentials and create an HTTP-only session cookie.
 */
export const loginUser = createServerFn({ method: 'POST' })
  .validator((data: LoginInput) => data)
  .handler(async ({ data }): Promise<{ user: SafeUser }> => {
    const email = (data.email || '').trim().toLowerCase();
    const password = data.password || '';

    if (!email || !password) {
      throw new Error('Email and password are required.');
    }

    const userRecord = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
    if (!userRecord) {
      throw new Error('Invalid email or password.');
    }

    const isValid = verifyPassword(password, userRecord.passwordHash);
    if (!isValid) {
      throw new Error('Invalid email or password.');
    }

    await createSession(userRecord.id);

    return {
      user: {
        id: userRecord.id,
        email: userRecord.email,
        role: userRecord.role,
        department: userRecord.department,
        createdAt: userRecord.createdAt,
      },
    };
  });

/**
 * Server Function: Destroy the current session and remove the cookie.
 */
export const logoutUser = createServerFn({ method: 'POST' })
  .handler(async () => {
    await destroySession();
    return { success: true };
  });

/**
 * Server Function: Fetch currently logged-in user profile without exposing password hashes.
 */
export const getAuthUser = createServerFn({ method: 'GET' })
  .handler(async (): Promise<{ user: SafeUser | null }> => {
    const user = await getCurrentUser();
    return { user };
  });

/**
 * Server Function: Strictly protected endpoint requiring valid session authentication.
 */
export const getProtectedUserData = createServerFn({ method: 'GET' })
  .handler(async (): Promise<{ message: string; user: SafeUser }> => {
    const user = await requireAuthenticatedUser();
    return {
      message: 'Access granted to protected server resource.',
      user,
    };
  });

