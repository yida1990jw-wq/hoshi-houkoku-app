import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { ROSTER_STATUS_ORDER, type PioneerStatus, type Publisher } from '../types/domain'

// 個人の帳票印刷ページで、戻る→選び直す を繰り返さずに済むよう、
// その場で表示対象の伝道者を切り替えられるプルダウン
export function PublisherSwitcher({
  currentId,
  buildPath,
  statuses,
}: {
  currentId: string
  buildPath: (publisherId: string) => string
  // 指定した場合、その立場の人だけを選択肢にする(例: 年度末お知らせは開拓者のみ対象)
  statuses?: readonly PioneerStatus[]
}) {
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    supabase
      .from('publishers')
      .select('*')
      .returns<Publisher[]>()
      .then(({ data }) => {
        const filtered = statuses ? (data ?? []).filter((p) => statuses.includes(p.pioneer_status)) : (data ?? [])
        const sorted = [...filtered].sort((a, b) => {
          const statusDiff = ROSTER_STATUS_ORDER.indexOf(a.pioneer_status) - ROSTER_STATUS_ORDER.indexOf(b.pioneer_status)
          return statusDiff !== 0 ? statusDiff : (a.romaji ?? '').localeCompare(b.romaji ?? '')
        })
        setPublishers(sorted)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <select value={currentId} onChange={(e) => navigate(buildPath(e.target.value))}>
      {publishers.map((p) => (
        <option key={p.id} value={p.id}>
          {p.last_name} {p.first_name}
        </option>
      ))}
    </select>
  )
}
