import { useState, useEffect } from 'react'
import { getMessages, Message } from '@/lib/api'

interface ChatViewProps {
  conversationId: string | null
}

export function ChatView({ conversationId }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      return
    }
    setLoading(true)
    getMessages(conversationId)
      .then(setMessages)
      .finally(() => setLoading(false))
  }, [conversationId])

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

  if (loading) {
    return <div className="h-full flex items-center justify-center text-gray-400">Loading messages...</div>
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 mt-20">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`
                  max-w-2xl rounded-lg px-4 py-2
                  ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}
                `}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.status === 'streaming' && (
                  <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1" />
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-gray-200 p-4">
        <form
          onSubmit={(e) => e.preventDefault()}
          className="flex gap-2"
        >
          <input
            type="text"
            placeholder="Ask about financials..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled
          />
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            disabled
          >
            Send
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-2 text-center">
          Streaming chat coming in Phase 4
        </p>
      </div>
    </div>
  )
}
