import { useEffect, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabaseClient'
import { STAFF_ROLES, type Group, type Staff, type StaffRole } from '../types/domain'
import { useAuth } from '../context/AuthContext'
import { CONSIDERATION_REASONS, fetchReportRules, type ReportRules } from '../lib/reportRules'
import {
  backupFileStamp,
  deleteReportsOfYear,
  downloadFile,
  fetchBackup,
  fetchReportYearCounts,
  retentionStatus,
  toCsv,
  toReportImportCsv,
  toRosterImportCsv,
  type RetentionStatus,
  type YearCount,
} from '../lib/backup'
import { actualServiceYear } from '../lib/serviceYear'

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

// 会衆の記録はSupabaseの1か所にしかなく、無料プランには自動バックアップが無いため、
// 手元に控えを残せるようにする
function BackupSection() {
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(kind: 'json' | 'publishers' | 'reports' | 'rosterImport' | 'reportImport') {
    setBusy(kind)
    setError(null)
    setDone(null)
    try {
      const data = await fetchBackup()
      const stamp = backupFileStamp()
      if (kind === 'json') {
        downloadFile(`奉仕報告バックアップ_${stamp}.json`, JSON.stringify(data, null, 2), 'application/json')
        setDone(`名簿${data.publishers.length}件・報告${data.serviceReports.length}件を書き出しました`)
      } else if (kind === 'publishers') {
        const groupName = new Map(data.groups.map((g) => [g.id as string, g.name as string]))
        const rows = data.publishers.map((p) => ({ ...p, group_name: groupName.get(p.group_id as string) ?? '' }))
        downloadFile(`名簿_${stamp}.csv`, toCsv(rows), 'text/csv;charset=utf-8')
        setDone(`名簿${rows.length}件を書き出しました`)
      } else if (kind === 'rosterImport') {
        downloadFile(`取込用_名簿_${stamp}.csv`, toRosterImportCsv(data), 'text/csv;charset=utf-8')
        setDone(`名簿${data.publishers.length}件を取込用の並びで書き出しました`)
      } else if (kind === 'reportImport') {
        downloadFile(`取込用_報告_${stamp}.csv`, toReportImportCsv(data), 'text/csv;charset=utf-8')
        setDone(`報告${data.serviceReports.length}件を取込用の並びで書き出しました`)
      } else {
        // 報告だけでは誰の行か分からないため、氏名を添えて書き出す
        const name = new Map(data.publishers.map((p) => [p.id as string, `${p.last_name} ${p.first_name}`]))
        const rows = data.serviceReports.map((r) => ({
          氏名: name.get(r.publisher_id as string) ?? '',
          ...r,
        }))
        downloadFile(`報告_${stamp}.csv`, toCsv(rows), 'text/csv;charset=utf-8')
        setDone(`報告${rows.length}件を書き出しました`)
      }
    } catch (e) {
      setError((e as { message?: string })?.message || '書き出しに失敗しました')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>データの書き出し</h2>
      </div>
      <p className="reports-hint">
        会衆の記録はこのアプリの中だけにあり、自動のバックアップはありません。年に一度でも書き出して、
        パソコンや外部の保存先に残しておくことをお勧めします。
      </p>
      {error && <p className="error-text">{error}</p>}
      {done && <p className="reports-hint">{done}</p>}
      <div className="publisher-inline-form">
        <div className="publisher-form-actions">
          <button type="button" onClick={() => run('json')} disabled={!!busy}>
            {busy === 'json' ? '書き出し中...' : 'バックアップ（全データ）'}
          </button>
          <button type="button" onClick={() => run('publishers')} disabled={!!busy}>
            {busy === 'publishers' ? '書き出し中...' : '名簿（CSV）'}
          </button>
          <button type="button" onClick={() => run('reports')} disabled={!!busy}>
            {busy === 'reports' ? '書き出し中...' : '報告（CSV）'}
          </button>
        </div>
        <p className="reports-hint">
          「バックアップ（全データ）」は名簿・報告・グループ・設定をまとめたファイルです。中身を読む用途では
          CSVの方をExcelで開けます。
        </p>
        <h3 style={{ fontSize: 14, margin: '16px 0 8px' }}>復元用（一括貼り付けにそのまま使えます）</h3>
        <div className="publisher-form-actions">
          <button type="button" onClick={() => run('rosterImport')} disabled={!!busy}>
            {busy === 'rosterImport' ? '書き出し中...' : '取込用CSV（名簿）'}
          </button>
          <button type="button" onClick={() => run('reportImport')} disabled={!!busy}>
            {busy === 'reportImport' ? '書き出し中...' : '取込用CSV（報告）'}
          </button>
        </div>
        <p className="reports-hint">
          誤って消してしまったときは、これをExcelで開いて必要な行をコピーし、名簿または報告一覧の「一括貼り付け」に
          貼り付ければ戻せます。列の並びは貼り付け先に合わせてあるので、並べ替えは不要です。報告は末尾に年度・月の列が
          あるので、Excelで絞り込んでから貼り付けてください（この2列は貼り付けても無視されます）。報告は貼り付け先の
          画面で選んでいる年度・月に書き込まれるため、<strong>月ごとに選び直して貼り付けてください</strong>。
        </p>
      </div>
    </>
  )
}

// 古い記録の削除。年度単位(12か月分)で選んで消す。保存ルール
// (最低13か月・最長36か月 = 当年度と前年度は必ず残す)に反する年度には警告を出す
const RETENTION_MESSAGE: Record<RetentionStatus, string> = {
  deletable: '保存期間(36か月)を過ぎています。削除できます。',
  withinRetention: '保存期間(36か月)の範囲内です。削除すると保存期間より短くなります。',
  required: '伝道者記録に必要な年度です(当年度・前年度)。削除しないでください。',
}

function RetentionSection() {
  const [years, setYears] = useState<YearCount[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 初期値用の currentServiceYear() は9〜12月に1年ずれるため、削除の判定には使わない
  const currentYear = actualServiceYear()

  async function reload() {
    try {
      const list = await fetchReportYearCounts()
      setYears(list)
      // 既定では、消してよい最も古い年度を選んでおく
      const oldestDeletable = list.find((y) => retentionStatus(y.year, currentYear) === 'deletable')
      setSelected(oldestDeletable?.year ?? list[0]?.year ?? null)
      setError(null)
    } catch (e) {
      setError((e as { message?: string })?.message || '確認に失敗しました')
      setYears([])
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const target = years?.find((y) => y.year === selected) ?? null
  const status = target ? retentionStatus(target.year, currentYear) : null

  async function handleDelete() {
    if (!target || !status) return
    const warning =
      status === 'deletable'
        ? ''
        : `
【警告】${RETENTION_MESSAGE[status]}
`
    if (
      !window.confirm(
        `${target.year}年度の報告 ${target.count}件(12か月分)を完全に削除します。取り消せません。
${warning}
` +
          '先に「データの書き出し」でバックアップを取りましたか?',
      )
    )
      return
    setDeleting(true)
    setError(null)
    setDone(null)
    try {
      await deleteReportsOfYear(target.year)
      setDone(`${target.year}年度の${target.count}件を削除しました`)
      await reload()
    } catch (e) {
      setError((e as { message?: string })?.message || '削除に失敗しました')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>古い記録の削除</h2>
      </div>
      <p className="reports-hint">
        奉仕報告は最低13か月・最長36か月の保存とされています。年度を選んで、その年度の12か月分をまとめて削除します。
        <strong>当年度({currentYear}年度)と前年度({currentYear - 1}年度)は伝道者記録に必要なので残してください。</strong>
      </p>
      <p className="reports-hint">
        <strong>削除は取り消せません。必ず先に上の「データの書き出し」でバックアップを取ってください。</strong>
      </p>
      {error && <p className="error-text">{error}</p>}
      {done && <p className="reports-hint">{done}</p>}
      <div className="publisher-inline-form">
        {years === null ? (
          <p className="reports-hint">確認中...</p>
        ) : years.length === 0 ? (
          <p className="reports-hint">報告がまだありません。</p>
        ) : (
          <>
            <div className="publisher-form-grid">
              <label>
                削除する年度
                <select value={selected ?? ''} onChange={(e) => setSelected(Number(e.target.value))}>
                  {years.map((y) => (
                    <option key={y.year} value={y.year}>
                      {y.year}年度（{y.count}件）
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {status && (
              <p className={status === 'required' ? 'error-text' : 'reports-hint'}>{RETENTION_MESSAGE[status]}</p>
            )}
            <div className="publisher-form-actions">
              <button type="button" onClick={handleDelete} disabled={deleting || !target}>
                {deleting ? '削除中...' : target ? `${target.year}年度の${target.count}件を削除する` : '削除する'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

// 報告のルール。以前はコードに直接書いていた値を、ここから変えられるようにしている。
// 変更はそれ以降の報告にだけ効き、過去の報告は当時のルールで計算された値のまま残る
function ReportRulesSection() {
  const [draft, setDraft] = useState<ReportRules | null>(null)
  const [auxText, setAuxText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchReportRules()
      .then((r) => {
        setDraft(r)
        setAuxText(r.auxPioneerHours.join('、'))
      })
      .catch(() => setError('読み込みに失敗しました'))
  }, [])

  async function handleSave() {
    if (!draft) return
    // 「15、30」「15,30」どちらの区切りでも受け付ける
    const hours = auxText
      .split(/[、,\s]+/)
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isInteger(v) && v > 0)
    if (hours.length === 0) {
      setError('補助開拓の選択肢は、1つ以上の数字を入れてください（例: 15、30）')
      return
    }
    if (!CONSIDERATION_REASONS.includes(draft.consideredCapExemptReason as (typeof CONSIDERATION_REASONS)[number])) {
      setError('上限を適用しない理由は、考慮理由の一覧にあるものを選んでください')
      return
    }
    setSaving(true)
    setError(null)
    setSaved(false)
    const { error: saveError } = await supabase
      .from('report_rules')
      .update({
        considered_hours_cap: draft.consideredHoursCap,
        considered_cap_exempt_reason: draft.consideredCapExemptReason,
        aux_pioneer_hours: hours,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
    setSaving(false)
    if (saveError) {
      setError((saveError as { message?: string }).message || '保存に失敗しました')
      return
    }
    setDraft({ ...draft, auxPioneerHours: hours })
    setAuxText(hours.join('、'))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (!draft) {
    return (
      <>
        <div className="page-header">
          <h2>報告のルール</h2>
        </div>
        {error ? <p className="error-text">{error}</p> : <p className="reports-hint">読み込み中...</p>}
      </>
    )
  }

  return (
    <>
      <div className="page-header">
        <h2>報告のルール</h2>
      </div>
      <p className="reports-hint">
        報告フォームの計算に使う値です。変更した時点より後の報告にだけ効き、過去の報告はそのまま残ります。
      </p>
      {error && <p className="error-text">{error}</p>}
      <div className="publisher-inline-form">
        <div className="publisher-form-grid">
          <label>
            考慮時間の上限（時間）
            <input
              type="number"
              min={1}
              max={999}
              value={draft.consideredHoursCap}
              onChange={(e) => setDraft({ ...draft, consideredHoursCap: Number(e.target.value) })}
            />
          </label>
          <label>
            上限を適用しない理由
            <select
              value={draft.consideredCapExemptReason}
              onChange={(e) => setDraft({ ...draft, consideredCapExemptReason: e.target.value })}
            >
              {CONSIDERATION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label>
            補助開拓の選択肢（時間）
            <input value={auxText} onChange={(e) => setAuxText(e.target.value)} placeholder="15、30" />
          </label>
        </div>
        <p className="reports-hint">
          「奉仕時間＋考慮時間」が上限を超えるとき、超えない分まで自動で調整します。「上限を適用しない理由」が選ばれた月は、入力された考慮時間をそのまま採用します。
          補助開拓の選択肢は、区切って複数入れられます（例: 15、30）。
        </p>
        <div className="publisher-form-actions">
          <button type="button" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : saved ? '保存しました' : '保存'}
          </button>
        </div>
      </div>
    </>
  )
}

// グループ(村野/春日/大峰/津田 など)の追加・名前の変更。
// 名簿の所属・提出状況の並び・帳票の一括出力の単位に使われる
function GroupsSection() {
  const [groups, setGroups] = useState<Group[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refetch() {
    const [{ data: groupRows, error: groupError }, { data: publisherRows, error: publisherError }] = await Promise.all([
      supabase.from('groups').select('*').order('name').returns<Group[]>(),
      // 在籍者だけを数える(削除してよいかの判断と、名前変更時の影響範囲の目安に使う)
      supabase.from('publishers').select('group_id').eq('is_active', true).returns<{ group_id: string | null }[]>(),
    ])
    if (groupError) throw groupError
    if (publisherError) throw publisherError
    setGroups(groupRows ?? [])
    const tally: Record<string, number> = {}
    for (const p of publisherRows ?? []) {
      if (p.group_id) tally[p.group_id] = (tally[p.group_id] ?? 0) + 1
    }
    setCounts(tally)
  }

  useEffect(() => {
    refetch().catch((e) => setError(describeError(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // supabase が返すエラーは Error のインスタンスではなく { code, details, hint, message } という
  // ただのオブジェクトなので、instanceof Error では中身を取り出せない(実機で確認済み)。
  // 判定は文言ではなく Postgres のエラーコードで行う(23505 = unique_violation。
  // groups.name の unique 制約に当たったケース)
  function describeError(e: unknown) {
    const err = e as { code?: string; message?: string } | null
    if (err?.code === '23505') return '同じ名前のグループが既にあります'
    return err?.message || '処理に失敗しました'
  }

  // supabase のクエリビルダーは Promise そのものではなく thenable のため PromiseLike で受ける
  async function run(action: () => PromiseLike<{ error: unknown }>) {
    setBusy(true)
    setError(null)
    try {
      const { error } = await action()
      if (error) throw error
      await refetch()
      return true
    } catch (e) {
      setError(describeError(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return
    if (await run(() => supabase.from('groups').insert({ name }))) {
      setNewName('')
      setAdding(false)
    }
  }

  async function handleSave(group: Group) {
    const name = draftName.trim()
    if (!name) return
    if (name === group.name) {
      setEditingId(null)
      return
    }
    if (await run(() => supabase.from('groups').update({ name }).eq('id', group.id))) {
      setEditingId(null)
    }
  }

  async function handleDelete(group: Group) {
    // 所属者がいるグループを消すと、その人たちの所属が「未設定」に変わってしまう
    // (publishers.group_id が on delete set null のため)。過去の報告自体は消えないが、
    // 気付きにくい形で名簿が変わるので、空のときだけ削除できるようにしている
    const count = counts[group.id] ?? 0
    if (count > 0) {
      setError(`「${group.name}」には在籍者が${count}名います。先に別のグループへ移してから削除してください`)
      return
    }
    if (!window.confirm(`グループ「${group.name}」を削除しますか?`)) return
    await run(() => supabase.from('groups').delete().eq('id', group.id))
  }

  return (
    <>
      <div className="page-header">
        <h2>グループ管理</h2>
        <button type="button" onClick={() => setAdding((v) => !v)}>
          {adding ? '取消' : '+ 新規追加'}
        </button>
      </div>
      <p className="reports-hint">
        名簿の所属・提出状況の表示・伝道者記録の一括出力の単位に使われます。名前を変えても所属している人はそのままです。
        ただし名簿の一括貼り付けはグループ名の文字列で照合するため、貼り付け元の表記も合わせてください。
      </p>
      {error && <p className="error-text">{error}</p>}
      {adding && (
        <div className="publisher-inline-form">
          <div className="publisher-form-grid">
            <label>
              グループ名
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd()
                }}
                autoFocus
              />
            </label>
          </div>
          <div className="publisher-form-actions">
            <button type="button" onClick={handleAdd} disabled={busy || !newName.trim()}>
              追加
            </button>
          </div>
        </div>
      )}
      <table className="crud-table">
        <thead>
          <tr>
            <th>グループ名</th>
            <th>在籍者</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id}>
              <td>
                {editingId === g.id ? (
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSave(g)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    autoFocus
                  />
                ) : (
                  g.name
                )}
              </td>
              <td>{counts[g.id] ?? 0}名</td>
              <td className="row-actions">
                {editingId === g.id ? (
                  <>
                    <button type="button" onClick={() => handleSave(g)} disabled={busy || !draftName.trim()}>
                      保存
                    </button>
                    <button type="button" onClick={() => setEditingId(null)}>
                      取消
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(g.id)
                        setDraftName(g.name)
                      }}
                    >
                      編集
                    </button>
                    <button type="button" onClick={() => handleDelete(g)} disabled={busy}>
                      削除
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {groups.length === 0 && (
            <tr>
              <td colSpan={3}>グループがまだありません。</td>
            </tr>
          )}
        </tbody>
      </table>
    </>
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

      <GroupsSection />

      <ReportRulesSection />

      <BackupSection />

      <RetentionSection />

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
