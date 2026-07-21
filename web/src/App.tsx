import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import { LoginForm } from './features/auth/LoginForm'
import { RegisterForm } from './features/auth/RegisterForm'
import { ProtectedRoute } from './features/auth/ProtectedRoute'

function Home() {
  const { user, logout } = useAuth()
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">SMC Financial Chat</h1>
        <p className="text-gray-600 mb-4">Welcome, {user?.email}</p>
        <button onClick={logout} className="text-blue-600 underline">Logout</button>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginForm />} />
          <Route path="/register" element={<RegisterForm />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
