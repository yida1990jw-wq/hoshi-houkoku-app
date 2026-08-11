import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { PIONEER_STATUSES, type Publisher, type ServiceReport } from '../types/domain'
import { currentMonth, currentServiceYear } from '../lib/serviceYear'
import { useSessionPersistedState } from '../lib/usePersistedState'
import { mapPioneerStatus } from '../lib/importParsing'
import { fetchLatestReportedPeriod } from '../lib/latestPeriod'
import { useAuth } from '../context/AuthContext'
import { RowActionsMenu } from '../components/RowActionsMenu'

const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => currentServiceYear() - 2 + i)
const MONTH_OPTIONS = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8]
const NEW_ROW_ID = '__new__'

const SUMMARY_STATUS_ROWS: Array<{ status: (typeof PIONEER_STATUSES)[number]; label: string }> = [
  { status: '伝道者', label: '伝' },
  { status: '補助開拓者', label: '補' },
  { status: '正規開拓者', label: '開' },
  { status: '特別開拓者', label: '特開' },
  { status: '野外の宣教者', label: '野宣' },
]

function normalizeName(s: string) {
  return s.replace(/\s+/g, '')
}

interface ReportDraft {
  publisher_id: string
  preached: boolean
  bible_studies: string
  hours: string
  considered_hours: string
  remarks: string
  pioneer_status_snapshot: string
  no_count: boolean
}

const EMPTY_DRAFT: ReportDraft = {
  publisher_id: '',
  preached: false,
  bible_studies: '0',
  hours: '0',
  considered_hours: '0',
  remarks: '',
  pioneer_status_snapshot: PIONEER_STATUSES[0],
  no_count: false,
}

function draftFromReport(r: ServiceReport): ReportDraft {
  return {
    publisher_id: r.publisher_id,
    preached: r.preached,
    bible_studies: String(r.bible_studies),
    hours: String(r.hours),
    considered_hours: String(r.considered_hours),
    remarks: r.remarks ?? '',
    pioneer_status_snapshot: r.pioneer_status_snapshot,
    no_count: r.no_count,
  }
}

function draftToPatch(d: ReportDraft) {
  return {
    preached: d.preached,
    bible_studies: Number(d.bible_studies) || 0,
    hours: Number(d.hours) || 0,
    considered_hours: Number(d.considered_hours) || 0,
    remarks: d.remarks.trim() || null,
    pioneer_status_snapshot: d.pioneer_status_snapshot,
    no_count: d.no_count,
  }
}

