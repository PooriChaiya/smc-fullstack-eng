import { useState, useEffect, useRef } from 'react'
import { getMessages, Message as ApiMessage } from '@/lib/api'
import { ToolCallCard } from '@/components/ToolCallCard'
import { MarkdownMessage } from '@/components/MarkdownMessage'

interface ChatViewProps {
  conversationId: string | null
}

export function ChatView({ conversationId }: ChatViewProps) {
  const [messages, setMessages] = useState<ApiMessage[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isScrolledUp, setIsScrolledUp] = useState(false)

  // Load conversation history
  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      return
    }
    setLoadingHistory(true)
    getMessages(conversationId)
      .then(setMessages)
      .finally(() => setLoadingHistory(false))
  }, [conversationId])

  // Auto-scroll to bottom unless user has scrolled up
  useEffect(() => {
    if (!isScrolledUp && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isScrolledUp])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100
    setIsScrolledUp(!isAtBottom)
  }

  const sendMessage = async (message: string) => {
    if (!conversationId || isLoading) return

    setIsLoading(true)
    const controller = new AbortController()
    setAbortController(controller)

    // Optimistically add user message
    const userMsg: ApiMessage = {
      id: `temp-${Date.now()}`,
      conversationId,
      seq: messages.length + 1,
      role: 'user',
      content: message,
      status: 'complete',
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ conversationId, message }),
        signal: controller.signal,
      })

      if (!response.ok) throw new Error('Failed to send message')

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('No response body')

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const chunk = JSON.parse(data)
              console.log('Chunk:', chunk) // For debugging
            } catch (e) {
              console.error('Failed to parse chunk:', data)
            }
          }
        }
      }

      // Reload messages after stream completes
      const updatedMessages = await getMessages(conversationId)
      setMessages(updatedMessages)
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Request aborted')
      } else {
        console.error('Error sending message:', error)
      }
    } finally {
      setIsLoading(false)
      setAbortController(null)
    }
  }

  // Empty state
  if (!conversationId) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Start a conversation</h2>
          <p className="text-gray-500">Select an existing chat or create a new one</p>
          <div className="mt-6 p-4 bg-gray-100 rounded-lg text-left text-sm text-gray-600 max-w-md mx-auto">
            <p className="font-medium mb-2">Try asking:</p>
            <ul className="space-y-1">
              <li>• "What was Apple's revenue in 2024?"</li>
              <li>• "Compare Tesla and Microsoft net income"</li>
              <li>• "Show me the most profitable companies"</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    const message = input
    setInput('')
    sendMessage(message)
  }

  const handleStop = () => {
    abortController?.abort()
  }

  return (
    <div className="h-full flex flex-col">
      <div
        className="flex-1 overflow-y-auto p-6 space-y-6"
        onScroll={handleScroll}
      >
        {loadingHistory ? (
          <div className="flex items-center justify-center text-gray-400">
            Loading messages...
          </div>
        ) : messages.length === 0 && !isLoading ? (
          <div className="text-center text-gray-400 mt-20">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={msg.id}>
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`
                      max-w-2xl rounded-lg px-4 py-3
                      ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 shadow-sm text-gray-800'}
                    `}
                  >
                    {msg.role === 'assistant' ? (
                      <MarkdownMessage content={msg.content} />
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>

                {/* Tool calls */}
                {msg.tool_calls && msg.tool_calls.map((tc) => (
                  <ToolCallCard
                    key={tc.id}
                    toolName={tc.tool_name}
                    args={typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)}
                    result={tc.result as any}
                    rowCount={tc.row_count ?? undefined}
                    durationMs={tc.duration_ms ?? undefined}
                    error={tc.error ?? undefined}
                  />
                ))}
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input form */}
      <div className="border-t border-gray-200 p-4 bg-white">
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            type="text"
            placeholder="Ask about financials..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          {isLoading ? (
            <button
              type="button"
              onClick={handleStop}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
            >
              Send
            </button>
          )}
        </form>
        <p className="text-xs text-gray-400 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
