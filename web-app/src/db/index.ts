import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.ts';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

// Resolve database path consistently
const DB_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
const DB_PATH = path.join(DB_DIR, 'campus.db');

export const sqlite = new Database(DB_PATH);

// Enable foreign key constraints
sqlite.pragma('foreign_keys = ON');

// Initialize tables if they do not exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('public', 'student', 'staff', 'admin')),
    department TEXT NOT NULL DEFAULT 'general',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    sources_json TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    user_email TEXT NOT NULL DEFAULT 'anonymous',
    role TEXT NOT NULL DEFAULT 'public',
    department TEXT NOT NULL DEFAULT 'general',
    query TEXT NOT NULL,
    matched_sources_count INTEGER NOT NULL DEFAULT 0,
    distance_min REAL,
    status TEXT NOT NULL DEFAULT 'authorized',
    latency_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_feedback_message_id ON feedback(message_id);
  CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
`);

// Seed a default system administrator if none exists
try {
  const existingAdmin = sqlite.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!existingAdmin) {
    const adminId = crypto.randomUUID();
    const passwordHash = bcrypt.hashSync('AdminPass123!', 10);
    const now = new Date().toISOString();
    sqlite.prepare(`
      INSERT INTO users (id, email, password_hash, role, department, created_at)
      VALUES (?, ?, ?, 'admin', 'academics', ?)
    `).run(adminId, 'admin@university.edu', passwordHash, now);
    console.log('[SQLite] Default administrator created: admin@university.edu');
  }
} catch (e) {
  console.error('[SQLite] Admin seeding notice:', e);
}

export const db = drizzle(sqlite, { schema });
