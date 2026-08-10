// 「会衆の伝道者記録」(S-21相当)の日付表記に合わせるための整形関数群

export function formatJapaneseDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${y}年${m}月${d}日`
}

export function yearsSince(iso: string | null, today = new Date()): number | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  let years = today.getFullYear() - y
  const hasHadAnniversaryThisYear = today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d)
  if (!hasHadAnniversaryThisYear) years -= 1
  return years
}

// 例: 2008-04-23 -> '08/4/23 (資格取得日の表記)
export function formatShortQualDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const shortYear = String(y).slice(-2)
  return `'${shortYear}/${m}/${d}`
}

// 例: 2024-09-01 -> '24/9 (開拓開始日など、年月だけの表記)
export function formatShortYearMonth(iso: string | null): string {
  if (!iso) return ''
  const [y, m] = iso.split('-').map(Number)
  const shortYear = String(y).slice(-2)
  return `'${shortYear}/${m}`
}

// <input type="month"> は "YYYY-MM" を扱うため、date列(YYYY-MM-DD)と相互変換する
export function isoDateToYearMonth(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 7)
}

export function yearMonthToIsoDate(yearMonth: string): string | null {
  if (!yearMonth) return null
  return `${yearMonth}-01`
}
