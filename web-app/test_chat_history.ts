/**
 * Automated Verification Suite for Milestone 8:
 * Persistent Multi-Turn Chat History & Conversation Context
 */

import {
  createConversation,
  getUserConversations,
  getConversationById,
  getConversationMessages,
  addMessageToConversation,
  renameConversation,
  deleteConversation,
} from './src/lib/chat.ts';
import { createUser } from './src/lib/auth.ts';
import { db } from './src/db/index.ts';
import * as schema from './src/db/schema.ts';
import { eq } from 'drizzle-orm';

async function runTests() {
  console.log('='.repeat(70));
  console.log('MILESTONE 8: CHAT HISTORY & CONVERSATION PERSISTENCE TEST SUITE');
  console.log('='.repeat(70));

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  -> PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  -> FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    }
  }

  // Setup: Create a test user for chat ownership
  const testEmail = `history_tester_${Date.now()}@university.edu`;
  const user = await createUser({
    email: testEmail,
    password: 'password123',
    role: 'student',
    department: 'engineering',
  });

  console.log(`\nCreated test user: ${user.email} (${user.id})`);

  // Test 1: Create Conversation
  console.log('\n[Test 1] Testing Conversation Creation...');
  const conv = createConversation(user.id, 'Attendance Inquiry');
  assert(
    conv.id !== undefined && conv.title === 'Attendance Inquiry' && conv.userId === user.id,
    'Conversation created in SQLite with correct user ID and title'
  );

  // Test 2: Retrieve User Conversations
  console.log('\n[Test 2] Testing User Conversation Listing...');
  const convList = getUserConversations(user.id);
  assert(
    convList.length === 1 && convList[0].id === conv.id,
    'getUserConversations accurately returns user conversations'
  );

  // Test 3: Add User Message
  console.log('\n[Test 3] Testing Message Insertion (User Role)...');
  const userMsg = addMessageToConversation(conv.id, 'user', 'What is the attendance requirement?');
  assert(
    userMsg.conversationId === conv.id && userMsg.role === 'user' && userMsg.content === 'What is the attendance requirement?',
    'User message saved to SQLite database'
  );

  // Test 4: Add Assistant Message with Sources
  console.log('\n[Test 4] Testing Message Insertion (Assistant Role with Sources)...');
  const mockSources = [
    {
      document: 'Attendance-Policy.pdf',
      page: 3,
      chunk_id: 'Attendance-Policy.pdf_p3_chunk_002',
      text: 'Minimum attendance required is 75% for UG programs.',
    },
  ];
  const assistantMsg = addMessageToConversation(
    conv.id,
    'assistant',
    'UG students require at least 75% attendance.',
    mockSources
  );
  assert(
    assistantMsg.role === 'assistant' && assistantMsg.sourcesJson !== null,
    'Assistant message saved with structured source citations JSON'
  );

  // Test 5: Chronological Message Retrieval
  console.log('\n[Test 5] Testing Chronological Message Retrieval...');
  const msgs = getConversationMessages(conv.id);
  assert(
    msgs.length === 2 && msgs[0].role === 'user' && msgs[1].role === 'assistant',
    'Messages returned in chronological order'
  );

  // Test 6: Verify Sources Serialization
  console.log('\n[Test 6] Testing Sources JSON Parsing...');
  const parsedSources = msgs[1].sourcesJson ? JSON.parse(msgs[1].sourcesJson) : [];
  assert(
    parsedSources.length === 1 && parsedSources[0].document === 'Attendance-Policy.pdf',
    'Sources JSON properly parsed with intact document and page citations'
  );

  // Test 7: Ownership Access Check
  console.log('\n[Test 7] Testing Conversation Ownership Verification...');
  const ownedConv = getConversationById(conv.id, user.id);
  const foreignConv = getConversationById(conv.id, 'random-unauthorized-user-id');
  assert(
    ownedConv !== null && foreignConv === null,
    'Access strictly blocked when requested under mismatched userId'
  );

  // Test 8: Rename Conversation
  console.log('\n[Test 8] Testing Conversation Renaming...');
  const renameSuccess = renameConversation(conv.id, 'UG Attendance Guidelines', user.id);
  const updatedConv = getConversationById(conv.id, user.id);
  assert(
    renameSuccess && updatedConv?.title === 'UG Attendance Guidelines',
    'Conversation title successfully updated'
  );

  // Test 9: Conversation Cascade Deletion
  console.log('\n[Test 9] Testing Cascade Deletion of Conversation and Messages...');
  const deleteSuccess = deleteConversation(conv.id, user.id);
  const convAfterDelete = getConversationById(conv.id);
  const msgsAfterDelete = getConversationMessages(conv.id);
  assert(
    deleteSuccess && convAfterDelete === null && msgsAfterDelete.length === 0,
    'Deleting conversation successfully cascades to delete all messages'
  );

  // Clean up test user
  db.delete(schema.users).where(eq(schema.users.id, user.id)).run();

  console.log('\n' + '='.repeat(70));
  console.log(`TEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('='.repeat(70));

  if (passed === total) {
    console.log('ALL MILESTONE 8 CHAT HISTORY TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  } else {
    console.error('SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

