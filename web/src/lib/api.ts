const API_BASE = 'http://localhost:3001'

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
}

export interface ToolCall {
  id: string
  messageId: string
  toolName: string
  arguments: Record<string, unknown>
  result?: Record<string, unknown>
  rowCount?: number
  durationMs?: number
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

export async function createMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  toolCalls?: Omit<ToolCall, 'id' | 'messageId' | 'createdAt'>[]
): Promise<Message> {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ role, content, toolCalls }),
  })
  if (!res.ok) throw new Error('Failed to create message')
  return res.json()
}

// Financials API
export async function queryFinancials(sql: string): Promise<{
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
}> {
  const res = await fetch(`${API_BASE}/financials/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ sql }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error ?? 'Query failed')
  }
  return res.json()
}

export async function getCoverage(): Promise<{
  tickers: string[]
  companies: string[]
  years: number[]
  metrics: string[]
}> {
  const res = await fetch(`${API_BASE}/financials/coverage`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch coverage')
  return res.json()
}
