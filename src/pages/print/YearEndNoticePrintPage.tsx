import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PrintToolbar } from '../../components/PrintToolbar'
import { fetchPublisherYearData, type PublisherYearData } from '../../lib/printData'
import { serviceYearLabel } from '../../lib/serviceYear'

export function YearEndNoticePrintPage() {
  const { publisherId, year } = useParams<{ publisherId: string; year: string }>()
  const [data, setData] = useState<PublisherYearData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!publisherId || !year) return
    fetchPublisherYearData(publisherId, Number(year))
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : '読み込みに失敗しました'))
      .finally(() => setLoading(false))
  }, [publisherId, year])

  if (loading) return <div className="center-message">読み込み中...</div>
  if (error) return <div className="center-message error-text">{error}</div>
  if (!data) return null

  const { publisher, months } = data
  // 年度末お知らせはあくまで個人の実績なので、no_count(会衆集計を除外する目的のフラグ)は無関係に含める
  const totalHours = months.reduce((sum, m) => sum + (m.report?.hours ?? 0), 0)
  const consideredHours = months.reduce((sum, m) => sum + (m.report?.considered_hours ?? 0), 0)
  const achieved = totalHours + consideredHours
  const target = publisher.annual_hour_target ?? 0
  const reportedMonths = months.filter((m) => m.report !== null).length
  const remainingMonths = months.length - reportedMonths
  const remainingPerMonth = remainingMonths > 0 ? Math.max(0, target - achieved) / remainingMonths : null

  return (
    <div>
      <PrintToolbar backTo="/reports" />
      <div className="print-sheet">
        <h1>年度末お知らせ</h1>
        <h2>{serviceYearLabel(data.year)}</h2>
        <p>
          氏名: {publisher.last_name} {publisher.first_name}
        </p>
        <table>
          <thead>
            <tr>
              {months.map((m) => (
                <th key={m.month}>{m.month}月</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {months.map((m) => (
                <td key={m.month}>{m.report?.hours ?? ''}</td>
              ))}
            </tr>
          </tbody>
        </table>
        <table style={{ marginTop: 16 }}>
          <tbody>
            <tr>
              <td>奉仕時間合計</td>
              <td>{totalHours}h</td>
            </tr>
            <tr>
              <td>考慮時間</td>
              <td>{consideredHours}h</td>
            </tr>
            <tr>
              <td>達成時間（奉仕時間+考慮時間）</td>
              <td>{achieved}h</td>
            </tr>
            <tr>
              <td>目標時間</td>
              <td>{target ? `${target}h` : '(未設定)'}</td>
            </tr>
            <tr>
              <td>残り{remainingMonths}ヶ月で</td>
              <td>{remainingPerMonth === null ? '年度終了' : `1ヶ月あたり残り約${Math.round(remainingPerMonth)}h`}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
