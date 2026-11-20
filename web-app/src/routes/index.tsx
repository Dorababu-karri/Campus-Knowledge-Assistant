import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState, useRef, useEffect } from 'react'
import { getCurrentUser } from '../lib/auth.ts'
import { getAuthUser } from '../lib/auth-server.ts'
import { createConversation, addMessageToConversation } from '../lib/chat.ts'
import {
  getAuthConversations,
  getConversationDetails,
  deleteConversationFn,
} from '../lib/chat-server.ts'
import { submitFeedbackFn, getMessagesFeedbackFn } from '../lib/analytics-server.ts'
import { recordAuditLog } from '../lib/analytics.ts'
import CampusLogo from '../components/CampusLogo.tsx'
import type { SafeUser } from '../db/schema.ts'

export const Route = createFileRoute('/')({ component: App })

interface ChatInput {
  message: string
  conversationId?: string
  history?: { role: 'user' | 'assistant'; content: string }[]
}

// Server function runs securely on the Node.js server.
const chatWithAgent = createServerFn({ method: 'POST' })
  .validator((data: ChatInput) => data)
  .handler(async ({ data: input }) => {
    const startTime = Date.now()
    const message = (input.message || '').trim()
    if (!message) throw new Error('Message is required')

    // 1. Resolve authenticated user identity securely on the server
    const user = await getCurrentUser()
    const userRole = user ? user.role : 'public'
    const userDept = user ? user.department : 'general'

    // 2. Resolve or create conversation
    let convId = input.conversationId
    if (!convId && user) {
      // Auto-create conversation with a clean title from the prompt
      const title = message.length > 50 ? `${message.slice(0, 47)}...` : message
      const newConv = createConversation(user.id, title)
      convId = newConv.id
    }

    // Save user message to database if conversation exists
    if (convId) {
      addMessageToConversation(convId, 'user', message)
    }

    // 3. Load shared internal service secret
    const internalSecret = process.env.RAG_INTERNAL_SECRET || 'campus_rag_secret_2026'

    // 4. Forward the question and verified role to local Python FastAPI server
    try {
      const response = await fetch('http://127.0.0.1:8000/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': internalSecret,
        },
        body: JSON.stringify({
          question: message,
          user_role: userRole,
          department: userDept,
          history: input.history || [],
        }),
      })

      if (!response.ok) {
        let detail = ''
        try {
          const errData = await response.json()
          detail = errData.detail || ''
        } catch (_) {}
        throw new Error(`FastAPI error ${response.status}: ${detail}`)
      }

      const resData = await response.json()

      // Save assistant answer to database if conversation exists
      let savedMsgId: string | undefined
      if (convId) {
        const savedMsg = addMessageToConversation(convId, 'assistant', resData.answer, resData.sources)
        savedMsgId = savedMsg.id
      }

      // Record audit log
      const latencyMs = Date.now() - startTime
      const isOutOfDomain =
        !resData.sources ||
        resData.sources.length === 0 ||
        resData.answer?.includes("couldn't find sufficiently relevant information")

      try {
        recordAuditLog({
          userId: user ? user.id : null,
          userEmail: user ? user.email : 'anonymous',
          role: userRole,
          department: userDept,
          query: message,
          matchedSourcesCount: resData.sources?.length || 0,
          status: isOutOfDomain ? 'out_of_domain' : 'authorized',
          latencyMs,
        })
      } catch (auditErr) {
        console.error('Audit log recording error:', auditErr)
      }

      return {
        answer: resData.answer,
        sources: resData.sources,
        conversationId: convId,
        messageId: savedMsgId,
      }
    } catch (error: any) {
      console.error('Failed to fetch from Python API:', error)
      if (error.message && error.message.includes('FastAPI error')) {
        throw error
      }
      throw new Error(
        'Failed to connect to the RAG engine on port 8000. Please ensure the FastAPI server is running.'
      )
    }
  })

type Source = {
  document: string
  page?: number
  chunk_id: string
  text: string
}

type Message = {
  id?: string
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  timestamp?: string
}

