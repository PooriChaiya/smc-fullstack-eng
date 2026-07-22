import { useState, useEffect } from 'react'
import { getConversations, createConversation, deleteConversation, Conversation } from '@/lib/api'

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getConversations()
      setConversations(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const create = async (title?: string) => {
    const conv = await createConversation(title)
    setConversations((prev) => [conv, ...prev])
    return conv
  }

  const remove = async (id: string) => {
    await deleteConversation(id)
    setConversations((prev) => prev.filter((c) => c.id !== id))
  }

  return { conversations, loading, error, reload: load, create, delete: remove }
}