function ReportFormFields({
  draft,
  setDraft,
  isNew,
  publisherOptions,
}: {
  draft: ReportDraft
  setDraft: (update: (d: ReportDraft) => ReportDraft) => void
  isNew: boolean
  publisherOptions: Publisher[]
}) {
  return (
    <div className="publisher-form-grid">
      {isNew && (
        <label>
          氏名
          <select value={draft.publisher_id} onChange={(e) => setDraft((d) => ({ ...d, publisher_id: e.target.value }))}>
            <option value="">選択してください</option>
            {publisherOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.last_name} {p.first_name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        宣教を行った
        <input
          type="checkbox"
          checked={draft.preached}
          onChange={(e) => {
            const preached = e.target.checked
            // 宣教「いいえ」の月は集計対象外(NC)にする
            setDraft((d) => ({ ...d, preached, no_count: preached ? d.no_count : true }))
          }}
        />
      </label>
      <label>
        研究
        <input
          type="number"
          value={draft.bible_studies}
          onChange={(e) => setDraft((d) => ({ ...d, bible_studies: e.target.value }))}
        />
      </label>
      <label>
        時間
        <input type="number" value={draft.hours} onChange={(e) => setDraft((d) => ({ ...d, hours: e.target.value }))} />
      </label>
      <label>
        考慮
        <input
          type="number"
          value={draft.considered_hours}
          onChange={(e) => setDraft((d) => ({ ...d, considered_hours: e.target.value }))}
        />
      </label>
      <label>
        備考
        <input value={draft.remarks} onChange={(e) => setDraft((d) => ({ ...d, remarks: e.target.value }))} />
      </label>
      <label>
        立場(当時)
        <select
          value={draft.pioneer_status_snapshot}
          onChange={(e) => setDraft((d) => ({ ...d, pioneer_status_snapshot: e.target.value }))}
        >
          {PIONEER_STATUSES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label title="転入前の記録など、本人の伝道者記録には残すが会衆集計・開拓者進捗・提出状況には反映させない場合にチェックします">
        NC(集計対象外)
        <input
          type="checkbox"
          checked={draft.no_count}
          onChange={(e) => setDraft((d) => ({ ...d, no_count: e.target.checked }))}
        />
      </label>
    </div>
  )
}

export function ReportsListPage() {
  const { isAdmin } = useAuth()
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [reports, setReports] = useState<ServiceReport[]>([])
  const [year, setYear] = useSessionPersistedState('reportList.year', currentServiceYear())
  const [month, setMonth] = useSessionPersistedState('reportList.month', currentMonth())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ReportDraft>(EMPTY_DRAFT)
  const [pasteText, setPasteText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ added: number; warnings: string[] } | null>(null)

  useEffect(() => {
    // このタブ(セッション)でまだ年度・月を選んでいない場合だけ、今日の日付ではなく登録済みの最新の月を初期値にする
    if (sessionStorage.getItem('reportList.year') !== null) return
    fetchLatestReportedPeriod()
      .then((latest) => {
        if (!latest) return
        setYear(latest.year)
        setMonth(latest.month)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = useCallback(async () => {
    const [{ data: pubData, error: pubError }, { data: reportData, error: reportError }] = await Promise.all([
      supabase.from('publishers').select('*').order('last_name_kana').returns<Publisher[]>(),
      supabase.from('service_reports').select('*').eq('year', year).eq('month', month).returns<ServiceReport[]>(),
    ])
    if (pubError) throw pubError
    if (reportError) throw reportError
    return { publishers: pubData ?? [], reports: reportData ?? [] }
  }, [year, month])

  // 保存/削除/一括取込のあとに使う、その場で結果を反映する再取得
  async function refetch() {
    const data = await fetchData()
    setPublishers(data.publishers)
    setReports(data.reports)
  }

  useEffect(() => {
    // 起動直後にfetchLatestReportedPeriodの結果でyear/monthが変わると、
    // 古いyear/monthでの取得が後から解決して新しい結果を上書きしてしまうことがあるため、
    // 該当のeffect実行が最新でなくなった場合は結果を反映しない
    let cancelled = false
    setLoading(true)
    setError(null)
    setImportResult(null)
    fetchData()
      .then((data) => {
        if (cancelled) return
        setPublishers(data.publishers)
        setReports(data.reports)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '読み込みに失敗しました')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchData])

  const publisherMap = useMemo(() => new Map(publishers.map((p) => [p.id, p])), [publishers])
  const publisherName = (id: string) => {
    const p = publisherMap.get(id)
    return p ? `${p.last_name} ${p.first_name}` : '(不明)'
  }

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      const statusDiff = PIONEER_STATUSES.indexOf(a.pioneer_status_snapshot as (typeof PIONEER_STATUSES)[number]) -
        PIONEER_STATUSES.indexOf(b.pioneer_status_snapshot as (typeof PIONEER_STATUSES)[number])
      if (statusDiff !== 0) return statusDiff
      const romajiA = publisherMap.get(a.publisher_id)?.romaji ?? ''
      const romajiB = publisherMap.get(b.publisher_id)?.romaji ?? ''
      return romajiA.localeCompare(romajiB)
    })
  }, [reports, publisherMap])

  // 対象月の立場別集計(人数・研究・時間)。NCが立った報告は会衆集計と同様に除外する
  const monthSummary = useMemo(() => {
    const counted = reports.filter((r) => !r.no_count)
    const rows = SUMMARY_STATUS_ROWS.map(({ status, label }) => {
      const matching = counted.filter((r) => r.pioneer_status_snapshot === status)
      return {
        label,
        count: matching.length,
        studies: matching.reduce((sum, r) => sum + r.bible_studies, 0),
        hours: matching.reduce((sum, r) => sum + r.hours, 0),
      }
    })
    const total = {
      count: rows.reduce((sum, r) => sum + r.count, 0),
      studies: rows.reduce((sum, r) => sum + r.studies, 0),
      hours: rows.reduce((sum, r) => sum + r.hours, 0),
    }
    return { rows, total }
  }, [reports])

  const unreportedPublishers = useMemo(() => {
    const reportedIds = new Set(reports.map((r) => r.publisher_id))
    return publishers.filter((p) => p.is_active && !reportedIds.has(p.id))
  }, [publishers, reports])

  function toggleAddRow() {
    if (editingId === NEW_ROW_ID) {
      cancelEdit()
      return
    }
    setEditingId(NEW_ROW_ID)
    setDraft(EMPTY_DRAFT)
    setError(null)
  }

  function startEdit(r: ServiceReport) {
    setEditingId(r.id)
    setDraft(draftFromReport(r))
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setError(null)
  }

  async function handleSave() {
    setError(null)
    try {
      if (editingId === NEW_ROW_ID) {
        if (!draft.publisher_id) {
          setError('氏名を選択してください')
          return
        }
        const { error } = await supabase.from('service_reports').insert({
          publisher_id: draft.publisher_id,
          year,
          month,
          ...draftToPatch(draft),
        })
        if (error) throw error
      } else if (editingId) {
        const { error } = await supabase.from('service_reports').update(draftToPatch(draft)).eq('id', editingId)
        if (error) throw error
      }
      await refetch()
      cancelEdit()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    }
  }

  async function handleDelete(r: ServiceReport) {
    if (!window.confirm(`${publisherName(r.publisher_id)}の${month}月の報告を削除しますか?`)) return
    setError(null)
    try {
      const { error } = await supabase.from('service_reports').delete().eq('id', r.id)
      if (error) throw error
      await refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    }
  }

  async function handleBulkImport() {
    const lines = pasteText
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.trim() !== '')
    if (lines.length === 0) return

    setImporting(true)
    setError(null)
    setImportResult(null)

    const warnings: string[] = []
    const rows: Array<{
      publisher_id: string
      year: number
      month: number
      preached: boolean
      bible_studies: number
      hours: number
      considered_hours: number
      remarks: string | null
      pioneer_status_snapshot: string
      no_count: boolean
    }> = []

    for (const line of lines) {
      const cols = line.split('\t')
      const [nameRaw, preachedRaw, studiesRaw, hoursRaw, remarksRaw, consideredRaw, statusRaw] = cols
      const name = normalizeName(nameRaw ?? '')
      if (!name) continue

      const publisher = publishers.find((p) => normalizeName(`${p.last_name}${p.first_name}`) === name)
      if (!publisher) {
        warnings.push(`「${nameRaw}」は名簿と一致しませんでした`)
        continue
      }

      // 「はい。」のように句点付きで貼り付けられることがあるため、前方一致で判定する
      const preachedText = preachedRaw?.trim() ?? ''
      const preached = preachedText.startsWith('はい') || preachedText.toLowerCase().startsWith('yes')

      // 立場列が指定されていればその月時点の立場として使う(補助開拓者など月ごとに変わる場合があるため)。
      // 未指定・認識できない場合は名簿の現在の立場にフォールバックする
      const statusText = statusRaw?.trim()
      const mappedStatus = mapPioneerStatus(statusText)
      if (statusText && !mappedStatus) warnings.push(`「${nameRaw}」の立場「${statusText}」を認識できず、名簿の現在の立場を使いました`)
      const pioneerStatusSnapshot = mappedStatus ?? publisher.pioneer_status

      rows.push({
        publisher_id: publisher.id,
        year,
        month,
        preached,
        bible_studies: Number(studiesRaw) || 0,
        hours: Number(hoursRaw) || 0,
        considered_hours: Number(consideredRaw) || 0,
        remarks: remarksRaw?.trim() || null,
        pioneer_status_snapshot: pioneerStatusSnapshot,
        // 宣教「いいえ」の月は集計対象外(NC)にする
        no_count: !preached,
      })
    }

    try {
      if (rows.length > 0) {
        const { error } = await supabase.from('service_reports').upsert(rows, { onConflict: 'publisher_id,year,month' })
        if (error) throw error
      }
      setImportResult({ added: rows.length, warnings })
      setPasteText('')
      await refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : '取り込みに失敗しました')
    } finally {
      setImporting(false)
    }
  }

  if (loading) return <div className="center-message">読み込み中...</div>

  return (
    <div className="page">
      <div className="page-header">
        <h1>報告一覧</h1>
        {isAdmin && (
          <button type="button" onClick={toggleAddRow}>
            {editingId === NEW_ROW_ID ? '取消' : '+ 追加'}
          </button>
        )}
      </div>
      <div className="date-nav">
        <label>
          年度
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}年度
              </option>
            ))}
          </select>
        </label>
        <label>
          月
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}月
              </option>
            ))}
          </select>
        </label>
      </div>
      <table className="crud-table month-summary-table">
        <thead>
          <tr>
            <th>立場</th>
            <th>人数</th>
            <th>研究</th>
            <th>時間</th>
          </tr>
        </thead>
        <tbody>
          {monthSummary.rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>{r.count}</td>
              <td>{r.studies}</td>
              {r.label === '伝' ? <td className="summary-na-cell" /> : <td>{r.hours}</td>}
            </tr>
          ))}
          <tr className="summary-total-row">
            <td>合計</td>
            <td>{monthSummary.total.count}</td>
            <td>{monthSummary.total.studies}</td>
            <td>{monthSummary.total.hours}</td>
          </tr>
        </tbody>
      </table>
      {isAdmin && (
        <details className="paste-import">
          <summary>報告を一括で貼り付けて取り込む({year}年度{month}月分)</summary>
          <p className="paste-import-hint">
            Googleスプレッドシートから「氏名・宣教(はい/いいえ)・研究・時間・備考・考慮・立場(任意)」の順にタブ区切りでコピーして貼り付けてください（1行1人）。氏名は名簿の姓名と完全一致(空白除く)で照合します。「立場」列はその月だけ補助開拓者だった場合などに指定してください。省略した場合は名簿の現在の立場が使われます。既に報告がある人・月の組み合わせは内容が上書きされ、貼り付けたデータに含まれない人の報告はそのまま残ります。宣教が「いいえ」の行は自動的にNC(集計対象外)になります。
          </p>
          <textarea
            className="paste-import-textarea"
            rows={8}
            placeholder={'荒木 豊\tはい。\t0\t5\t\t0\n本徳 初紀\tはい。\t1\t8\t\t0\t補助開拓者'}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <button type="button" onClick={handleBulkImport} disabled={importing || !pasteText.trim()}>
            {importing ? '取り込み中...' : '取り込む'}
          </button>
          {importResult && (
            <div className="paste-import-result">
              <p>{importResult.added}件を登録しました。</p>
              {importResult.warnings.length > 0 && (
                <ul>
                  {importResult.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </details>
      )}
      {error && <p className="error-text">{error}</p>}
      <table className="crud-table">
        <thead>
          <tr>
            <th>氏名</th>
            <th>宣教</th>
            <th>研究</th>
            <th>時間</th>
            <th>考慮</th>
            <th>備考</th>
            <th>立場(当時)</th>
            <th>NC</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {isAdmin && editingId === NEW_ROW_ID && (
            <tr>
              <td colSpan={9}>
                <div className="publisher-inline-form">
                  <h2>報告を追加</h2>
                  {error && <p className="error-text">{error}</p>}
                  <ReportFormFields draft={draft} setDraft={setDraft} isNew publisherOptions={unreportedPublishers} />
                  <div className="publisher-form-actions">
                    <button type="button" onClick={handleSave}>
                      保存
                    </button>
                    <button type="button" onClick={cancelEdit}>
                      取消
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          )}
          {sortedReports.map((r) =>
            isAdmin && editingId === r.id ? (
              <tr key={r.id}>
                <td colSpan={9}>
                  <div className="publisher-inline-form">
                    <h2>{publisherName(r.publisher_id)}の報告を編集</h2>
                    {error && <p className="error-text">{error}</p>}
                    <ReportFormFields draft={draft} setDraft={setDraft} isNew={false} publisherOptions={[]} />
                    <div className="publisher-form-actions">
                      <button type="button" onClick={handleSave}>
                        保存
                      </button>
                      <button type="button" onClick={cancelEdit}>
                        取消
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={r.id}>
                <td>{publisherName(r.publisher_id)}</td>
                <td>{r.preached ? '✓' : ''}</td>
                <td>{r.bible_studies}</td>
                <td>{r.hours}</td>
                <td>{r.considered_hours}</td>
                <td>{r.remarks ?? ''}</td>
                <td>{r.pioneer_status_snapshot}</td>
                <td>{r.no_count ? 'NC' : ''}</td>
                <td className="row-actions">
                  {isAdmin && <RowActionsMenu onEdit={() => startEdit(r)} onDelete={() => handleDelete(r)} />}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}
