import { createServerFn } from '@tanstack/react-start';
import { getCurrentUser } from './auth.ts';
import {
  getUserConversations,
  getConversationById,
  getConversationMessages,
  deleteConversation,
  renameConversation,
} from './chat.ts';

/**
 * Fetches all conversations belonging to the authenticated user.
 */
export const getAuthConversations = createServerFn({ method: 'GET' })
  .handler(async () => {
    const user = await getCurrentUser();
    if (!user) {
      return { conversations: [] };
    }

    const convs = getUserConversations(user.id);
    return { conversations: convs };
  });

/**
 * Loads messages for a given conversation. Verifies user ownership if authenticated.
 */
export const getConversationDetails = createServerFn({ method: 'POST' })
  .validator((conversationId: string) => conversationId)
  .handler(async ({ data: conversationId }) => {
    if (!conversationId) {
      throw new Error('Conversation ID is required.');
    }

    const user = await getCurrentUser();
    const conv = getConversationById(conversationId, user ? user.id : undefined);

    if (!conv) {
      throw new Error('Conversation not found or access denied.');
    }

    const rawMessages = getConversationMessages(conversationId);
    const parsedMessages = rawMessages.map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      sources: m.sourcesJson ? JSON.parse(m.sourcesJson) : undefined,
      createdAt: m.createdAt,
    }));

    return {
      conversation: conv,
      messages: parsedMessages,
    };
  });

/**
 * Deletes a conversation by ID.
 */
export const deleteConversationFn = createServerFn({ method: 'POST' })
  .validator((conversationId: string) => conversationId)
  .handler(async ({ data: conversationId }) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('Unauthorized.');
    }

    const success = deleteConversation(conversationId, user.id);
    if (!success) {
      throw new Error('Failed to delete conversation.');
    }

    return { success: true };
  });

/**
 * Renames a conversation by ID.
 */
export const renameConversationFn = createServerFn({ method: 'POST' })
  .validator((data: { conversationId: string; title: string }) => data)
  .handler(async ({ data }) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('Unauthorized.');
    }

    const success = renameConversation(data.conversationId, data.title, user.id);
    if (!success) {
      throw new Error('Failed to rename conversation.');
    }

    return { success: true };
  });

