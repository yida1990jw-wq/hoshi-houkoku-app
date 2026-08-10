import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) return <div className="center-message">読み込み中...</div>
  if (!session) return <Navigate to="/login" replace />

  return <>{children}</>
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { loading, isAdmin } = useAuth()

  if (loading) return <div className="center-message">読み込み中...</div>
  if (!isAdmin) return <Navigate to="/" replace />

  return <>{children}</>
}
