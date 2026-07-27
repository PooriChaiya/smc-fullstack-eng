const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

export interface User {
  id: string
  email: string
  createdAt: string
}

export async function register(email: string, password: string): Promise<{ userId: string }> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  })
  if (!res.ok) throw new Error((await res.json()).error ?? 'Registration failed')
  return res.json()
}

export async function login(email: string, password: string): Promise<{ userId: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  })
  if (!res.ok) throw new Error((await res.json()).error ?? 'Login failed')
  return res.json()
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
}

export async function getMe(): Promise<User | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// Conversation types
export interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  conversationId: string
  seq: number
  role: 'user' | 'assistant'
  content: string
  status: string
  createdAt: string
  tool_calls?: ToolCall[]
}

export interface ToolCall {
  id: string
  messageId: string
  tool_name: string
  arguments: string | Record<string, unknown>
  result?: Record<string, unknown>
  row_count?: number
  duration_ms?: number
  error?: string
  createdAt: string
}

// Conversations API
export async function getConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API_BASE}/conversations`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch conversations')
  return res.json()
}

export async function getConversation(id: string): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/conversations/${id}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Conversation not found')
  return res.json()
}

export async function createConversation(title?: string): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(title ? { title } : {}),
  })
  if (!res.ok) throw new Error('Failed to create conversation')
  return res.json()
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/conversations/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to delete conversation')
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to fetch messages')
  return res.json()
}

// Usage / budget
export interface Usage {
  limit: number
  spent: number
  resetsAt: string
  windowSeconds: number
}

export async function getUsage(): Promise<Usage> {
  const res = await fetch(`${API_BASE}/usage`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch usage')
  return res.json()
}

/** Body shape of a 429 limit_exceeded response. */
export interface LimitExceeded {
  error: 'limit_exceeded'
  limit: number
  spent: number
  resetsAt: string
  windowSeconds: number
}
