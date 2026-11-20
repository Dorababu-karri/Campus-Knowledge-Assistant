import { createServerFn } from '@tanstack/react-start';
import { getCurrentUser } from './auth.ts';
import {
  recordFeedback,
  getFeedbackForMessages,
  getAuditLogs,
  getAnalyticsOverview,
  type AnalyticsSummary,
} from './analytics.ts';
import type { AuditLog } from '../db/schema.ts';

export interface SubmitFeedbackInput {
  messageId: string;
  rating: number; // 1 or -1
  comment?: string;
}

/**
 * Submits user feedback (thumbs up / thumbs down + optional text comment) for an assistant message.
 */
export const submitFeedbackFn = createServerFn({ method: 'POST' })
  .validator((data: SubmitFeedbackInput) => data)
  .handler(async ({ data }) => {
    if (!data.messageId) {
      throw new Error('Message ID is required.');
    }
    if (data.rating !== 1 && data.rating !== -1) {
      throw new Error('Invalid rating: must be 1 (helpful) or -1 (unhelpful).');
    }

    const user = await getCurrentUser();
    const result = recordFeedback({
      messageId: data.messageId,
      userId: user ? user.id : null,
      rating: data.rating,
      comment: data.comment,
    });

    return { success: true, feedback: result };
  });

/**
 * Loads feedback status for given message IDs to restore thumbs up/down state in chat UI.
 */
export const getMessagesFeedbackFn = createServerFn({ method: 'POST' })
  .validator((data: { messageIds: string[] }) => data)
  .handler(async ({ data }) => {
    const feedbackMap = getFeedbackForMessages(data.messageIds || []);
    return { feedbackMap };
  });

export interface AuditLogQueryInput {
  limit?: number;
  offset?: number;
  status?: string;
  search?: string;
}

/**
 * Fetches audit logs with filtering. Strictly gated to admin users.
 */
export const getAdminAuditLogsFn = createServerFn({ method: 'POST' })
  .validator((data: AuditLogQueryInput) => data)
  .handler(async ({ data }): Promise<{ logs: AuditLog[]; total: number }> => {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      throw new Error('Forbidden: System Administrator access required.');
    }

    return getAuditLogs(data);
  });

/**
 * Retrieves consolidated analytics KPIs and distributions. Strictly gated to admin users.
 */
export const getAdminAnalyticsFn = createServerFn({ method: 'GET' })
  .handler(async (): Promise<AnalyticsSummary> => {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      throw new Error('Forbidden: System Administrator access required.');
    }

    return getAnalyticsOverview();
  });

