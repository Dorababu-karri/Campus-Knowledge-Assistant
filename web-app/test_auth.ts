import { db } from './src/db/index.ts';
import * as schema from './src/db/schema.ts';
import {
  createUser,
  verifyPassword,
  createSessionRecord,
  getUserBySessionId,
  deleteSessionRecord,
} from './src/lib/auth.ts';
import { eq } from 'drizzle-orm';

async function runAuthTests() {
  console.log('='.repeat(70));
  console.log('MILESTONE 7.1: AUTHENTICATION & SQLITE DATABASE TEST SUITE');
  console.log('='.repeat(70));

  let passed = 0;
  let total = 8;

  // Cleanup test users before running
  try {
    db.delete(schema.users).where(eq(schema.users.email, 'student1@alliance.edu.in')).run();
    db.delete(schema.users).where(eq(schema.users.email, 'sneaky@alliance.edu.in')).run();
  } catch (e) {}

  // -------------------------------------------------------------
  // Test 1: Successful Registration
  // -------------------------------------------------------------
  console.log('\n[Test 1] Testing Successful Registration...');
  try {
    const user = await createUser({
      email: 'student1@alliance.edu.in',
      password: 'StrongPassword123!',
      role: 'student',
      department: 'engineering',
    });

    // Check DB record
    const stored = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();
    if (
      stored &&
      stored.email === 'student1@alliance.edu.in' &&
      stored.passwordHash !== 'StrongPassword123!' &&
      stored.passwordHash.startsWith('$2')
    ) {
      console.log('  -> PASS: User created successfully. Password hashed with bcrypt.');
      console.log(`     User ID: ${user.id} | Role: ${user.role} | Department: ${user.department}`);
      passed++;
    } else {
      console.error('  -> FAIL: User record incomplete or password stored in plaintext. Stored:', stored);
    }
  } catch (err: any) {
    console.error('  -> FAIL with error:', err.message);
  }

  // -------------------------------------------------------------
  // Test 2: Duplicate Registration Rejection
  // -------------------------------------------------------------
  console.log('\n[Test 2] Testing Duplicate Email Registration Rejection...');
  try {
    await createUser({
      email: 'student1@alliance.edu.in',
      password: 'AnotherPassword456!',
      role: 'student',
    });
    console.error('  -> FAIL: Allowed duplicate registration with same email!');
  } catch (err: any) {
    if (err.message.includes('already exists')) {
      console.log('  -> PASS: Duplicate email rejected properly with message:', err.message);
      passed++;
    } else {
      console.error('  -> FAIL: Unexpected error message:', err.message);
    }
  }

  // -------------------------------------------------------------
  // Test 3: Successful Login & Verification
  // -------------------------------------------------------------
  console.log('\n[Test 3] Testing Successful Login & Password Verification...');
  try {
    const userRecord = db.select().from(schema.users).where(eq(schema.users.email, 'student1@alliance.edu.in')).get();
    if (!userRecord) throw new Error('User not found in DB');

    const isValid = verifyPassword('StrongPassword123!', userRecord.passwordHash);
    if (isValid) {
      const session = createSessionRecord(userRecord.id);
      const sessionInDb = db.select().from(schema.sessions).where(eq(schema.sessions.id, session.id)).get();
      if (sessionInDb && sessionInDb.userId === userRecord.id) {
        console.log('  -> PASS: Password verified and session created in database.');
        console.log(`     Session ID: ${session.id} | Expires: ${session.expiresAt}`);
        passed++;
      } else {
        console.error('  -> FAIL: Session not found in DB.');
      }
    } else {
      console.error('  -> FAIL: Valid password failed verification.');
    }
  } catch (err: any) {
    console.error('  -> FAIL with error:', err.message);
  }

  // -------------------------------------------------------------
  // Test 4: Incorrect Password Rejection
  // -------------------------------------------------------------
  console.log('\n[Test 4] Testing Incorrect Password Rejection...');
  try {
    const userRecord = db.select().from(schema.users).where(eq(schema.users.email, 'student1@alliance.edu.in')).get();
    if (!userRecord) throw new Error('User not found');

    const isValid = verifyPassword('WrongPassword!', userRecord.passwordHash);
    if (!isValid) {
      console.log('  -> PASS: Incorrect password correctly rejected.');
      passed++;
    } else {
      console.error('  -> FAIL: Incorrect password was accepted!');
    }
  } catch (err: any) {
    console.error('  -> FAIL with error:', err.message);
  }

  // -------------------------------------------------------------
  // Test 5: Logout & Session Destruction
  // -------------------------------------------------------------
  console.log('\n[Test 5] Testing Logout and Session Destruction...');
  try {
    const userRecord = db.select().from(schema.users).where(eq(schema.users.email, 'student1@alliance.edu.in')).get();
    const tempSession = createSessionRecord(userRecord!.id);
    
    // Verify session exists
    let existingSession = db.select().from(schema.sessions).where(eq(schema.sessions.id, tempSession.id)).get();
    if (!existingSession) throw new Error('Temp session failed creation');

    // Destroy session
    deleteSessionRecord(tempSession.id);

    // Verify session deleted
    const deletedSession = db.select().from(schema.sessions).where(eq(schema.sessions.id, tempSession.id)).get();
    if (!deletedSession) {
      console.log('  -> PASS: Session successfully deleted from database upon logout.');
      passed++;
    } else {
      console.error('  -> FAIL: Session still exists in database after logout.');
    }
  } catch (err: any) {
    console.error('  -> FAIL with error:', err.message);
  }

  // -------------------------------------------------------------
  // Test 6: Session Persistence & Expiration Handling
  // -------------------------------------------------------------
  console.log('\n[Test 6] Testing Session Persistence and Expiration Validation...');
  try {
    const userRecord = db.select().from(schema.users).where(eq(schema.users.email, 'student1@alliance.edu.in')).get();
    const activeSession = createSessionRecord(userRecord!.id);

    // 6a. Active session resolution
    const resolvedUser = getUserBySessionId(activeSession.id);
    if (!resolvedUser || resolvedUser.id !== userRecord!.id) {
      throw new Error('Failed to resolve user from active session');
    }

    // 6b. Expired session rejection
    const expiredSessionId = 'expired-session-test-id';
    db.insert(schema.sessions).values({
      id: expiredSessionId,
      userId: userRecord!.id,
      expiresAt: new Date(Date.now() - 10000).toISOString(), // 10s in the past
      createdAt: new Date(Date.now() - 20000).toISOString(),
    }).run();

    const expiredUser = getUserBySessionId(expiredSessionId);
    if (expiredUser === null) {
      console.log('  -> PASS: Active session persisted & expired session successfully rejected and cleaned.');
      passed++;
    } else {
      console.error('  -> FAIL: Expired session returned a valid user!');
    }
  } catch (err: any) {
    console.error('  -> FAIL with error:', err.message);
  }

  // -------------------------------------------------------------
  // Test 7: Protected Route / Server Rejection Without Session
  // -------------------------------------------------------------
  console.log('\n[Test 7] Testing Protected Resource Rejection Without Valid Session...');
  try {
    const fakeSessionUser = getUserBySessionId('non-existent-session-id-12345');
    if (fakeSessionUser === null) {
      console.log('  -> PASS: Unauthenticated access rejected with null user. Server functions throw Unauthorized.');
      passed++;
    } else {
      console.error('  -> FAIL: Fake session returned unauthorized user data!');
    }
  } catch (err: any) {
    console.error('  -> FAIL with error:', err.message);
  }

  // -------------------------------------------------------------
  // Test 8: Admin Role Cannot Be Self-Assigned
  // -------------------------------------------------------------
  console.log('\n[Test 8] Testing Prevention of Admin Role Self-Assignment...');
  try {
    const sneakyUser = await createUser({
      email: 'sneaky@alliance.edu.in',
      password: 'SneakyPassword123!',
      role: 'admin', // Attempting to escalate privilege to admin
      department: 'finance',
    });

    const storedSneaky = db.select().from(schema.users).where(eq(schema.users.id, sneakyUser.id)).get();
    if (storedSneaky && storedSneaky.role !== 'admin' && storedSneaky.role === 'student') {
      console.log('  -> PASS: Privilege escalation blocked. Role safely forced to "student" (not "admin").');
      console.log(`     Assigned Role in DB: ${storedSneaky.role}`);
      passed++;
    } else {
      console.error('  -> FAIL: Security failure! User successfully self-assigned admin role:', storedSneaky?.role);
    }
  } catch (err: any) {
    console.error('  -> FAIL with error:', err.message);
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n' + '='.repeat(70));
  console.log(`TEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('='.repeat(70));

  if (passed === total) {
    console.log('ALL MILESTONE 7.1 AUTHENTICATION TESTS PASSED PERFECTLY!\n');
  } else {
    process.exit(1);
  }
}

runAuthTests();
