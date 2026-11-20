import crypto from 'node:crypto';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import type { Conversation, Message } from '../db/schema.ts';

export interface SerializedSource {
  document: string;
  page?: number;
  chunk_id: string;
  text: string;
}

/**
 * Creates a new conversation thread.
 */
export function createConversation(userId: string | null, title: string): Conversation {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const cleanTitle = (title || 'New Conversation').trim().slice(0, 100);

  const newConv: schema.NewConversation = {
    id,
    userId: userId || null,
    title: cleanTitle,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(schema.conversations).values(newConv).run();
  const created = db.select().from(schema.conversations).where(eq(schema.conversations.id, id)).get();
  if (!created) {
    throw new Error('Failed to create conversation record.');
  }
  return created;
}

/**
 * Lists all conversations belonging to a user, ordered by most recently updated.
 */
export function getUserConversations(userId: string): Conversation[] {
  if (!userId) return [];
  return db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.userId, userId))
    .orderBy(desc(schema.conversations.updatedAt))
    .all();
}

/**
 * Retrieves a single conversation by ID with optional ownership verification.
 */
export function getConversationById(conversationId: string, userId?: string): Conversation | null {
  if (!conversationId) return null;

  if (userId) {
    const conv = db
      .select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, userId)))
      .get();
    return conv || null;
  }

  const conv = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .get();
  return conv || null;
}

/**
 * Retrieves all messages in a conversation in chronological order.
 */
export function getConversationMessages(conversationId: string): Message[] {
  if (!conversationId) return [];
  return db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(schema.messages.createdAt)
    .all();
}

/**
 * Appends a message to an existing conversation and updates the conversation's updatedAt timestamp.
 */
export function addMessageToConversation(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  sources?: SerializedSource[]
): Message {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const sourcesJson = sources && sources.length > 0 ? JSON.stringify(sources) : null;

  const newMsg: schema.NewMessage = {
    id,
    conversationId,
    role,
    content,
    sourcesJson,
    createdAt: now,
  };

  db.insert(schema.messages).values(newMsg).run();

  // Touch conversation updatedAt
  db.update(schema.conversations)
    .set({ updatedAt: now })
    .where(eq(schema.conversations.id, conversationId))
    .run();

  const created = db.select().from(schema.messages).where(eq(schema.messages.id, id)).get();
  if (!created) {
    throw new Error('Failed to save message.');
  }
  return created;
}

/**
 * Deletes a conversation and cascades to its messages.
 */
export function deleteConversation(conversationId: string, userId?: string): boolean {
  if (!conversationId) return false;

  if (userId) {
    const result = db
      .delete(schema.conversations)
      .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, userId)))
      .run();
    return result.changes > 0;
  }

  const result = db
    .delete(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .run();
  return result.changes > 0;
}

/**
 * Renames a conversation title.
 */
export function renameConversation(conversationId: string, title: string, userId?: string): boolean {
  if (!conversationId || !title.trim()) return false;
  const cleanTitle = title.trim().slice(0, 100);

  if (userId) {
    const result = db
      .update(schema.conversations)
      .set({ title: cleanTitle, updatedAt: new Date().toISOString() })
      .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, userId)))
      .run();
    return result.changes > 0;
  }

  const result = db
    .update(schema.conversations)
    .set({ title: cleanTitle, updatedAt: new Date().toISOString() })
    .where(eq(schema.conversations.id, conversationId))
    .run();
  return result.changes > 0;
}

