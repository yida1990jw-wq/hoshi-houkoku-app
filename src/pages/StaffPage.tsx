import { useEffect, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabaseClient'
import { STAFF_ROLES, type Staff, type StaffRole } from '../types/domain'
import { useAuth } from '../context/AuthContext'

const REPORT_LINK = `${window.location.origin}${window.location.pathname}#/submit`

function ReportLinkSection() {
  const [copied, setCopied] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')

  useEffect(() => {
    QRCode.toDataURL(REPORT_LINK, { width: 220 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [])

  async function handleCopy() {
    await navigator.clipboard.writeText(REPORT_LINK)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="publisher-inline-form">
      <h2>報告リンク</h2>
      <p className="reports-hint">ログイン不要で野外奉仕の報告を送信できるページです。奉仕者に共有してください。</p>
      <div className="publisher-form-grid">
        <label>
          リンク
          <input value={REPORT_LINK} readOnly onFocus={(e) => e.target.select()} />
        </label>
      </div>
      <div className="publisher-form-actions">
        <button type="button" onClick={handleCopy}>
          {copied ? 'コピーしました' : 'リンクをコピー'}
        </button>
      </div>
      {qrDataUrl && <img src={qrDataUrl} alt="報告リンクのQRコード" width={220} height={220} />}
    </section>
  )
}

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: '管理者(閲覧・編集)',
  overseer: '監督者(閲覧のみ)',
}

// supabase-jsのFunctionsHttpErrorはerror.messageに「Edge Function returned a non-2xx status code」
// という汎用文言しか持たないため、関数が返したJSON本文から実際のエラー内容を取り出す
async function extractFunctionError(e: unknown): Promise<string> {
  if (e instanceof FunctionsHttpError) {
    const body: { error?: string } | null = await e.context.json().catch(() => null)
    return body?.error ?? e.message
  }
  return e instanceof Error ? e.message : '処理に失敗しました'
}

export function StaffPage() {
  const { session } = useAuth()
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<StaffRole>('overseer')

  async function refetch() {
    const { data, error } = await supabase.from('staff').select('*').order('display_name').returns<Staff[]>()
    if (error) throw error
    setStaff(data ?? [])
  }

  useEffect(() => {
    refetch()
      .catch((e) => setError(e instanceof Error ? e.message : '読み込みに失敗しました'))
      .finally(() => setLoading(false))
  }, [])

  async function handleInvite() {
    if (!email.trim() || !displayName.trim()) {
      setError('メールアドレスと表示名を入力してください')
      return
    }
    setInviting(true)
    setError(null)
    try {
      const { error } = await supabase.functions.invoke('invite-staff', {
        body: { action: 'invite', email: email.trim(), display_name: displayName.trim(), role },
      })
      if (error) throw error
      await refetch()
      setEmail('')
      setDisplayName('')
      setRole('overseer')
      setFormOpen(false)
    } catch (e) {
      setError(await extractFunctionError(e))
    } finally {
      setInviting(false)
    }
  }

  async function handleRoleChange(s: Staff, newRole: StaffRole) {
    setError(null)
    try {
      const { error } = await supabase.from('staff').update({ role: newRole }).eq('user_id', s.user_id)
      if (error) throw error
      await refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新に失敗しました')
    }
  }

  async function handleDelete(s: Staff) {
    if (!window.confirm(`「${s.display_name}」を削除しますか?(ログインアカウント自体も完全に削除されます。復帰させる場合は改めて招待が必要です)`))
      return
    setError(null)
    try {
      const { error } = await supabase.functions.invoke('invite-staff', {
        body: { action: 'delete', user_id: s.user_id },
      })
      if (error) throw error
      await refetch()
    } catch (e) {
      setError(await extractFunctionError(e))
    }
  }

  if (loading) return <div className="center-message">読み込み中...</div>

  return (
    <div className="page">
      <div className="page-header">
        <h1>設定</h1>
      </div>

      <ReportLinkSection />

      <div className="page-header">
        <h2>スタッフ管理</h2>
        <button type="button" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? '取消' : '+ 招待'}
        </button>
      </div>
      <p className="reports-hint">
        「監督者」は全データを閲覧できますが、追加・編集・削除はできません。招待するとメールで招待リンクが送信され、本人がパスワードを設定します。
        パスワードを忘れた場合は、削除して招待し直す必要はありません。Supabaseダッシュボードの Authentication → Users
        から該当ユーザーを選び、パスワード再設定メールを送信してください。届いたリンクから、招待時と同じ画面でパスワードを再設定できます。
      </p>
      {error && <p className="error-text">{error}</p>}
      {formOpen && (
        <div className="publisher-inline-form">
          <h2>スタッフを招待</h2>
          <div className="publisher-form-grid">
            <label>
              メールアドレス
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              表示名
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
            <label>
              役割
              <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="publisher-form-actions">
            <button type="button" onClick={handleInvite} disabled={inviting}>
              {inviting ? '送信中...' : '招待を送信'}
            </button>
          </div>
        </div>
      )}
      <table className="crud-table">
        <thead>
          <tr>
            <th>表示名</th>
            <th>メールアドレス</th>
            <th>役割</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.user_id}>
              <td>{s.display_name}</td>
              <td>{s.email ?? ''}</td>
              <td>
                <select value={s.role} onChange={(e) => handleRoleChange(s, e.target.value as StaffRole)}>
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="row-actions">
                <button type="button" onClick={() => handleDelete(s)} disabled={s.user_id === session?.user.id}>
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
