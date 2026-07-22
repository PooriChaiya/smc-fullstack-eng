import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ConversationSidebar } from './ConversationSidebar'
import { createConversation } from '@/lib/api'

interface ChatLayoutProps {
  children: (conversationId: string | null) => React.ReactNode
}

export function ChatLayout({ children }: ChatLayoutProps) {
  const { user, logout } = useAuth()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loadingNew, setLoadingNew] = useState(false)

  const handleSelect = (id: string) => {
    setActiveId(id)
  }

  const handleDeselect = () => {
    setActiveId(null)
  }

  const handleCreate = async () => {
    setLoadingNew(true)
    try {
      const conv = await createConversation()
      setActiveId(conv.id)
    } finally {
      setLoadingNew(false)
    }
  }

  return (
    <div className="flex h-screen">
      <ConversationSidebar
        activeId={activeId}
        onSelect={handleSelect}
        onDeselect={handleDeselect}
        onCreate={handleCreate}
      />

      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b border-gray-200 flex items-center justify-between px-6 bg-white">
          <h1 className="font-semibold text-gray-800">SMC Financial Chat</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button
              onClick={logout}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Logout
            </button>
          </div>
        </header>

        {loadingNew ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-400">Creating conversation...</div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">{children(activeId)}</div>
        )}
      </div>
    </div>
  )
}
