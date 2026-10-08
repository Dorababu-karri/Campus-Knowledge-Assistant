import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'

export const Route = createFileRoute('/')({ component: App })

// This function securely runs ONLY on the backend Node.js server.
// TanStack Start automatically creates a POST API endpoint for it.
const chatWithAgent = createServerFn({ method: 'POST' })
  .validator((message: string) => message)
  .handler(async ({ data: message }) => {
    if (!message) throw new Error('Message is required')

    // Forward the question to our local Python FastAPI server
    try {
      const response = await fetch('http://127.0.0.1:8000/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: message })
      });

      if (!response.ok) {
        throw new Error(`Python API error: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Failed to fetch from Python API:", error);
      throw new Error("Failed to connect to the RAG engine. Is the FastAPI server running?");
    }
  })

type Source = {
  document: string
  page?: number
  chunk_id: string
  text: string
}

type Message = {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
}

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!input.trim()) return

    const userMessage = input.trim()
    setInput('')
    setError(null)
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      // Call the Server Function directly. It handles the HTTP POST request under the hood!
      const data = await chatWithAgent({ data: userMessage })
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.answer,
        sources: data.sources
      }])
    } catch (err: any) {
      setError(err.message || 'An error occurred while connecting to the server.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="page-wrap px-4 pb-8 pt-14 max-w-4xl mx-auto h-screen flex flex-col">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-5xl">
          Campus Knowledge Assistant
        </h1>
        <p className="mt-2 text-[var(--sea-ink-soft)]">
          Ask questions about university policies and procedures.
        </p>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col bg-white rounded-2xl shadow-sm border border-[rgba(23,58,64,0.1)]">
        {/* Chat Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <p>No messages yet.</p>
              <p className="text-sm">Try asking about the attendance policy!</p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div 
                key={index} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user' 
                      ? 'bg-[var(--lagoon-deep)] text-white' 
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {msg.content}
                  
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Sources:</p>
                      <div className="space-y-2">
                        {msg.sources.map((source, idx) => (
                          <div key={idx} className="bg-white/60 rounded p-2 text-xs border border-gray-200 shadow-sm">
                            <div className="font-medium text-[var(--sea-ink)] flex items-center justify-between mb-1">
                              <span>📚 {source.document}</span>
                              {source.page && <span className="bg-gray-200 px-1.5 rounded-sm">Page {source.page}</span>}
                            </div>
                            <p className="text-gray-500 line-clamp-2 italic">"{source.text}"</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 text-gray-500 rounded-2xl px-4 py-3 animate-pulse">
                Thinking...
              </div>
            </div>
          )}
          
          {error && (
            <div className="flex justify-center mt-2">
              <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm border border-red-200">
                {error}
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question..."
              className="flex-1 rounded-xl border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--lagoon-deep)] focus:border-transparent transition"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-[var(--lagoon-deep)] text-white px-6 py-3 rounded-xl font-medium transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
