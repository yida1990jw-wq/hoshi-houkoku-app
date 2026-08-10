import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Publisher, ServiceReport } from '../types/domain'
import { currentServiceYear, SERVICE_YEAR_MONTHS } from '../lib/serviceYear'
import { useSessionPersistedState } from '../lib/usePersistedState'
import { fetchLatestReportedYear } from '../lib/latestPeriod'

const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => currentServiceYear() - 2 + i)
const PIONEER_TYPES = ['補助開拓者', '正規開拓者', '特別開拓者', '野外の宣教者']

export function PioneerProgressPage() {
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [reports, setReports] = useState<ServiceReport[]>([])
  const [year, setYear] = useSessionPersistedState('pioneerProgress.year', currentServiceYear())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // このタブ(セッション)でまだ年度を選んでいない場合だけ、今日の日付ではなく登録済みの最新年度を初期値にする
    if (sessionStorage.getItem('pioneerProgress.year') !== null) return
    fetchLatestReportedYear()
      .then((latestYear) => {
        if (latestYear !== null) setYear(latestYear)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // 起動直後にfetchLatestReportedYearの結果でyearが変わると、古いyearでの取得が
    // 後から解決して新しい結果を上書きしてしまうことがあるため、
    // 該当のeffect実行が最新でなくなった場合は結果を反映しない
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase
        .from('publishers')
        .select('*')
        .in('pioneer_status', PIONEER_TYPES)
        .eq('is_active', true)
        .order('romaji')
        .returns<Publisher[]>(),
      // service_reports.year は奉仕年度ラベル(9月〜翌8月の全12ヶ月に同じ値)を保持しているため、
      // 年度で一致させるだけで対象期間の報告が全て取得できる
      supabase.from('service_reports').select('*').eq('year', year).returns<ServiceReport[]>(),
    ])
      .then(([pubRes, reportRes]) => {
        if (cancelled) return
        if (pubRes.error) throw pubRes.error
        if (reportRes.error) throw reportRes.error
        setPublishers(pubRes.data ?? [])
        setReports(reportRes.data ?? [])
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
  }, [year])

  const rows = useMemo(() => {
    // 開拓者進捗はあくまで個人の実績なので、no_count(会衆集計を除外する目的のフラグ)は無関係に含める
    return publishers.map((p) => {
      const monthlyHours = SERVICE_YEAR_MONTHS.map((m) => {
        const r = reports.find((rep) => rep.publisher_id === p.id && rep.year === year && rep.month === m)
        return r?.hours ?? null
      })
      const consideredTotal = reports
        .filter((r) => r.publisher_id === p.id && r.year === year)
        .reduce((sum, r) => sum + r.considered_hours, 0)
      const reportedMonths = monthlyHours.filter((h) => h !== null) as number[]
      const total = reportedMonths.reduce((sum, h) => sum + h, 0)
      const monthlyAverage = reportedMonths.length > 0 ? total / reportedMonths.length : 0
      const achieved = total + consideredTotal
      const target = p.annual_hour_target ?? 0
      const remainingMonths = monthlyHours.filter((h) => h === null).length
      const remainingPerMonth = remainingMonths > 0 ? (target - achieved) / remainingMonths : null

      return { publisher: p, monthlyHours, total, monthlyAverage, consideredTotal, achieved, target, remainingPerMonth }
    })
  }, [publishers, reports, year])

  if (loading) return <div className="center-message">読み込み中...</div>

  return (
    <div className="page">
      <div className="page-header">
        <h1>開拓者進捗</h1>
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
      </div>
      {error && <p className="error-text">{error}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table className="crud-table">
          <thead>
            <tr>
              <th>氏名</th>
              {SERVICE_YEAR_MONTHS.map((m) => (
                <th key={m}>{m}月</th>
              ))}
              <th>合計</th>
              <th>月平均</th>
              <th>考慮</th>
              <th>達成時間</th>
              <th>目標</th>
              <th>残り/月</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ publisher, monthlyHours, total, monthlyAverage, consideredTotal, achieved, target, remainingPerMonth }) => (
              <tr key={publisher.id}>
                <td>
                  {publisher.last_name} {publisher.first_name}
                </td>
                {monthlyHours.map((h, i) => (
                  <td key={i}>{h ?? ''}</td>
                ))}
                <td>{total}</td>
                <td>{monthlyAverage.toFixed(1)}</td>
                <td>{consideredTotal}</td>
                <td>{achieved}</td>
                <td>{target || ''}</td>
                <td>{remainingPerMonth === null ? '年度終了' : Math.round(remainingPerMonth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
