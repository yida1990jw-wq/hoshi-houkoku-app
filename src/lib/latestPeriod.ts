import { supabase } from './supabaseClient'
import { SERVICE_YEAR_MONTHS } from './serviceYear'

const MONTH_ORDER: readonly number[] = SERVICE_YEAR_MONTHS

// アプリ起動時、年度・月の選択がまだ何も保存されていない場合に、
// 「今日の実際の日付」ではなく「実際に登録されている最新の報告の月」を初期値にするための取得関数。
// 過去データの一括入力中などは、今日の日付よりも登録済みデータの方が実用的な初期値になるため。
export async function fetchLatestReportedPeriod(): Promise<{ year: number; month: number } | null> {
  // service_reportsは66名×2年以上で1000件を超えうるため、
  // 「year, monthを全件取得してJS側で集計」だとSupabaseのデフォルト行数上限(1000件)に
  // 引っかかり取得漏れが起きる。まず最新の年度だけを1件取得し、
  // その年度内の月だけを取得する2段階クエリにすることで、1回の取得件数を最大でも
  // 1年度分(1000件未満)に抑える。
  const { data: yearRows, error: yearError } = await supabase
    .from('service_reports')
    .select('year')
    .order('year', { ascending: false })
    .limit(1)
  if (yearError) throw yearError
  if (!yearRows || yearRows.length === 0) return null
  const year = yearRows[0].year

  const { data: monthRows, error: monthError } = await supabase.from('service_reports').select('month').eq('year', year)
  if (monthError) throw monthError
  if (!monthRows || monthRows.length === 0) return null

  const month = monthRows.reduce(
    (latestMonth, r) => (MONTH_ORDER.indexOf(r.month) > MONTH_ORDER.indexOf(latestMonth) ? r.month : latestMonth),
    monthRows[0].month,
  )

  return { year, month }
}

export async function fetchLatestReportedYear(): Promise<number | null> {
  const latest = await fetchLatestReportedPeriod()
  return latest?.year ?? null
}
