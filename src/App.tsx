import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { SubmissionStatusPage } from './pages/SubmissionStatusPage'
import { ReportsListPage } from './pages/ReportsListPage'
import { PublishersPage } from './pages/PublishersPage'
import { PioneerProgressPage } from './pages/PioneerProgressPage'
import { ReportsHubPage } from './pages/ReportsHubPage'
import { YearEndNoticePrintPage } from './pages/print/YearEndNoticePrintPage'

// pdf-lib/fontkit(数百KB)を使うため、印刷時にだけ読み込むよう分離する
const PublisherCardPrintPage = lazy(() =>
  import('./pages/print/PublisherCardPrintPage').then((m) => ({ default: m.PublisherCardPrintPage })),
)
const CongregationSummaryPrintPage = lazy(() =>
  import('./pages/print/CongregationSummaryPrintPage').then((m) => ({ default: m.CongregationSummaryPrintPage })),
)

function LoginRoute() {
  const { session, loading } = useAuth()
  if (loading) return <div className="center-message">読み込み中...</div>
  if (session) return <Navigate to="/" replace />
  return <LoginPage />
}

function AdminArea() {
  return (
    <ProtectedRoute>
      <Routes>
        <Route
          path="/print/publisher-card/:publisherId/:year"
          element={
            <Suspense fallback={<div className="center-message">読み込み中...</div>}>
              <PublisherCardPrintPage />
            </Suspense>
          }
        />
        <Route path="/print/year-end-notice/:publisherId/:year" element={<YearEndNoticePrintPage />} />
        <Route
          path="/print/congregation-summary/:year/:pattern"
          element={
            <Suspense fallback={<div className="center-message">読み込み中...</div>}>
              <CongregationSummaryPrintPage />
            </Suspense>
          }
        />
        <Route
          path="/*"
          element={
            <Layout>
              <Routes>
                <Route path="/" element={<ReportsListPage />} />
                <Route path="/submission-status" element={<SubmissionStatusPage />} />
                <Route path="/publishers" element={<PublishersPage />} />
                <Route path="/pioneer-progress" element={<PioneerProgressPage />} />
                <Route path="/reports" element={<ReportsHubPage />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </ProtectedRoute>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/*" element={<AdminArea />} />
    </Routes>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  )
}
