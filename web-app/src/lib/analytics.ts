import crypto from 'node:crypto';
import { eq, desc, and, sql } from 'drizzle-orm';
import { db, sqlite } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import type { Feedback, AuditLog } from '../db/schema.ts';

export interface RecordAuditParams {
  userId?: string | null;
  userEmail?: string;
  role?: string;
  department?: string;
  query: string;
  matchedSourcesCount?: number;
  distanceMin?: number | null;
  status?: 'authorized' | 'denied' | 'out_of_domain';
  latencyMs?: number;
}

export interface RecordFeedbackParams {
  messageId: string;
  userId?: string | null;
  rating: number; // 1 or -1
  comment?: string;
}

/**
 * Persists an immutable security audit entry into the database.
 */
export function recordAuditLog(params: RecordAuditParams): AuditLog {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const newLog: schema.NewAuditLog = {
    id,
    userId: params.userId || null,
    userEmail: params.userEmail || 'anonymous',
    role: params.role || 'public',
    department: params.department || 'general',
    query: (params.query || '').trim(),
    matchedSourcesCount: params.matchedSourcesCount ?? 0,
    distanceMin: params.distanceMin ?? null,
    status: params.status || 'authorized',
    latencyMs: Math.max(0, Math.round(params.latencyMs ?? 0)),
    createdAt: now,
  };

  db.insert(schema.auditLogs).values(newLog).run();
  const created = db.select().from(schema.auditLogs).where(eq(schema.auditLogs.id, id)).get();
  if (!created) {
    throw new Error('Failed to record audit log.');
  }
  return created;
}

/**
 * Retrieves audit logs with optional filtering by status and query search.
 */
