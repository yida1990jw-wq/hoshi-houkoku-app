// 公開報告フォーム用。提出日時から自動的に「対象月」を決める。
// 会衆で使っている運用ルール(Google FormsのApps Scriptから抽出): 21日以降の提出はその月自身を、
// 20日以前の提出は前月を対象とする。奉仕年度ラベルは対象月の暦年を基準に、9〜12月ならその暦年+1、
// 1〜8月ならその暦年のまま(このアプリの service_reports.year の保存規則と同じ)。
//
// 元のApps Scriptには、1月20日以前の提出(=前年12月分)で対象月の暦年を1年多く数えてしまう不具合が
// あったため、ここでは修正済みのロジックを使う。
export function computeReportPeriod(now = new Date()): { year: number; month: number } {
  const calendarYear = now.getFullYear()
  const calendarMonth = now.getMonth() + 1
  const day = now.getDate()

  let reportMonth = day >= 21 ? calendarMonth : calendarMonth - 1
  let reportCalendarYear = calendarYear
  if (reportMonth === 0) {
    reportMonth = 12
    reportCalendarYear = calendarYear - 1
  }

  const fiscalYear = reportMonth >= 9 ? reportCalendarYear + 1 : reportCalendarYear
  return { year: fiscalYear, month: reportMonth }
}
