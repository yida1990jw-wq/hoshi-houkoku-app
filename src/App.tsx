import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { SubmissionStatusPage } from './pages/SubmissionStatusPage'
import { ReportsListPage } from './pages/ReportsListPage'
import { PublishersPage } from './pages/PublishersPage'
import { PioneerProgressPage } from './pages/PioneerProgressPage'
import { ReportsHubPage } from './pages/ReportsHubPage'
import { StaffPage } from './pages/StaffPage'
import { SetPasswordPage } from './pages/SetPasswordPage'
import { PublicReportPage } from './pages/PublicReportPage'

// pdf-lib/fontkit(数百KB)を使うため、印刷時にだけ読み込むよう分離する
const PublisherCardPrintPage = lazy(() =>
  import('./pages/print/PublisherCardPrintPage').then((m) => ({ default: m.PublisherCardPrintPage })),
)
const PublisherCardsPrintPage = lazy(() =>
  import('./pages/print/PublisherCardsPrintPage').then((m) => ({ default: m.PublisherCardsPrintPage })),
)
const CongregationSummaryPrintPage = lazy(() =>
  import('./pages/print/CongregationSummaryPrintPage').then((m) => ({ default: m.CongregationSummaryPrintPage })),
)
const YearEndNoticePrintPage = lazy(() =>
  import('./pages/print/YearEndNoticePrintPage').then((m) => ({ default: m.YearEndNoticePrintPage })),
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
        <Route
          path="/print/publisher-cards/:scope/:year"
          element={
            <Suspense fallback={<div className="center-message">読み込み中...</div>}>
              <PublisherCardsPrintPage />
            </Suspense>
          }
        />
        <Route
          path="/print/year-end-notice/:publisherId/:year"
          element={
            <Suspense fallback={<div className="center-message">読み込み中...</div>}>
              <YearEndNoticePrintPage />
            </Suspense>
          }
        />
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
                <Route
                  path="/staff"
                  element={
                    <AdminRoute>
                      <StaffPage />
                    </AdminRoute>
                  }
                />
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
      <Route path="/submit" element={<PublicReportPage />} />
      <Route path="/*" element={<AdminArea />} />
    </Routes>
  )
}

// 招待/パスワード再設定リンクは #access_token=...&type=invite のようにハッシュ部分に
// トークンを載せて返ってくる。HashRouterはハッシュ全体をルートパスとして解釈してしまうため、
// 通常のルーティングに乗せる前にここで検知し、専用のパスワード設定画面を表示する
function isInviteOrRecoveryLink() {
  return /type=(invite|recovery)/.test(window.location.hash)
}

export default function App() {
  if (isInviteOrRecoveryLink()) {
    return (
      <AuthProvider>
        <SetPasswordPage />
      </AuthProvider>
    )
  }

  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  )
}