export function getAuditLogs(options?: {
  limit?: number;
  offset?: number;
  status?: string;
  search?: string;
}): { logs: AuditLog[]; total: number } {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const status = options?.status;
  const search = options?.search?.trim();

  let queryBuilder = db.select().from(schema.auditLogs);

  const conditions = [];
  if (status && status !== 'all') {
    conditions.push(eq(schema.auditLogs.status, status as any));
  }
  if (search) {
    conditions.push(
      sql`(${schema.auditLogs.query} LIKE ${'%' + search + '%'} OR ${schema.auditLogs.userEmail} LIKE ${'%' + search + '%'})`
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const logs = queryBuilder
    .where(whereClause)
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  // Get total count
  const countRow = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.auditLogs)
    .where(whereClause)
    .get();

  return {
    logs,
    total: countRow ? Number(countRow.count) : logs.length,
  };
}

/**
 * Records or updates user feedback (thumbs up / thumbs down + optional comment) on an answer.
 */
export function recordFeedback(params: RecordFeedbackParams): Feedback {
  const now = new Date().toISOString();
  const rating = params.rating > 0 ? 1 : -1;

  // Check if feedback already exists for this message & user
  let existing = null;
  if (params.userId) {
    existing = db
      .select()
      .from(schema.feedback)
      .where(and(eq(schema.feedback.messageId, params.messageId), eq(schema.feedback.userId, params.userId)))
      .get();
  } else {
    // If anonymous, check by messageId
    existing = db
      .select()
      .from(schema.feedback)
      .where(eq(schema.feedback.messageId, params.messageId))
      .get();
  }

  if (existing) {
    // Update existing feedback
    db.update(schema.feedback)
      .set({
        rating,
        comment: params.comment !== undefined ? params.comment : existing.comment,
        createdAt: now,
      })
      .where(eq(schema.feedback.id, existing.id))
      .run();

    return db.select().from(schema.feedback).where(eq(schema.feedback.id, existing.id)).get()!;
  }

  // Insert new feedback
  const id = crypto.randomUUID();
  const newFeedback: schema.NewFeedback = {
    id,
    messageId: params.messageId,
    userId: params.userId || null,
    rating,
    comment: params.comment || null,
    createdAt: now,
  };

  db.insert(schema.feedback).values(newFeedback).run();
  const created = db.select().from(schema.feedback).where(eq(schema.feedback.id, id)).get();
  if (!created) {
    throw new Error('Failed to record feedback.');
  }
  return created;
}

/**
 * Retrieves feedback entries for a list of message IDs.
 */
export function getFeedbackForMessages(messageIds: string[]): Record<string, { rating: number; comment?: string | null }> {
  if (!messageIds || messageIds.length === 0) return {};

  const placeholders = messageIds.map(() => '?').join(',');
  const rows = sqlite.prepare(
    `SELECT message_id, rating, comment FROM feedback WHERE message_id IN (${placeholders})`
  ).all(...messageIds) as { message_id: string; rating: number; comment: string | null }[];

  const result: Record<string, { rating: number; comment?: string | null }> = {};
  for (const row of rows) {
    result[row.message_id] = {
      rating: row.rating,
      comment: row.comment,
    };
  }
  return result;
}

export interface FeedbackDetailItem {
  id: string;
  messageId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  userEmail: string;
  messageContent: string;
}

export interface AnalyticsSummary {
  totalQueries: number;
  authorizedQueries: number;
  outOfDomainQueries: number;
  deniedQueries: number;
  complianceRate: number; // percentage
  avgLatencyMs: number;
  totalFeedback: number;
  thumbsUpCount: number;
  thumbsDownCount: number;
  satisfactionRate: number; // percentage
  departmentBreakdown: { department: string; count: number }[];
  roleBreakdown: { role: string; count: number }[];
  recentFeedback: FeedbackDetailItem[];
}

/**
 * Computes consolidated analytics and audit metrics for the admin dashboard.
 */
export function getAnalyticsOverview(): AnalyticsSummary {
  // Query status counts
  const totalRow = sqlite.prepare(`SELECT count(*) as count FROM audit_logs`).get() as { count: number };
  const totalQueries = totalRow ? totalRow.count : 0;

  const statusRows = sqlite.prepare(
    `SELECT status, count(*) as count FROM audit_logs GROUP BY status`
  ).all() as { status: string; count: number }[];

  let authorizedQueries = 0;
  let outOfDomainQueries = 0;
  let deniedQueries = 0;

  for (const row of statusRows) {
    if (row.status === 'authorized') authorizedQueries = row.count;
    else if (row.status === 'out_of_domain') outOfDomainQueries = row.count;
    else if (row.status === 'denied') deniedQueries = row.count;
  }

  const complianceRate = totalQueries > 0
    ? Math.round(((authorizedQueries + outOfDomainQueries) / totalQueries) * 100)
    : 100;

  // Average latency
  const latencyRow = sqlite.prepare(
    `SELECT AVG(latency_ms) as avg_latency FROM audit_logs WHERE latency_ms > 0`
  ).get() as { avg_latency: number | null };
  const avgLatencyMs = latencyRow && latencyRow.avg_latency ? Math.round(latencyRow.avg_latency) : 0;

  // Feedback metrics
  const feedbackRows = sqlite.prepare(
    `SELECT rating, count(*) as count FROM feedback GROUP BY rating`
  ).all() as { rating: number; count: number }[];

  let thumbsUpCount = 0;
  let thumbsDownCount = 0;
  for (const f of feedbackRows) {
    if (f.rating > 0) thumbsUpCount = f.count;
    else if (f.rating < 0) thumbsDownCount = f.count;
  }
  const totalFeedback = thumbsUpCount + thumbsDownCount;
  const satisfactionRate = totalFeedback > 0
    ? Math.round((thumbsUpCount / totalFeedback) * 100)
    : 100;

  // Department breakdown
  const departmentBreakdown = sqlite.prepare(
    `SELECT department, count(*) as count FROM audit_logs GROUP BY department ORDER BY count DESC LIMIT 8`
  ).all() as { department: string; count: number }[];

  // Role breakdown
  const roleBreakdown = sqlite.prepare(
    `SELECT role, count(*) as count FROM audit_logs GROUP BY role ORDER BY count DESC LIMIT 6`
  ).all() as { role: string; count: number }[];

  // Recent feedback entries with message context and user email
  const recentFeedback = sqlite.prepare(`
    SELECT 
      f.id,
      f.message_id as messageId,
      f.rating,
      f.comment,
      f.created_at as createdAt,
      COALESCE(u.email, 'Anonymous') as userEmail,
      COALESCE(SUBSTR(m.content, 1, 140), 'No content preview') as messageContent
    FROM feedback f
    LEFT JOIN users u ON f.user_id = u.id
    LEFT JOIN messages m ON f.message_id = m.id
    ORDER BY f.created_at DESC
    LIMIT 20
  `).all() as FeedbackDetailItem[];

  return {
    totalQueries,
    authorizedQueries,
    outOfDomainQueries,
    deniedQueries,
    complianceRate,
    avgLatencyMs,
    totalFeedback,
    thumbsUpCount,
    thumbsDownCount,
    satisfactionRate,
    departmentBreakdown,
    roleBreakdown,
    recentFeedback,
  };
}

