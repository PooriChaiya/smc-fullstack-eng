import { useState, FormEvent } from 'react'
import { useAuth } from './AuthContext'
import { useNavigate } from 'react-router-dom'

export function RegisterForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    try {
      await register(email, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-sm mx-auto bg-white p-6 rounded shadow">
      <h2 className="text-xl font-bold">Register</h2>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full border p-2 rounded"
        required
      />
      <input
        type="password"
        placeholder="Password (min 8 chars)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full border p-2 rounded"
        required
      />
      <input
        type="password"
        placeholder="Confirm password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="w-full border p-2 rounded"
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white p-2 rounded disabled:opacity-50"
      >
        {loading ? 'Creating account...' : 'Register'}
      </button>
      <p className="text-sm text-gray-600">
        Have an account? <a href="/login" className="text-blue-600">Login</a>
      </p>
    </form>
  )
}
