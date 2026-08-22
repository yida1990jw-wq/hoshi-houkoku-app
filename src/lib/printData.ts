import { supabase } from './supabaseClient'
import { PIONEER_TARGET_STATUSES, type Group, type Publisher, type ServiceReport } from '../types/domain'
import { SERVICE_YEAR_MONTHS } from './serviceYear'

export interface PublisherYearData {
  publisher: Publisher
  group: Group | null
  year: number
  months: Array<{ month: number; report: ServiceReport | null }>
}

export async function fetchPublisherYearData(publisherId: string, year: number): Promise<PublisherYearData> {
  const [{ data: publisher, error: pubError }, { data: reports, error: reportError }] = await Promise.all([
    supabase.from('publishers').select('*').eq('id', publisherId).returns<Publisher[]>().single(),
    supabase
      .from('service_reports')
      .select('*')
      .eq('publisher_id', publisherId)
      .eq('year', year)
      .returns<ServiceReport[]>(),
  ])
  if (pubError) throw pubError
  if (reportError) throw reportError
  if (!publisher) throw new Error('伝道者が見つかりませんでした')

  let group: Group | null = null
  if (publisher.group_id) {
    const { data, error } = await supabase.from('groups').select('*').eq('id', publisher.group_id).returns<Group[]>().single()
    if (error) throw error
    group = data
  }

  const months = SERVICE_YEAR_MONTHS.map((month) => ({
    month,
    report: (reports ?? []).find((r) => r.month === month) ?? null,
  }))

  return { publisher, group, year, months }
}

export interface PublisherCardYearBlock {
  year: number
  months: Array<{ month: number; report: ServiceReport | null }>
}

export interface PublisherCardData {
  publisher: Publisher
  blocks: [PublisherCardYearBlock, PublisherCardYearBlock]
}

// 「会衆の伝道者記録」(S-21相当)は1枚のカードに連続する2つの奉仕年度を並べて表示する。
// 選択した年度(selectedYear)を下段に、その前の奉仕年度を上段に表示する
export async function fetchPublisherCardData(publisherId: string, selectedYear: number): Promise<PublisherCardData> {
  const previousYear = selectedYear - 1
  const [{ data: publisher, error: pubError }, { data: reports, error: reportError }] = await Promise.all([
    supabase.from('publishers').select('*').eq('id', publisherId).returns<Publisher[]>().single(),
    supabase
      .from('service_reports')
      .select('*')
      .eq('publisher_id', publisherId)
      .in('year', [previousYear, selectedYear])
      .returns<ServiceReport[]>(),
  ])
  if (pubError) throw pubError
  if (reportError) throw reportError
  if (!publisher) throw new Error('伝道者が見つかりませんでした')

  const blocks = [previousYear, selectedYear].map((year) => ({
    year,
    months: SERVICE_YEAR_MONTHS.map((month) => ({
      month,
      report: (reports ?? []).find((r) => r.year === year && r.month === month) ?? null,
    })),
  })) as [PublisherCardYearBlock, PublisherCardYearBlock]

  return { publisher, blocks }
}

// 伝道者記録の一括出力の対象。開拓者(正規・特別・野外の宣教者)はグループ横断で1つにまとめ、
// 各グループはそれ以外の在籍者(伝道者・補助開拓者など)を対象にする。
// 補助開拓は特定の月だけの designation なので、名簿上の所属グループ側に含める
export type PublisherCardsScope = { kind: 'pioneers' } | { kind: 'group'; groupId: string }

export interface PublisherCardsData {
  label: string
  cards: PublisherCardData[]
}

function isPioneer(publisher: Publisher) {
  return (PIONEER_TARGET_STATUSES as readonly string[]).includes(publisher.pioneer_status)
}

export async function fetchPublisherCardsData(
  scope: PublisherCardsScope,
  selectedYear: number,
): Promise<PublisherCardsData> {
  const previousYear = selectedYear - 1

  const query = supabase.from('publishers').select('*').eq('is_active', true)
  const { data: rows, error } = await (scope.kind === 'group' ? query.eq('group_id', scope.groupId) : query).returns<
    Publisher[]
  >()
  if (error) throw error

  // 開拓者はグループ側の帳票に重複して出さない
  const publishers = (rows ?? [])
    .filter((p) => (scope.kind === 'pioneers' ? isPioneer(p) : !isPioneer(p)))
    .sort((a, b) => (a.romaji ?? '').localeCompare(b.romaji ?? ''))

  let label = '開拓者'
  if (scope.kind === 'group') {
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('*')
      .eq('id', scope.groupId)
      .returns<Group[]>()
      .single()
    if (groupError) throw groupError
    label = group?.name ?? 'グループ'
  }

  if (publishers.length === 0) return { label, cards: [] }

  // Supabaseは1クエリ最大1000件しか返さないため、年度ごとに分けて取得する
  // (22人×12ヶ月=264件/年度なので余裕はあるが、人数が増えても壊れないようにしておく)
  const ids = publishers.map((p) => p.id)
  const perYear = await Promise.all(
    [previousYear, selectedYear].map((year) =>
      supabase
        .from('service_reports')
        .select('*')
        .in('publisher_id', ids)
        .eq('year', year)
        .returns<ServiceReport[]>()
        .then(({ data, error: reportError }) => {
          if (reportError) throw reportError
          return data ?? []
        }),
    ),
  )
  const reports = perYear.flat()

  const cards = publishers.map((publisher) => ({
    publisher,
    blocks: [previousYear, selectedYear].map((year) => ({
      year,
      months: SERVICE_YEAR_MONTHS.map((month) => ({
        month,
        report: reports.find((r) => r.publisher_id === publisher.id && r.year === year && r.month === month) ?? null,
      })),
    })) as [PublisherCardYearBlock, PublisherCardYearBlock],
  }))

  return { label, cards }
}

