/**
 * Comprehensive Automated Test Suite for Milestone 11:
 * Audit Logging, Analytics & Answer Feedback
 */

import { sqlite, db } from './src/db/index.ts';
import * as schema from './src/db/schema.ts';
import {
  recordAuditLog,
  getAuditLogs,
  recordFeedback,
  getFeedbackForMessages,
  getAnalyticsOverview,
} from './src/lib/analytics.ts';
import { createConversation, addMessageToConversation } from './src/lib/chat.ts';
import crypto from 'node:crypto';

console.log('======================================================================');
console.log('MILESTONE 11: AUDIT LOGGING, ANALYTICS & FEEDBACK TEST SUITE');
console.log('======================================================================');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`  ✕ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`  ✓ PASS [${String(passedTests).padStart(2, '0')}]: ${message}`);
}

async function runTests() {
  // Setup mock user & conversation
  const testUserId = crypto.randomUUID();
  const testUserEmail = `student_${Date.now()}@university.edu`;
  const now = new Date().toISOString();

  sqlite.prepare(`
    INSERT INTO users (id, email, password_hash, role, department, created_at)
    VALUES (?, ?, 'dummy_hash', 'student', 'engineering', ?)
  `).run(testUserId, testUserEmail, now);

  const conv = createConversation(testUserId, 'Test M11 Conversation');
  const userMsg = addMessageToConversation(conv.id, 'user', 'What is the attendance policy?');
  const asstMsg = addMessageToConversation(conv.id, 'assistant', 'The attendance requirement is 75%.', [
    { document: 'attendance_policy.pdf', chunk_id: 'att_01', text: '75% mandatory' },
  ]);

  // Test 1: Record Audit Log for authorized query
  const audit1 = recordAuditLog({
    userId: testUserId,
    userEmail: testUserEmail,
    role: 'student',
    department: 'engineering',
    query: 'What is the attendance policy?',
    matchedSourcesCount: 1,
    status: 'authorized',
    latencyMs: 420,
  });
  assert(audit1.id !== undefined && audit1.status === 'authorized', 'Recorded authorized audit log entry in SQLite');

  // Test 2: Record Audit Log for out-of-domain query
  const audit2 = recordAuditLog({
    userId: testUserId,
    userEmail: testUserEmail,
    role: 'student',
    department: 'engineering',
    query: 'What is the weather on Mars?',
    matchedSourcesCount: 0,
    status: 'out_of_domain',
    latencyMs: 180,
  });
  assert(audit2.status === 'out_of_domain' && audit2.matchedSourcesCount === 0, 'Recorded out-of-domain audit log entry');

  // Test 3: Record Audit Log for unauthorized / denied query
  const audit3 = recordAuditLog({
    userId: null,
    userEmail: 'anonymous',
    role: 'public',
    department: 'general',
    query: 'Show confidential staff payroll',
    matchedSourcesCount: 0,
    status: 'denied',
    latencyMs: 50,
  });
  assert(audit3.status === 'denied' && audit3.userEmail === 'anonymous', 'Recorded security denied audit log entry');

  // Test 4: Query Audit Logs with filters
  const logsFiltered = getAuditLogs({ status: 'out_of_domain' });
  const hasOutOfDomain = logsFiltered.logs.some((l) => l.id === audit2.id);
  assert(hasOutOfDomain, 'Filtered audit logs by status ("out_of_domain")');

  // Test 5: Search Audit Logs
  const searchResults = getAuditLogs({ search: 'weather on Mars' });
  assert(searchResults.logs.length > 0 && searchResults.logs[0].query.includes('weather on Mars'), 'Searched audit logs by query text');

  // Test 6: Positive Feedback (+1 Thumbs Up)
  const fb1 = recordFeedback({
    messageId: asstMsg.id,
    userId: testUserId,
    rating: 1,
    comment: 'Great clear response!',
  });
  assert(fb1.rating === 1 && fb1.comment === 'Great clear response!', 'Recorded positive feedback (+1) with user comment');

  // Test 7: Feedback update (same user updates to thumbs down or changes comment)
  const fbUpdated = recordFeedback({
    messageId: asstMsg.id,
    userId: testUserId,
    rating: -1,
    comment: 'Need condonation threshold details too',
  });
  assert(fbUpdated.id === fb1.id && fbUpdated.rating === -1, 'Updated existing feedback record (-1) preserving relational identity');

  // Test 8: Batch lookup of feedback for messages
  const feedbackMap = getFeedbackForMessages([asstMsg.id, userMsg.id]);
  assert(feedbackMap[asstMsg.id]?.rating === -1, 'Batch lookup retrieved correct feedback map for message');

  // Test 9: Consolidated Analytics Overview
  const analytics = getAnalyticsOverview();
  assert(analytics.totalQueries >= 3, `Consolidated total queries computed (${analytics.totalQueries})`);
  assert(analytics.authorizedQueries >= 1, 'Authorized queries counted correctly');
  assert(analytics.outOfDomainQueries >= 1, 'Out-of-domain queries counted correctly');
  assert(analytics.totalFeedback >= 1, 'Total feedback count aggregated');
  assert(Array.isArray(analytics.departmentBreakdown) && analytics.departmentBreakdown.length > 0, 'Department breakdown generated');
  assert(Array.isArray(analytics.roleBreakdown) && analytics.roleBreakdown.length > 0, 'Role distribution generated');
  assert(Array.isArray(analytics.recentFeedback) && analytics.recentFeedback.length > 0, 'Recent feedback list includes message context');

  console.log('======================================================================');
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (100%)`);
  console.log('ALL MILESTONE 11 AUDIT & ANALYTICS TESTS PASSED PERFECTLY!');
  console.log('======================================================================');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

