import { supabase } from './supabaseClient'
import { PIONEER_STATUSES, type Publisher, type ServiceReport } from '../types/domain'
import { SERVICE_YEAR_MONTHS } from './serviceYear'
import { shortfallColor } from './shortfallColor'
import { renderTablesPdf, type TableCell } from './pdfTable'

// 画面の一覧をそのままA4のPDFにする。
// 報告一覧は縦置きで1か月分(上部の立場別集計も含む)、開拓者進捗は横置きで1年度分。

const SUMMARY_STATUS_ROWS: Array<{ status: (typeof PIONEER_STATUSES)[number]; label: string }> = [
  { status: '伝道者', label: '伝' },
  { status: '補助開拓者', label: '補' },
  { status: '正規開拓者', label: '開' },
  { status: '特別開拓者', label: '特開' },
  { status: '野外の宣教者', label: '野宣' },
]

const STATUS_SHORT: Record<string, string> = {
  伝道者: '伝',
  補助開拓者: '補',
  正規開拓者: '開',
  特別開拓者: '特開',
  野外の宣教者: '野宣',
  不活発者: '不',
}

function outputNote() {
  const d = new Date()
  return `出力日 ${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

// ---- 報告一覧(縦置き・1か月分) ----

export async function buildReportListPdf(year: number, month: number): Promise<Uint8Array> {
  const [pubRes, reportRes] = await Promise.all([
    supabase.from('publishers').select('*').returns<Publisher[]>(),
    supabase.from('service_reports').select('*').eq('year', year).eq('month', month).returns<ServiceReport[]>(),
  ])
  if (pubRes.error) throw pubRes.error
  if (reportRes.error) throw reportRes.error
  const publishers = pubRes.data ?? []
  const reports = reportRes.data ?? []
  const byId = new Map(publishers.map((p) => [p.id, p]))

  // 画面と同じ並び: 立場(当時)の順 → 各々の中はローマ字順
  const sorted = [...reports].sort((a, b) => {
    const diff =
      PIONEER_STATUSES.indexOf(a.pioneer_status_snapshot as (typeof PIONEER_STATUSES)[number]) -
      PIONEER_STATUSES.indexOf(b.pioneer_status_snapshot as (typeof PIONEER_STATUSES)[number])
    if (diff !== 0) return diff
    return (byId.get(a.publisher_id)?.romaji ?? '').localeCompare(byId.get(b.publisher_id)?.romaji ?? '')
  })

  // 集計はNC(集計対象外)を除く。画面の小表と同じ計算
  const counted = reports.filter((r) => !r.no_count)
  const summaryRows = SUMMARY_STATUS_ROWS.map(({ status, label }) => {
    const m = counted.filter((r) => r.pioneer_status_snapshot === status)
    return {
      label,
      count: m.length,
      studies: m.reduce((s, r) => s + r.bible_studies, 0),
      hours: m.reduce((s, r) => s + r.hours, 0),
    }
  })
  const total = {
    count: summaryRows.reduce((s, r) => s + r.count, 0),
    studies: summaryRows.reduce((s, r) => s + r.studies, 0),
    hours: summaryRows.reduce((s, r) => s + r.hours, 0),
  }

  const summaryTable: TableCell[][] = [
    ...summaryRows.map((r) => [
      { text: r.label },
      { text: String(r.count), align: 'right' as const },
      { text: String(r.studies), align: 'right' as const },
      { text: String(r.hours), align: 'right' as const },
    ]),
    [
      { text: '合計', bold: true },
      { text: String(total.count), align: 'right' as const, bold: true },
      { text: String(total.studies), align: 'right' as const, bold: true },
      { text: String(total.hours), align: 'right' as const, bold: true },
    ],
  ]

  const rows: TableCell[][] = sorted.map((r) => {
    const p = byId.get(r.publisher_id)
    return [
      { text: p ? `${p.last_name} ${p.first_name}` : '' },
      { text: r.preached ? '○' : '×', align: 'center' },
      { text: String(r.bible_studies), align: 'right' },
      { text: r.hours > 0 ? String(r.hours) : '―', align: 'right' },
      { text: r.considered_hours > 0 ? String(r.considered_hours) : '', align: 'right' },
      { text: STATUS_SHORT[r.pioneer_status_snapshot] ?? r.pioneer_status_snapshot, align: 'center' },
      { text: r.no_count ? 'NC' : '', align: 'center' },
      { text: r.remarks ?? '' },
    ]
  })

  return renderTablesPdf({
    orientation: 'portrait',
    title: '報告一覧',
    subtitle: `${year}年度 ${month}月（${reports.length}件）`,
    note: outputNote(),
    blocks: [
      {
        caption: '立場別の集計（NCを除く）',
        widthRatio: 0.5,
        columns: [
          { header: '立場', flex: 1.2 },
          { header: '人数', flex: 1, align: 'right' },
          { header: '研究', flex: 1, align: 'right' },
          { header: '時間', flex: 1.2, align: 'right' },
        ],
        rows: summaryTable,
      },
      {
        caption: '報告',
        zebra: true,
        columns: [
          { header: '氏名', flex: 3.4 },
          { header: '宣教', flex: 1 },
          { header: '研究', flex: 1 },
          { header: '時間', flex: 1.1 },
          { header: '考慮', flex: 1 },
          { header: '立場', flex: 1 },
          { header: 'NC', flex: 0.8 },
          { header: '備考', flex: 5.5 },
        ],
        rows,
      },
    ],
  })
}

// ---- 開拓者進捗(横置き・1年度分) ----

const PIONEER_TYPES = ['補助開拓者', '正規開拓者', '特別開拓者', '野外の宣教者']

export async function buildPioneerProgressPdf(year: number): Promise<Uint8Array> {
  const [pubRes, reportRes] = await Promise.all([
    supabase
      .from('publishers')
      .select('*')
      .in('pioneer_status', PIONEER_TYPES)
      .eq('is_active', true)
      .order('romaji')
      .returns<Publisher[]>(),
    supabase.from('service_reports').select('*').eq('year', year).returns<ServiceReport[]>(),
  ])
  if (pubRes.error) throw pubRes.error
  if (reportRes.error) throw reportRes.error
  const publishers = pubRes.data ?? []
  const reports = reportRes.data ?? []

  const rows: TableCell[][] = publishers.map((p) => {
    // 開拓者進捗は個人の実績なので、画面と同じくNCも含める
    const monthly = SERVICE_YEAR_MONTHS.map((m) => {
      const r = reports.find((rep) => rep.publisher_id === p.id && rep.month === m)
      return r?.hours ?? null
    })
    const considered = reports
      .filter((r) => r.publisher_id === p.id)
      .reduce((s, r) => s + r.considered_hours, 0)
    const reported = monthly.filter((h) => h !== null) as number[]
    const total = reported.reduce((s, h) => s + h, 0)
    const average = reported.length > 0 ? total / reported.length : 0
    const achieved = total + considered
    const target = p.annual_hour_target ?? 0
    const remainingMonths = monthly.filter((h) => h === null).length
    const remainingPerMonth = remainingMonths > 0 ? (target - achieved) / remainingMonths : null

    const monthlyTarget = p.monthly_hour_target
    const cumulativeRequired = monthlyTarget ? monthlyTarget * reported.length : 0
    const achievedColor = monthlyTarget ? shortfallColor(cumulativeRequired - achieved, cumulativeRequired * 0.5) : undefined
    const remainingColor =
      monthlyTarget && remainingPerMonth !== null
        ? shortfallColor(remainingPerMonth - monthlyTarget, monthlyTarget * 0.5)
        : undefined

    return [
      { text: `${p.last_name} ${p.first_name}` },
      ...monthly.map((h) => ({
        text: h === null ? '' : String(h),
        align: 'right' as const,
        bg: h === null || !monthlyTarget ? undefined : shortfallColor(monthlyTarget - h, monthlyTarget * 0.5),
      })),
      { text: String(total), align: 'right' as const, bold: true },
      { text: average > 0 ? average.toFixed(1) : '', align: 'right' as const },
      { text: considered > 0 ? String(considered) : '', align: 'right' as const },
      { text: String(achieved), align: 'right' as const, bg: achievedColor, bold: true },
      { text: target > 0 ? String(target) : '', align: 'right' as const },
      {
        text: remainingPerMonth === null ? '' : remainingPerMonth.toFixed(1),
        align: 'right' as const,
        bg: remainingColor,
      },
    ]
  })

  return renderTablesPdf({
    orientation: 'landscape',
    title: '開拓者進捗',
    subtitle: `${year}年度（${publishers.length}名）`,
    note: outputNote(),
    blocks: [
      {
        zebra: true,
        columns: [
          { header: '氏名', flex: 3 },
          ...SERVICE_YEAR_MONTHS.map((m) => ({ header: `${m}月`, flex: 1, align: 'right' as const })),
          { header: '合計', flex: 1.3, align: 'right' as const },
          { header: '月平均', flex: 1.3, align: 'right' as const },
          { header: '考慮', flex: 1.2, align: 'right' as const },
          { header: '達成時間', flex: 1.5, align: 'right' as const },
          { header: '目標', flex: 1.2, align: 'right' as const },
          { header: '残り/月', flex: 1.4, align: 'right' as const },
        ],
        rows,
      },
    ],
  })
}
