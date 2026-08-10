import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

// 招待リンク・パスワード再設定リンクから来た場合に表示する、初回パスワード設定画面
export function SetPasswordPage() {
  const { loading, session } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('パスワードは6文字以上にしてください')
      return
    }
    if (password !== confirm) {
      setError('パスワードが一致しません')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
    // URLに残った招待トークンを消してから通常のアプリ画面に切り替える
    window.location.hash = ''
    window.location.reload()
  }

  if (loading) return <div className="center-message">読み込み中...</div>
  if (!session) {
    return <div className="center-message">招待リンクが無効か期限切れです。管理者に再招待を依頼してください。</div>
  }
  if (done) return <div className="center-message">パスワードを設定しました。読み込み直しています...</div>

  return (
    <div className="login-page">
      <form className="login-form" onSubmit={handleSubmit}>
        <h1>パスワードを設定してください</h1>
        <label>
          新しいパスワード
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        </label>
        <label>
          確認のため再入力
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? '設定中...' : '設定する'}
        </button>
      </form>
    </div>
  )
}