// 「会衆集計」(伝道者記録と同じS-21相当PDFを使う版)の4パターン。
// 「伝道者」は報告時点のスナップショットが伝道者の人だけを指すため、名簿上の伝道者数とは一致しない
// (その月だけ補助開拓者だった人はそちらのバケットに入るため)
export const SUMMARY_PATTERNS = ['会衆', '正開特開宣教者', '補助開拓者', '伝道者'] as const
export type SummaryPattern = (typeof SUMMARY_PATTERNS)[number]

const SUMMARY_PATTERN_LABELS: Record<SummaryPattern, string> = {
  会衆: '会衆',
  正開特開宣教者: '正開、特開、宣教者',
  補助開拓者: '補助開拓者',
  伝道者: '伝道者',
}

function matchesSummaryPattern(report: ServiceReport, pattern: SummaryPattern): boolean {
  // 転入前の記録などnoCountが立った報告は、本人の伝道者記録には残すがどの集計パターンにも含めない
  if (report.no_count) return false
  switch (pattern) {
    case '会衆':
      return true
    case '正開特開宣教者':
      return ['正規開拓者', '特別開拓者', '野外の宣教者'].includes(report.pioneer_status_snapshot)
    case '補助開拓者':
      return report.pioneer_status_snapshot === '補助開拓者'
    case '伝道者':
      return report.pioneer_status_snapshot === '伝道者'
  }
}

export interface SummaryMonthData {
  month: number
  count: number
  studies: number
  hours: number
}

export interface SummaryCardYearBlock {
  year: number
  months: SummaryMonthData[]
}

export interface CongregationSummaryCardData {
  label: string
  blocks: [SummaryCardYearBlock, SummaryCardYearBlock]
}

// 伝道者記録と同じS-21相当PDFに、個人の代わりに集計値を差し込む版。
// 選択した年度(selectedYear)を下段に、その前の奉仕年度を上段に表示する
export async function fetchCongregationSummaryCardData(
  selectedYear: number,
  pattern: SummaryPattern,
): Promise<CongregationSummaryCardData> {
  const previousYear = selectedYear - 1
  // 会衆全体×2年度分は1000件近く/超えうるため、Supabaseのデフォルト行数上限(1000件)による
  // 取得漏れを避けるべく年度ごとに分けて取得する(1年度分なら在籍者数的に上限内に収まる)
  const [{ data: previousYearReports, error: previousYearError }, { data: selectedYearReports, error: selectedYearError }] =
    await Promise.all(
      // counted_in_year で他の年度から回ってくる分も拾う(前年度8月→当年度9月への付け替えなど)
      [previousYear, selectedYear].map((y) =>
        supabase
          .from('service_reports')
          .select('*')
          .or(`year.eq.${y},counted_in_year.eq.${y}`)
          .returns<ServiceReport[]>(),
      ),
    )
  if (previousYearError) throw previousYearError
  if (selectedYearError) throw selectedYearError
  // 2つのクエリは範囲が重なりうる(付け替えで両方に現れる行がある)ため、idで重複を除く
  const reports = [...(previousYearReports ?? []), ...(selectedYearReports ?? [])].filter(
    (r, i, all) => all.findIndex((x) => x.id === r.id) === i,
  )

  const matching = reports.filter((r) => matchesSummaryPattern(r, pattern))

  const blocks = [previousYear, selectedYear].map((year) => ({
    year,
    months: SERVICE_YEAR_MONTHS.map((month) => {
      // 会衆集計で数える月は counted_in_* が優先される。確定後に遅れて提出された報告を
      // 翌月に加算するための指定で、伝道者記録側(year/month)には影響しない
      const monthReports = matching.filter(
        (r) => (r.counted_in_year ?? r.year) === year && (r.counted_in_month ?? r.month) === month,
      )
      return {
        month,
        // 「報告の数」は行数ではなく人数で数える。付け替えにより同じ人の行が
        // 同じ月に2つ(その月の分と、前月から回ってきた分)入りうるため、1名として数える。
        // 付け替えが無ければ(伝道者,年度,月)は一意なので、従来の行数と同じ結果になる
        count: new Set(monthReports.map((r) => r.publisher_id)).size,
        studies: monthReports.reduce((sum, r) => sum + r.bible_studies, 0),
        hours: monthReports.reduce((sum, r) => sum + r.hours, 0),
      }
    }),
  })) as [SummaryCardYearBlock, SummaryCardYearBlock]

  return { label: SUMMARY_PATTERN_LABELS[pattern], blocks }
}
