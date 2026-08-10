// Excelの名簿シートは短縮コード(伝/開/特開/野宣/不/長/援)で立場・資格を持っていることがあるため、
// フルネーム表記(伝道者/正規開拓者 等)と短縮コードの両方を受け付けて正規化する。

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// "1955-02-19", "1955/2/19", "1955年2月19日", "1955-02-19 00:00:00" などを YYYY-MM-DD に正規化
export function parseFlexibleDate(raw: string | undefined): string | null {
  const s = raw?.trim()
  if (!s) return null
  const withoutTime = s.replace(/\s+\d{1,2}:\d{2}(:\d{2})?$/, '')
  const slashMatch = withoutTime.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (slashMatch) {
    const [, y, m, d] = slashMatch
    return `${y}-${pad2(Number(m))}-${pad2(Number(d))}`
  }
  const jpMatch = withoutTime.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (jpMatch) {
    const [, y, m, d] = jpMatch
    return `${y}-${pad2(Number(m))}-${pad2(Number(d))}`
  }
  return null
}

// "2024/9", "2024-09", "2024年9月", または完全な日付の先頭2つを使い、年月のみ YYYY-MM-01 に正規化
export function parseFlexibleYearMonth(raw: string | undefined): string | null {
  const s = raw?.trim()
  if (!s) return null
  const ymMatch = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?/)
  if (ymMatch) {
    const [, y, m] = ymMatch
    return `${y}-${pad2(Number(m))}-01`
  }
  const jpMatch = s.match(/^(\d{4})年(\d{1,2})月/)
  if (jpMatch) {
    const [, y, m] = jpMatch
    return `${y}-${pad2(Number(m))}-01`
  }
  return null
}

export function mapGender(raw: string | undefined): '男性' | '女性' | null {
  const s = raw?.trim()
  if (s === '男性' || s === '男') return '男性'
  if (s === '女性' || s === '女') return '女性'
  return null
}

export function mapDedication(raw: string | undefined): '兄弟' | '姉妹' | null {
  const s = raw?.trim()
  if (s === '兄弟') return '兄弟'
  if (s === '姉妹') return '姉妹'
  return null
}

export function mapHope(raw: string | undefined): 'ほかの羊' | '天に行く者' | null {
  const s = raw?.trim()
  if (s === 'ほかの羊') return 'ほかの羊'
  if (s === '天に行く者' || s === '油そそがれた者') return '天に行く者'
  return null
}

export function mapQualification(raw: string | undefined): '長老' | '援助奉仕者' | null {
  const s = raw?.trim()
  if (s === '長老' || s === '長') return '長老'
  if (s === '援助奉仕者' || s === '援') return '援助奉仕者'
  return null
}

const PIONEER_STATUS_ALIASES: Record<string, string> = {
  伝: '伝道者',
  伝道者: '伝道者',
  補: '補助開拓者',
  補助開拓者: '補助開拓者',
  開: '正規開拓者',
  正規開拓者: '正規開拓者',
  特開: '特別開拓者',
  特別開拓者: '特別開拓者',
  野宣: '野外の宣教者',
  野外の宣教者: '野外の宣教者',
  不: '不活発者',
  不活発者: '不活発者',
}

export function mapPioneerStatus(raw: string | undefined): string | null {
  const s = raw?.trim()
  if (!s) return null
  return PIONEER_STATUS_ALIASES[s] ?? null
}
