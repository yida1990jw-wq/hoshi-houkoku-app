import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { PIONEER_TARGET_STATUSES, ROSTER_STATUS_ORDER, type Publisher } from '../types/domain'
import { currentServiceYear } from '../lib/serviceYear'
import { usePersistedState, useSessionPersistedState } from '../lib/usePersistedState'
import { SUMMARY_PATTERNS, type SummaryPattern } from '../lib/printData'
import { fetchLatestReportedYear } from '../lib/latestPeriod'

const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => currentServiceYear() - 2 + i)

const PATTERN_LABELS: Record<SummaryPattern, string> = {
  会衆: '会衆の合計',
  正開特開宣教者: '正規開拓者・特別開拓者・野外の宣教者の合計',
  補助開拓者: '補助開拓者の合計',
  伝道者: '伝道者の合計',
}

export function ReportsHubPage() {
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [publisherId, setPublisherId] = usePersistedState('reportsHub.publisherId', '')
  const [year, setYear] = useSessionPersistedState('reportsHub.year', currentServiceYear())
  const [summaryYear, setSummaryYear] = useSessionPersistedState('congregationSummary.year', currentServiceYear())
  const [summaryPattern, setSummaryPattern] = usePersistedState<SummaryPattern>('congregationSummary.pattern', '会衆')

  useEffect(() => {
    supabase
      .from('publishers')
      .select('*')
      .returns<Publisher[]>()
      .then(({ data }) => {
        // 伝道者→正規開拓者→特別開拓者→野外の宣教者(→補助開拓者→不活発者)の順、各々の中はローマ字順
        const sorted = [...(data ?? [])].sort((a, b) => {
          const statusDiff = ROSTER_STATUS_ORDER.indexOf(a.pioneer_status) - ROSTER_STATUS_ORDER.indexOf(b.pioneer_status)
          return statusDiff !== 0 ? statusDiff : (a.romaji ?? '').localeCompare(b.romaji ?? '')
        })
        setPublishers(sorted)
      })
  }, [])

  useEffect(() => {
    // このタブ(セッション)でまだ年度を選んでいない場合だけ、今日の日付ではなく登録済みの最新年度を初期値にする
    fetchLatestReportedYear()
      .then((latestYear) => {
        if (latestYear === null) return
        if (sessionStorage.getItem('reportsHub.year') === null) setYear(latestYear)
        if (sessionStorage.getItem('congregationSummary.year') === null) setSummaryYear(latestYear)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedPublisher = publishers.find((p) => p.id === publisherId)
  const needsYearEndNotice =
    !!selectedPublisher && PIONEER_TARGET_STATUSES.includes(selectedPublisher.pioneer_status as (typeof PIONEER_TARGET_STATUSES)[number])

  return (
    <div className="page">
      <div className="page-header">
        <h1>帳票印刷</h1>
      </div>

      <h2 style={{ fontSize: 15, marginBottom: 8 }}>個人の帳票</h2>
      <p className="reports-hint">個人・年度を選んで印刷したい帳票を開いてください。</p>
      <div className="date-nav">
        <label>
          伝道者
          <select value={publisherId} onChange={(e) => setPublisherId(e.target.value)}>
            <option value="">選択してください</option>
            {publishers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.last_name} {p.first_name}
              </option>
            ))}
          </select>
        </label>
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
      </div>
      <ul className="reports-list">
        {publisherId && (
          <li>
            <Link to={`/print/publisher-card/${publisherId}/${year}`}>伝道者記録を印刷</Link>
          </li>
        )}
        {publisherId && needsYearEndNotice && (
          <li>
            <Link to={`/print/year-end-notice/${publisherId}/${year}`}>年度末お知らせを印刷</Link>
          </li>
        )}
      </ul>

      <h2 style={{ fontSize: 15, marginTop: 24, marginBottom: 8 }}>会衆の帳票</h2>
      <p className="reports-hint">年度・集計パターンを選んで印刷してください（伝道者記録と同じ書式に集計値を差し込みます）。</p>
      <div className="date-nav">
        <label>
          年度
          <select value={summaryYear} onChange={(e) => setSummaryYear(Number(e.target.value))}>
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}年度
              </option>
            ))}
          </select>
        </label>
        <label>
          集計パターン
          <select value={summaryPattern} onChange={(e) => setSummaryPattern(e.target.value as SummaryPattern)}>
            {SUMMARY_PATTERNS.map((p) => (
              <option key={p} value={p}>
                {PATTERN_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className="reports-list">
        <li>
          <Link to={`/print/congregation-summary/${summaryYear}/${summaryPattern}`}>
            {PATTERN_LABELS[summaryPattern]}を印刷
          </Link>
        </li>
      </ul>
    </div>
  )
}
