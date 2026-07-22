import { useState } from 'react'
import { useConversations } from './useConversations'

interface ConversationSidebarProps {
  activeId: string | null
  onSelect: (id: string) => void
  onDeselect: () => void
  onCreate: () => void
}

export function ConversationSidebar({ activeId, onSelect, onDeselect, onCreate }: ConversationSidebarProps) {
  const { conversations, loading, error, delete: deleteConv } = useConversations()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirmDelete === id) {
      setDeletingId(id)
      try {
        await deleteConv(id)
        if (activeId === id) onDeselect()
      } finally {
        setDeletingId(null)
        setConfirmDelete(null)
      }
    } else {
      setConfirmDelete(id)
      setTimeout(() => setConfirmDelete(null), 3000)
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const days = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString()
  }

  return (
    <aside className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={onCreate}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
        >
          + New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && (
          <div className="text-center text-gray-400 py-8">Loading...</div>
        )}

        {error && (
          <div className="text-center text-red-500 py-4 text-sm">{error}</div>
        )}

        {!loading && conversations.length === 0 && (
          <div className="text-center text-gray-400 py-8 text-sm">
            No conversations yet
          </div>
        )}

        {conversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`
              group relative p-3 mb-2 rounded-lg cursor-pointer transition
              ${activeId === conv.id ? 'bg-blue-100 ring-1 ring-blue-200' : 'hover:bg-gray-100'}
            `}
          >
            <div className="font-medium text-gray-800 truncate text-sm">{conv.title}</div>
            <div className="text-xs text-gray-500 mt-1">{formatDate(conv.updatedAt)}</div>

            {activeId !== conv.id && (
              <button
                onClick={(e) => handleDelete(conv.id, e)}
                disabled={deletingId === conv.id}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-200 rounded transition"
                title={confirmDelete === conv.id ? 'Click to confirm' : 'Delete'}
              >
                {deletingId === conv.id ? (
                  <span className="text-xs">...</span>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            )}

            {confirmDelete === conv.id && activeId !== conv.id && (
              <div className="absolute inset-0 bg-red-50/90 rounded-lg flex items-center justify-center">
                <span className="text-red-600 text-xs font-medium">Click again to delete</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}