type ConversationItem = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

const STARTER_PROMPTS = [
  {
    icon: '📋',
    title: 'Attendance Thresholds',
    tag: 'Academic Policy',
    prompt:
      'What is the minimum attendance requirement for students to appear in end-semester examinations, and what are the condonation rules?',
    description: '75% mandatory threshold, medical exemptions, and condonation limits.',
  },
  {
    icon: '⚖️',
    title: 'Code of Conduct & Ethics',
    tag: 'Campus Conduct',
    prompt:
      'What are the disciplinary penalties for academic dishonesty, misconduct, and code of conduct violations?',
    description: 'Procedures, disciplinary committee, and penalty matrix.',
  },
  {
    icon: '💸',
    title: 'UGC Fee Refund Matrix',
    tag: 'Financial Regulations',
    prompt:
      'What is the refund timeline and percentage upon voluntary withdrawal from a program as per UGC guidelines?',
    description: 'Full refund slabs, deduction schedules, and caution deposit terms.',
  },
]

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Milestone 8: Persistent Chat History States
  const [currentUser, setCurrentUser] = useState<SafeUser | null>(null)
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Milestone 11: Answer Feedback States
  const [feedbackMap, setFeedbackMap] = useState<Record<string, { rating: number; comment?: string | null }>>({})
  const [activeCommentMsgId, setActiveCommentMsgId] = useState<string | null>(null)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [submittingFeedback, setSubmittingFeedback] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  // Load authenticated user and their saved conversations on mount
  useEffect(() => {
    getAuthUser()
      .then((res) => {
        setCurrentUser(res.user)
        if (res.user) {
          loadUserConversations()
        }
      })
      .catch(() => {
        setCurrentUser(null)
      })
  }, [])

  const loadUserConversations = async () => {
    try {
      const res = await getAuthConversations()
      setConversations(res.conversations as ConversationItem[])
    } catch (err) {
      console.error('Failed to load user conversations:', err)
    }
  }

  const handleSelectConversation = async (convId: string) => {
    if (activeConversationId === convId) return
    setError(null)
    setLoadingHistory(true)
    try {
      const res = await getConversationDetails({ data: convId })
      setActiveConversationId(res.conversation.id)
      setMessages(
        res.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          sources: m.sources,
          timestamp: new Date(m.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
        }))
      )

      // Fetch existing feedback for these messages
      const msgIds = res.messages.map((m) => m.id).filter(Boolean)
      if (msgIds.length > 0) {
        getMessagesFeedbackFn({ data: { messageIds: msgIds } })
          .then((fbRes) => {
            setFeedbackMap(fbRes.feedbackMap || {})
          })
          .catch(() => {})
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load conversation messages.')
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleNewChat = () => {
    setActiveConversationId(null)
    setMessages([])
    setError(null)
    setFeedbackMap({})
    setActiveCommentMsgId(null)
    setFeedbackComment('')
  }

  const handleFeedback = async (messageId: string, rating: 1 | -1) => {
    setFeedbackMap((prev) => ({
      ...prev,
      [messageId]: { rating, comment: prev[messageId]?.comment || null },
    }))

    if (rating === -1) {
      setActiveCommentMsgId(messageId)
      setFeedbackComment('')
    } else {
      setActiveCommentMsgId(null)
    }

    try {
      await submitFeedbackFn({
        data: {
          messageId,
          rating,
          comment: feedbackMap[messageId]?.comment || undefined,
        },
      })
    } catch (err) {
      console.error('Failed to submit feedback:', err)
    }
  }

  const handleCommentSubmit = async (messageId: string) => {
    if (!feedbackComment.trim()) {
      setActiveCommentMsgId(null)
      return
    }
    setSubmittingFeedback(true)
    try {
      const currentRating = feedbackMap[messageId]?.rating || -1
      await submitFeedbackFn({
        data: {
          messageId,
          rating: currentRating,
          comment: feedbackComment.trim(),
        },
      })
      setFeedbackMap((prev) => ({
        ...prev,
        [messageId]: { rating: currentRating, comment: feedbackComment.trim() },
      }))
      setActiveCommentMsgId(null)
      setFeedbackComment('')
    } catch (err) {
      console.error('Failed to submit feedback comment:', err)
    } finally {
      setSubmittingFeedback(false)
    }
  }

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Delete this conversation?')) return
    try {
      await deleteConversationFn({ data: convId })
      setConversations((prev) => prev.filter((c) => c.id !== convId))
      if (activeConversationId === convId) {
        handleNewChat()
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete conversation.')
    }
  }

  const executeQuery = async (queryText: string) => {
    if (!queryText.trim() || isLoading) return

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setError(null)

    // Capture last 4 messages for conversational context
    const historyPayload = messages.slice(-4).map((m) => ({
      role: m.role,
      content: m.content,
    }))

    const userMsg: Message = { role: 'user', content: queryText, timestamp: now }
    const assistantPlaceholder: Message = {
      role: 'assistant',
      content: '',
      sources: [],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMsg, assistantPlaceholder])
    setIsLoading(true)

    try {
      // Milestone 10: Stream response in real-time via Server-Sent Events (SSE)
      const response = await fetch('/api/chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: queryText,
          conversationId: activeConversationId || undefined,
          history: historyPayload,
        }),
      })

      if (!response.ok) {
        let errDetail = ''
        try {
          const errData = await response.json()
          errDetail = errData.error || ''
        } catch (_) {}
        throw new Error(errDetail || `Streaming error ${response.status}`)
      }

      if (!response.body) {
        throw new Error('No streaming response body received.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let streamBuffer = ''
      let currentText = ''
      let currentSources: Source[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunkText = decoder.decode(value, { stream: true })
        streamBuffer += chunkText

        const lines = streamBuffer.split('\n')
        streamBuffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6))
              if (data.type === 'meta' && data.conversationId) {
                if (data.conversationId !== activeConversationId) {
                  setActiveConversationId(data.conversationId)
                  loadUserConversations()
                }
              } else if (data.type === 'sources' && data.sources) {
                currentSources = data.sources
                setMessages((prev) => {
                  const copy = [...prev]
                  const last = copy[copy.length - 1]
                  if (last && last.role === 'assistant') {
                    copy[copy.length - 1] = {
                      ...last,
                      sources: currentSources,
                    }
                  }
                  return copy
                })
              } else if (data.type === 'token' && data.token) {
                currentText += data.token
                setMessages((prev) => {
                  const copy = [...prev]
                  const last = copy[copy.length - 1]
                  if (last && last.role === 'assistant') {
                    copy[copy.length - 1] = {
                      ...last,
                      content: currentText,
                      sources: currentSources,
                    }
                  }
                  return copy
                })
              } else if (data.type === 'message_saved' && data.messageId) {
                setMessages((prev) => {
                  const copy = [...prev]
                  const last = copy[copy.length - 1]
                  if (last && last.role === 'assistant') {
                    copy[copy.length - 1] = {
                      ...last,
                      id: data.messageId,
                    }
                  }
                  return copy
                })
              }
            } catch (_) {}
          }
        }
      }
    } catch (err: any) {
      // Graceful fallback to server function if streaming endpoint encounters any issue
      console.warn('Streaming encountered issue, falling back to server function:', err)
      try {
        const data = await chatWithAgent({
          data: {
            message: queryText,
            conversationId: activeConversationId || undefined,
            history: historyPayload,
          },
        })
        setMessages((prev) => {
          const copy = [...prev]
          const last = copy[copy.length - 1]
          if (last && last.role === 'assistant') {
            copy[copy.length - 1] = {
              id: data.messageId,
              role: 'assistant',
              content: data.answer,
              sources: data.sources,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }
          }
          return copy
        })
        if (data.conversationId && data.conversationId !== activeConversationId) {
          setActiveConversationId(data.conversationId)
          loadUserConversations()
        }
      } catch (fallbackErr: any) {
        setError(fallbackErr.message || err.message || 'An error occurred.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    const text = input.trim()
    setInput('')
    executeQuery(text)
  }

  const handleCardClick = (prompt: string) => {
    setInput('')
    executeQuery(prompt)
  }

  return (
    <main className="page-wrap px-2 sm:px-4 py-6 md:py-8 min-h-[calc(100vh-80px)] flex flex-col gap-6">
      {/* Top Hero Banner (Compact when chatting) */}
      {messages.length === 0 && (
        <section className="text-center flex flex-col items-center max-w-3xl mx-auto pt-2">
          <div className="eth-pill mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--eth-cyan)] animate-ping" />
            <span>VERIFIED UNIVERSITY KNOWLEDGE ASSISTANT</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-[var(--text-primary)] leading-[1.15]">
            Campus Knowledge.{' '}
            <span className="eth-gradient-text block sm:inline">
              Grounded on Policy.
            </span>
          </h1>

          <p className="mt-3 text-sm sm:text-base text-[var(--text-secondary)] max-w-2xl leading-relaxed">
            High-precision vector retrieval over 9 official university policy documents. 
            Zero hallucinations with strict Role-Based Access Control and verifiable citations.
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs font-mono text-[var(--text-muted)]">
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-card)] px-3 py-1 backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>9 POLICIES</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-card)] px-3 py-1 backdrop-blur-md">
              <span className="text-[var(--eth-blue)]">◆</span>
              <span>768-D NOMIC</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-card)] px-3 py-1 backdrop-blur-md">
              <span className="text-[var(--eth-purple)]">⬡</span>
              <span>0.42 GUARDRAIL</span>
            </div>
          </div>
        </section>
      )}

      {/* Main Workspace: Sidebar + Chat Console */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 max-w-6xl w-full mx-auto min-h-[620px]">
        {/* Left Sidebar: Persistent Chat History */}
        <aside
          className={`${
            isSidebarOpen ? 'w-full md:w-72 flex' : 'hidden'
          } flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface-card)] p-3.5 backdrop-blur-xl shadow-lg transition-all duration-200`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-[var(--line)] mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                Chat History
              </span>
              {conversations.length > 0 && (
                <span className="rounded-full bg-[var(--chip-bg)] border border-[var(--chip-line)] px-2 py-0.5 text-[10px] font-mono text-[var(--eth-blue)]">
                  {conversations.length}
                </span>
              )}
            </div>
            <button
              onClick={handleNewChat}
              className="eth-button-primary text-xs !py-1 !px-2.5 flex items-center gap-1"
              title="Start a new chat thread"
            >
              <span>+</span>
              <span>New</span>
            </button>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[500px]">
            {currentUser ? (
              conversations.length === 0 ? (
                <div className="p-4 text-center text-xs text-[var(--text-muted)] font-mono">
                  No conversations yet.<br />Ask your first question!
                </div>
              ) : (
                conversations.map((conv) => {
                  const isActive = activeConversationId === conv.id
                  return (
                    <div
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer text-xs transition-all border ${
                        isActive
                          ? 'border-[var(--eth-blue)] bg-[var(--chip-bg)] text-[var(--eth-blue)] font-semibold shadow-sm'
                          : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span className="text-sm">💬</span>
                        <span className="truncate">{conv.title}</span>
                      </div>
                      <button
                        onClick={(e) => handleDeleteConversation(conv.id, e)}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 text-xs transition-opacity"
                        title="Delete chat"
                      >
                        🗑️
                      </button>
                    </div>
                  )
                })
              )
            ) : (
              <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-center text-xs space-y-2">
                <p className="text-[var(--text-secondary)]">
                  Sign in to save and sync your conversations across devices.
                </p>
                <a
                  href="/login"
                  className="eth-button-secondary text-xs !py-1 !px-3 inline-block"
                >
                  Sign In
                </a>
              </div>
            )}
          </div>
        </aside>

        {/* Right Chat Terminal Console */}
        <section className="eth-card flex-1 flex flex-col min-h-[580px] overflow-hidden border border-[var(--line)] bg-[var(--surface-card)] shadow-2xl rounded-2xl">
          {/* Console Header Bar */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[var(--line)] bg-[var(--surface-strong)]">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--eth-blue)]"
                title="Toggle conversation sidebar"
              >
                {isSidebarOpen ? '◀' : '☰ History'}
              </button>

              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--chip-bg)] border border-[var(--chip-line)]">
                  <CampusLogo size={14} />
                </div>
                <span className="text-xs font-mono font-bold tracking-wider text-[var(--text-primary)] uppercase">
                  Assistant Console
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button
                  onClick={handleNewChat}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--eth-blue)] font-mono transition-colors px-2 py-1 rounded"
                >
                  + New Chat
                </button>
              )}
              <span className="text-[11px] font-mono text-[var(--text-muted)] border border-[var(--line)] rounded px-2 py-0.5 bg-[var(--surface)] hidden sm:inline">
                FASTAPI :8000
              </span>
            </div>
          </div>

          {/* Message Stream */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {loadingHistory ? (
              <div className="h-full min-h-[280px] flex items-center justify-center text-xs font-mono text-[var(--text-muted)]">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-[var(--eth-blue)] border-t-transparent rounded-full animate-spin" />
                  <span>Loading conversation history...</span>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full min-h-[300px] flex flex-col justify-center">
                <div className="text-center mb-6">
                  <div className="h-12 w-12 rounded-2xl bg-[var(--chip-bg)] border border-[var(--chip-line)] flex items-center justify-center mx-auto mb-2">
                    <CampusLogo size={24} />
                  </div>
                  <p className="font-semibold text-sm text-[var(--text-primary)]">
                    Explore University Regulations
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Click a topic below or ask any custom question.
                  </p>
                </div>

                {/* Starter Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {STARTER_PROMPTS.map((card, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleCardClick(card.prompt)}
                      className="eth-card p-3.5 text-left flex flex-col justify-between group cursor-pointer border border-[var(--line)] bg-[var(--surface)] hover:border-[var(--eth-blue)] transition-all duration-200"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xl">{card.icon}</span>
                          <span className="text-[9px] font-mono font-semibold uppercase tracking-wider text-[var(--eth-blue)] bg-[var(--chip-bg)] px-1.5 py-0.5 rounded">
                            {card.tag}
                          </span>
                        </div>
                        <h3 className="font-semibold text-xs sm:text-sm text-[var(--text-primary)] group-hover:text-[var(--eth-blue)] transition-colors">
                          {card.title}
                        </h3>
                        <p className="mt-1 text-[11px] text-[var(--text-secondary)] line-clamp-2">
                          {card.description}
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-[var(--line)] flex items-center justify-between text-[11px] font-medium text-[var(--eth-blue)]">
                        <span>Ask</span>
                        <span className="transition-transform group-hover:translate-x-1">→</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5 px-1 text-[11px] font-mono text-[var(--text-muted)]">
                    {msg.role === 'user' ? (
                      <>
                        <span>{msg.timestamp || 'You'}</span>
                        <span className="font-semibold text-[var(--eth-purple)]">[USER]</span>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1 font-semibold text-[var(--eth-blue)]">
                          <CampusLogo size={12} />
                          <span>CAMPUS ASSISTANT</span>
                        </div>
                        <span>{msg.timestamp}</span>
                        <span className="text-emerald-400 font-semibold">[VERIFIED]</span>
                      </>
                    )}
                  </div>

                  <div
                    className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-4 py-3.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-[#627EEA] to-[#7B3FE4] text-white shadow-md'
                        : 'border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--text-primary)] shadow-sm'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>

                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-4 pt-3.5 border-t border-[var(--line)]">
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--eth-blue)]">
                            <span>📜</span>
                            <span>Verified Citations ({msg.sources.length})</span>
                          </div>
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                            ✓ Distance &lt; 0.42
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                          {msg.sources.map((source, idx) => (
                            <div
                              key={idx}
                              className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2.5 text-xs font-mono transition-colors hover:border-[var(--eth-blue)]"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                                <div className="flex items-center gap-1.5 text-[var(--text-primary)] font-semibold">
                                  <span className="text-[var(--eth-blue)]">📄</span>
                                  <span className="truncate max-w-[240px] sm:max-w-sm">
                                    {source.document}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px]">
                                  {source.page && (
                                    <span className="bg-[var(--chip-bg)] text-[var(--eth-blue)] border border-[var(--chip-line)] px-1.5 py-0.5 rounded">
                                      Page {source.page}
                                    </span>
                                  )}
                                  <span className="text-[var(--text-muted)] border border-[var(--line)] px-1.5 py-0.5 rounded">
                                    {source.chunk_id}
                                  </span>
                                </div>
                              </div>
                              <p className="text-[11px] font-sans text-[var(--text-secondary)] italic leading-normal border-l-2 border-[var(--eth-blue)]/40 pl-2 mt-1 line-clamp-3">
                                "{source.text}"
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Milestone 11: Real-time Answer Feedback & Quality Metrics */}
                    {msg.role === 'assistant' && msg.id && (
                      <div className="mt-3 pt-2.5 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                            Helpful?
                          </span>
                          <button
                            onClick={() => handleFeedback(msg.id!, 1)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all border ${
                              feedbackMap[msg.id!]?.rating === 1
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 font-bold shadow-sm'
                                : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-emerald-500/40 hover:text-emerald-400'
                            }`}
                            title="Mark response as helpful"
                          >
                            <span>👍</span>
                            <span>Helpful</span>
                          </button>
                          <button
                            onClick={() => handleFeedback(msg.id!, -1)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all border ${
                              feedbackMap[msg.id!]?.rating === -1
                                ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 font-bold shadow-sm'
                                : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-rose-500/40 hover:text-rose-400'
                            }`}
                            title="Mark response as needing improvement"
                          >
                            <span>👎</span>
                            <span>Improve</span>
                          </button>
                        </div>

                        {feedbackMap[msg.id!]?.comment && activeCommentMsgId !== msg.id && (
                          <span className="text-[10px] font-mono text-amber-400/90 italic truncate max-w-[220px]">
                            💬 "{feedbackMap[msg.id!]?.comment}"
                          </span>
                        )}

                        {activeCommentMsgId === msg.id && (
                          <div className="w-full mt-2 flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="How can this answer be improved? (e.g. missing details, inaccurate)"
                              value={feedbackComment}
                              onChange={(e) => setFeedbackComment(e.target.value)}
                              className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--eth-blue)]"
                            />
                            <button
                              onClick={() => handleCommentSubmit(msg.id!)}
                              disabled={submittingFeedback}
                              className="eth-button-primary text-[11px] !py-1 !px-2.5"
                            >
                              {submittingFeedback ? 'Saving...' : 'Send'}
                            </button>
                            <button
                              onClick={() => setActiveCommentMsgId(null)}
                              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] font-mono px-1.5 py-1"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {isLoading && (
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-2 mb-1.5 px-1 text-[11px] font-mono text-[var(--eth-blue)]">
                  <CampusLogo size={12} />
                  <span>SEARCHING POLICY VECTORS...</span>
                </div>
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text-secondary)] flex items-center gap-3">
                  <div className="h-4 w-4 border-2 border-[var(--eth-blue)] border-t-transparent rounded-full animate-spin" />
                  <span>Retrieving chunks and reasoning with conversational context...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs font-mono text-red-400 flex items-center gap-2">
                <span className="text-base">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="p-3 sm:p-4 border-t border-[var(--line)] bg-[var(--surface-strong)]">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about attendance, UGC fee refund, code of conduct, grading..."
                  disabled={isLoading}
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-input)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--eth-blue)] focus:border-transparent transition-all shadow-inner"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="eth-button-primary disabled:opacity-40 disabled:cursor-not-allowed !py-3 !px-5"
              >
                {isLoading ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Send</span>
                    <span className="font-mono">↵</span>
                  </>
                )}
              </button>
            </form>
            <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)] px-1">
              <span>Shift + Enter for newline</span>
              <span>Pre-retrieval RBAC &amp; History Active</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
