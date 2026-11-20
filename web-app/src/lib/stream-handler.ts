import type { IncomingMessage, ServerResponse } from 'node:http';
import { getUserBySessionId } from './auth.ts';
import { createConversation, addMessageToConversation, type SerializedSource } from './chat.ts';
import { recordAuditLog } from './analytics.ts';

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx !== -1) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

export async function handleChatStreamRequest(req: IncomingMessage, res: ServerResponse) {
  const startTime = Date.now();

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  // 1. Buffer request body
  let bodyStr = '';
  for await (const chunk of req) {
    bodyStr += chunk;
  }

  let body: any = {};
  try {
    body = JSON.parse(bodyStr || '{}');
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const message = (body.message || '').trim();
  if (!message) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Message cannot be empty' }));
    return;
  }

  // 2. Resolve authenticated user from session cookie (secure server-side RBAC)
  const cookies = parseCookieHeader(req.headers.cookie);
  const sessionId = cookies['campus_session'];
  const user = sessionId ? getUserBySessionId(sessionId) : null;

  const userRole = user ? user.role : 'public';
  const userDept = user ? user.department : 'general';

  // 3. Resolve or create conversation in SQLite
  let convId = body.conversationId as string | undefined;
  if (!convId && user) {
    const title = message.length > 50 ? `${message.slice(0, 47)}...` : message;
    const newConv = createConversation(user.id, title);
    convId = newConv.id;
  }

  // Save user message to database
  if (convId) {
    addMessageToConversation(convId, 'user', message);
  }

  // 4. Connect to FastAPI streaming endpoint
  const internalSecret = process.env.RAG_INTERNAL_SECRET || 'campus_rag_secret_2026';
  let apiResponse: Response;

  try {
    apiResponse = await fetch('http://127.0.0.1:8000/query/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': internalSecret,
      },
      body: JSON.stringify({
        question: message,
        user_role: userRole,
        department: userDept,
        history: body.history || [],
      }),
    });
  } catch (err: any) {
    recordAuditLog({
      userId: user ? user.id : null,
      userEmail: user ? user.email : 'anonymous',
      role: userRole,
      department: userDept,
      query: message,
      matchedSourcesCount: 0,
      status: 'denied',
      latencyMs: Date.now() - startTime,
    });
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to connect to FastAPI RAG stream on port 8000.' }));
    return;
  }

  if (!apiResponse.ok) {
    let detail = '';
    try {
      const errJson = await apiResponse.json();
      detail = errJson.detail || '';
    } catch (_) {}

    recordAuditLog({
      userId: user ? user.id : null,
      userEmail: user ? user.email : 'anonymous',
      role: userRole,
      department: userDept,
      query: message,
      matchedSourcesCount: 0,
      status: apiResponse.status === 403 ? 'denied' : 'out_of_domain',
      latencyMs: Date.now() - startTime,
    });

    res.writeHead(apiResponse.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `FastAPI error ${apiResponse.status}: ${detail}` }));
    return;
  }

  // 5. Pipe SSE to client
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Emit conversation metadata event
  if (convId) {
    res.write(`data: ${JSON.stringify({ type: 'meta', conversationId: convId })}\n\n`);
  }

  if (!apiResponse.body) {
    res.end();
    return;
  }

  const reader = apiResponse.body.getReader();
  const decoder = new TextDecoder();

  let fullAnswer = '';
  let capturedSources: SerializedSource[] = [];
  let sseBuffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const rawChunk = decoder.decode(value, { stream: true });
      res.write(rawChunk);

      // Parse chunk lines to capture sources and full answer for SQLite persistence
      sseBuffer += rawChunk;
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || ''; // keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.type === 'sources' && parsed.sources) {
              capturedSources = parsed.sources;
            } else if (parsed.type === 'token' && parsed.token) {
              fullAnswer += parsed.token;
            }
          } catch (_) {
            // Ignore partial/non-JSON data lines
          }
        }
      }
    }
  } catch (streamErr) {
    console.error('Error during SSE stream forwarding:', streamErr);
  } finally {
    // 6. Save final assistant response to SQLite database
    if (convId && fullAnswer) {
      try {
        const savedMsg = addMessageToConversation(convId, 'assistant', fullAnswer, capturedSources);
        // Emit final message confirmation event with messageId for feedback tagging
        res.write(`data: ${JSON.stringify({ type: 'message_saved', messageId: savedMsg.id })}\n\n`);
      } catch (dbErr) {
        console.error('Failed to persist assistant stream response:', dbErr);
      }
    }

    // 7. Record immutable audit log
    const latencyMs = Date.now() - startTime;
    const isOutOfDomain =
      capturedSources.length === 0 ||
      fullAnswer.includes("couldn't find sufficiently relevant information");
    const status = isOutOfDomain ? 'out_of_domain' : 'authorized';

    try {
      recordAuditLog({
        userId: user ? user.id : null,
        userEmail: user ? user.email : 'anonymous',
        role: userRole,
        department: userDept,
        query: message,
        matchedSourcesCount: capturedSources.length,
        status,
        latencyMs,
      });
    } catch (auditErr) {
      console.error('Failed to record audit log:', auditErr);
    }

    res.end();
  }
}
