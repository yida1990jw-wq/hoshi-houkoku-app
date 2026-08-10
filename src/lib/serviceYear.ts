// 奉仕年度は9月始まり〜翌年8月終わり。年度番号は「年度の途中で迎える翌8月の暦年」で表す
// (例えば2025年9月〜2026年8月の期間は「2026年度」)。ドロップダウンで選んだ年度番号がそのまま
// service_reports.yearに保存され、表示時も一切変換しない(保存値=表示値)。
export const SERVICE_YEAR_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8] as const

// この関数は「まだ何も選択されていないときの初期値」と「年度ドロップダウンの選択肢の範囲」にのみ使われ、
// 保存データや集計の正しさには影響しない(実際に何年何月として保存されるかは常にドロップダウンでの選択次第)。
// そのため9〜12月の場合の年度ズレは補正せず、単純に暦年をそのまま使う。
export function currentServiceYear(date = new Date()): number {
  return date.getFullYear()
}

export function currentMonth(date = new Date()): number {
  return date.getMonth() + 1
}

export function serviceYearLabel(year: number): string {
  return `${year}年度（${year - 1}年9月〜${year}年8月）`
}
