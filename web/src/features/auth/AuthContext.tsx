import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getMe, login as apiLogin, logout as apiLogout, register as apiRegister, User } from '@/lib/api'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMe().then(setUser).finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const res = await apiLogin(email, password)
    const me = await getMe()
    setUser(me)
  }

  const register = async (email: string, password: string) => {
    await apiRegister(email, password)
    // Auto-login after register
    await login(email, password)
  }

  const logout = async () => {
    await apiLogout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
