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
